import {FormEvent, useEffect, useMemo, useRef, useState} from "react";
import {ethers} from "ethers";

import {CONTRACTS, ERC20_ABI, POOL_ABI, POOL_DEPLOY_BLOCK, POSEIDON_ABI, SEPOLIA} from "./config";
import {deriveOwnerPk, deriveUserKeys, keySeedFromPrivateKey, viewingPrivToPub} from "./keys";
import {executePrivateTransfer, executeUnshield} from "./privateTransfer";
import {scanShieldedNotes} from "./shielded";
import type {DecryptedNote} from "./shielded";
import {clearVault, readVaultMeta, storePrivateKey, unlockPrivateKey} from "./storage";

type ImportedToken = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
};

type PrivateTokenBalance = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  spendableNotes: number;
  spendableAmount: string;
};

type ScanCache = {
  viewingPub: `0x${string}`;
  lastScannedBlock: number;
  notes: DecryptedNote[];
};

type ScanCacheJson = {
  viewingPub: `0x${string}`;
  lastScannedBlock: number;
  notes: Array<{
    commitment: `0x${string}`;
    amount: string;
    blinding: `0x${string}`;
    token: `0x${string}`;
    txHash: `0x${string}`;
  }>;
};

const IMPORTED_TOKENS_KEY = "shielded.importedTokens.v1";
const SCAN_CACHE_PREFIX = "shielded.scanCache.v2";

function fmt(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function toHex32(v: bigint): `0x${string}` {
  return ethers.zeroPadValue(ethers.toBeHex(v), 32) as `0x${string}`;
}

function normalizeTokenField(tokenLike: string): string | null {
  try {
    return ethers.zeroPadValue(tokenLike as `0x${string}`, 32).toLowerCase();
  } catch {
    return null;
  }
}

function routeForRecipient(viewingPubHex: `0x${string}`, subchannelId: number) {
  const channel = ethers.keccak256(viewingPubHex);
  const subchannel = ethers.solidityPackedKeccak256(["bytes32", "uint64"], [channel, BigInt(subchannelId)]);
  return {channel, subchannel};
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return Uint8Array.from(data).buffer;
}

async function hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length = 32): Promise<Uint8Array> {
  const ikmBuf = toArrayBuffer(ikm);
  const saltBuf = toArrayBuffer(salt);
  const infoBuf = toArrayBuffer(info);
  const key = await crypto.subtle.importKey("raw", ikmBuf, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({name: "HKDF", hash: "SHA-256", salt: saltBuf, info: infoBuf}, key, length * 8);
  return new Uint8Array(bits);
}

async function encryptNoteECDH(note: object, recipientViewingPubHex: `0x${string}`): Promise<`0x${string}`> {
  const ephWallet = ethers.Wallet.createRandom();
  const sharedSecretHex = ephWallet.signingKey.computeSharedSecret(recipientViewingPubHex);
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await hkdfSha256(
    ethers.getBytes(sharedSecretHex as `0x${string}`),
    salt,
    new TextEncoder().encode("zkproject-note-v1"),
    32
  );
  const keyBuf = toArrayBuffer(key);
  const cryptoKey = await crypto.subtle.importKey("raw", keyBuf, "AES-GCM", false, ["encrypt"]);
  const plaintext = new TextEncoder().encode(JSON.stringify(note));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({name: "AES-GCM", iv}, cryptoKey, plaintext));
  const ct = encrypted.slice(0, encrypted.length - 16);
  const tag = encrypted.slice(encrypted.length - 16);
  const envelope = {
    v: 1,
    eph: ephWallet.signingKey.compressedPublicKey,
    salt: ethers.hexlify(salt),
    iv: ethers.hexlify(iv),
    ct: ethers.hexlify(ct),
    tag: ethers.hexlify(tag),
  };
  return ethers.hexlify(ethers.toUtf8Bytes(JSON.stringify(envelope))) as `0x${string}`;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRelayerConfirmation(relayerUrl: string, requestId: string, timeoutMs = 300000, pollMs = 3000) {
  const started = Date.now();
  let transientErrors = 0;
  while (Date.now() - started < timeoutMs) {
    let res: Response;
    try {
      res = await fetch(`${relayerUrl}/relay/status/${requestId}`);
    } catch (error) {
      transientErrors += 1;
      if (transientErrors % 5 === 1) {
        // Surface intermittent relayer/socket hiccups without failing the full flow.
        console.warn(`Relayer status poll transient network error (${transientErrors}):`, error);
      }
      await sleep(pollMs);
      continue;
    }
    let payload: any;
    try {
      payload = await res.json();
    } catch {
      transientErrors += 1;
      if (transientErrors % 5 === 1) {
        console.warn(`Relayer status poll returned non-JSON payload (${transientErrors}).`);
      }
      await sleep(pollMs);
      continue;
    }
    if (!res.ok) {
      if (res.status >= 500) {
        transientErrors += 1;
        if (transientErrors % 5 === 1) {
          console.warn(`Relayer status transient server error (${res.status}) (${transientErrors}).`);
        }
        await sleep(pollMs);
        continue;
      }
      throw new Error(`Relayer status failed (${res.status}): ${payload?.error || "unknown error"}`);
    }
    transientErrors = 0;
    if (payload.status === "confirmed") return payload;
    if (payload.status === "failed" || payload.status === "timeout") {
      const txHint = payload?.txHash ? ` tx=${payload.txHash}` : "";
      const blockHint = payload?.blockNumber ? ` block=${payload.blockNumber}` : "";
      const debugHint = payload?.debug ? ` debug=${JSON.stringify(payload.debug)}` : "";
      throw new Error(`Relayer request failed: ${payload.error || payload.status}.${txHint}${blockHint}${debugHint}`);
    }
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for relayer confirmation (requestId=${requestId})`);
}

function loadImportedTokens(): ImportedToken[] {
  const raw = localStorage.getItem(IMPORTED_TOKENS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ImportedToken[];
    return parsed.filter((t) => ethers.isAddress(t.address));
  } catch {
    return [];
  }
}

function persistImportedTokens(tokens: ImportedToken[]) {
  localStorage.setItem(IMPORTED_TOKENS_KEY, JSON.stringify(tokens));
}

function scanCacheKey(viewingPub: `0x${string}`) {
  return `${SCAN_CACHE_PREFIX}:${SEPOLIA.chainId}:${CONTRACTS.pool.toLowerCase()}:${viewingPub.toLowerCase()}`;
}

function readScanCache(viewingPub: `0x${string}`): ScanCache | null {
  const raw = localStorage.getItem(scanCacheKey(viewingPub));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ScanCacheJson;
    return {
      viewingPub: parsed.viewingPub,
      lastScannedBlock: parsed.lastScannedBlock,
      notes: parsed.notes.map((n) => ({
        commitment: n.commitment,
        amount: BigInt(n.amount),
        blinding: n.blinding,
        token: n.token,
        txHash: n.txHash,
      })),
    };
  } catch {
    return null;
  }
}

function writeScanCache(cache: ScanCache) {
  const asJson: ScanCacheJson = {
    viewingPub: cache.viewingPub,
    lastScannedBlock: cache.lastScannedBlock,
    notes: cache.notes.map((n) => ({
      commitment: n.commitment,
      amount: n.amount.toString(),
      blinding: n.blinding,
      token: n.token,
      txHash: n.txHash,
    })),
  };
  localStorage.setItem(scanCacheKey(cache.viewingPub), JSON.stringify(asJson));
}

function clearAllScanCache() {
  const keysToDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(SCAN_CACHE_PREFIX)) keysToDelete.push(key);
  }
  for (const key of keysToDelete) localStorage.removeItem(key);
}

export default function App() {
  const provider = useMemo(() => new ethers.JsonRpcProvider(SEPOLIA.rpcUrl, SEPOLIA.chainId), []);
  const [onboardingMode, setOnboardingMode] = useState<"create" | "import_phrase" | "import_pk">("create");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [seedPhrase, setSeedPhrase] = useState("");
  const [seedPassphrase, setSeedPassphrase] = useState("");
  const [newWalletPhrase, setNewWalletPhrase] = useState("");
  const [wallet, setWallet] = useState<ethers.Wallet | null>(null);
  const [showSensitiveKeys, setShowSensitiveKeys] = useState(false);
  const [derivedKeys, setDerivedKeys] = useState<{
    ownerPk: string;
    spendingKey: string;
    viewingPriv: string;
    viewingPub: string;
    feeRecipientPk: string;
  } | null>(null);
  const [publicEth, setPublicEth] = useState("0");
  const [publicToken, setPublicToken] = useState("0");
  const [tokenSymbol, setTokenSymbol] = useState("TOKEN");
  const [tokenDecimals, setTokenDecimals] = useState(18);
  const [selectedToken, setSelectedToken] = useState<`0x${string}`>(CONTRACTS.token as `0x${string}`);
  const [importedTokens, setImportedTokens] = useState<ImportedToken[]>([]);
  const [newTokenAddress, setNewTokenAddress] = useState("");
  const [shieldedSpendable, setShieldedSpendable] = useState("0");
  const [shieldedNotes, setShieldedNotes] = useState(0);
  const [privateBalances, setPrivateBalances] = useState<PrivateTokenBalance[]>([]);
  const [shieldAmount, setShieldAmount] = useState("");
  const [unshieldAmount, setUnshieldAmount] = useState("");
  const [unshieldToMode, setUnshieldToMode] = useState<"self" | "custom">("self");
  const [unshieldRecipient, setUnshieldRecipient] = useState("");
  const [status, setStatus] = useState("Ready");
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendAsset, setSendAsset] = useState<"eth" | "token">("token");
  const [sendMode, setSendMode] = useState<"public" | "private">("public");
  const [recipientOwnerPk, setRecipientOwnerPk] = useState("");
  const [recipientViewingPub, setRecipientViewingPub] = useState("");
  const [relayerUrl, setRelayerUrl] = useState("http://127.0.0.1:8787");
  const actionRunId = useRef(0);
  const isActionRunning = (label: string) => activeAction === label;

  async function runAction(
    label: string,
    action: () => Promise<void>,
    errorPrefix: string,
    timeoutMs = 60000
  ) {
    const runId = ++actionRunId.current;
    setActiveAction(label);
    setStatus(`${label}...`);
    try {
      await Promise.race([
        action(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`${label} timed out. Check network/RPC and try again.`)), timeoutMs);
        }),
      ]);
    } catch (err) {
      setStatus(`${errorPrefix}: ${String(err)}`);
    } finally {
      if (actionRunId.current === runId) {
        setActiveAction(null);
      }
    }
  }

  useEffect(() => {
    const imported = loadImportedTokens();
    const merged = [
      {
        address: CONTRACTS.token as `0x${string}`,
        symbol: "TOKEN",
        decimals: 18,
      },
      ...imported.filter((t) => t.address.toLowerCase() !== CONTRACTS.token.toLowerCase()),
    ];
    setImportedTokens(merged);
  }, []);

  useEffect(() => {
    if (!wallet) return;
    void refreshBalances(wallet);
  }, [selectedToken]);

  function deriveShieldKeyMaterial(active: ethers.Wallet) {
    const seed = keySeedFromPrivateKey(active.privateKey as `0x${string}`);
    const owner = deriveUserKeys(seed, "owner");
    const feeRecipient = deriveUserKeys(seed, "feeRecipient");
    return {owner, feeRecipient};
  }

  async function ensureDerivedKeys(active: ethers.Wallet) {
    const {owner, feeRecipient} = deriveShieldKeyMaterial(active);
    const poseidon = new ethers.Contract(CONTRACTS.poseidon, POSEIDON_ABI, provider);
    const ownerPk = await deriveOwnerPk(owner.spendingKey, poseidon);
    const feeRecipientPk = await deriveOwnerPk(feeRecipient.spendingKey, poseidon);
    setDerivedKeys({
      ownerPk: ownerPk.toString(),
      spendingKey: owner.spendingKey.toString(),
      viewingPriv: owner.viewingPriv.toString(),
      viewingPub: viewingPrivToPub(owner.viewingPriv),
      feeRecipientPk: feeRecipientPk.toString(),
    });
  }

  async function refreshBalances(active: ethers.Wallet) {
    const token = new ethers.Contract(selectedToken, ERC20_ABI, provider);
    const poseidon = new ethers.Contract(CONTRACTS.poseidon, POSEIDON_ABI, provider);
    const pool = new ethers.Contract(CONTRACTS.pool, POOL_ABI, provider);
    const [ethBal, tokenBal, symbol, decimals] = await Promise.all([
      provider.getBalance(active.address),
      token.balanceOf(active.address),
      token.symbol(),
      token.decimals(),
    ]);
    setPublicEth(ethers.formatEther(ethBal));
    setPublicToken(ethers.formatUnits(tokenBal, decimals));
    setTokenSymbol(symbol);
    setTokenDecimals(Number(decimals));

    const {owner, feeRecipient} = deriveShieldKeyMaterial(active);
    const viewingPub = viewingPrivToPub(owner.viewingPriv);
    const ownerPk = await deriveOwnerPk(owner.spendingKey, poseidon);
    const feeRecipientPk = await deriveOwnerPk(feeRecipient.spendingKey, poseidon);
    const cached = readScanCache(viewingPub);
    const cacheMatchesViewer = cached?.viewingPub === viewingPub;
    const scanFromBlock = cacheMatchesViewer
      ? Math.max(POOL_DEPLOY_BLOCK, cached.lastScannedBlock + 1)
      : POOL_DEPLOY_BLOCK;
    const scan = await scanShieldedNotes({
      provider,
      poolAddress: CONTRACTS.pool as `0x${string}`,
      fromBlock: scanFromBlock,
      viewingPriv: owner.viewingPriv,
      viewingPub,
    });
    const notes = cacheMatchesViewer ? [...(cached?.notes || []), ...scan.notes] : scan.notes;
    const dedup = new Map<string, DecryptedNote>();
    for (const n of notes) {
      dedup.set(`${n.commitment}:${n.txHash}`, n);
    }
    const mergedNotes = Array.from(dedup.values());
    const nextCache: ScanCache = {
      viewingPub,
      lastScannedBlock: scan.stats.latestBlock,
      notes: mergedNotes,
    };
    writeScanCache(nextCache);
    const selectedTokenField = ethers.zeroPadValue(selectedToken, 32).toLowerCase();
    const tokenByField = new Map<string, ImportedToken>();
    for (const t of importedTokens) {
      tokenByField.set(ethers.zeroPadValue(t.address, 32).toLowerCase(), t);
    }
    if (!tokenByField.has(selectedTokenField)) {
      tokenByField.set(selectedTokenField, {address: selectedToken, symbol: tokenSymbol, decimals: tokenDecimals});
    }
    const totalsByField = new Map<string, {amount: bigint; notes: number}>();
    const usableNotes = mergedNotes
      .map((n) => ({...n, noteTokenField: normalizeTokenField(n.token)}))
      .filter((n) => Boolean(n.commitment) && Boolean(n.noteTokenField));
    const nullifiers = await Promise.all(
      usableNotes.map(async (n) => ethers.zeroPadValue(ethers.toBeHex(await poseidon.hash_2(owner.spendingKey, BigInt(n.commitment))), 32))
    );
    const spentFlags = await Promise.all(nullifiers.map((nf) => pool.nullifierSet(nf)));

    let spendable = 0n;
    let count = 0;
    let tokenMatched = 0;
    let unspentTotal = 0;
    for (let i = 0; i < usableNotes.length; i += 1) {
      if (spentFlags[i]) continue;
      const n = usableNotes[i];
      const noteTokenField = n.noteTokenField as string;
      unspentTotal += 1;
      const curr = totalsByField.get(noteTokenField) ?? {amount: 0n, notes: 0};
      curr.amount += n.amount;
      curr.notes += 1;
      totalsByField.set(noteTokenField, curr);
      if (noteTokenField === selectedTokenField) {
        tokenMatched += 1;
        spendable += n.amount;
        count += 1;
      }
    }
    setShieldedSpendable(ethers.formatUnits(spendable, Number(decimals)));
    setShieldedNotes(count);
    const balances: PrivateTokenBalance[] = [];
    for (const [field, totals] of totalsByField.entries()) {
      const meta = tokenByField.get(field);
      if (!meta) continue;
      balances.push({
        address: meta.address,
        symbol: meta.symbol,
        decimals: meta.decimals,
        spendableNotes: totals.notes,
        spendableAmount: ethers.formatUnits(totals.amount, meta.decimals),
      });
    }
    balances.sort((a, b) => {
      if (a.address.toLowerCase() === selectedToken.toLowerCase()) return -1;
      if (b.address.toLowerCase() === selectedToken.toLowerCase()) return 1;
      return a.symbol.localeCompare(b.symbol);
    });
    setPrivateBalances(balances);
    await ensureDerivedKeys(active);
    setStatus(
      `Synced ${fmt(active.address)} | scanFrom=${scanFromBlock} logs=${scan.stats.totalLogs} decrypt=${scan.stats.decryptSuccess} discovered=${mergedNotes.length} unspent=${unspentTotal} tokenMatch=${tokenMatched} spendable=${count}`
    );
  }

  async function refreshBalancesWithRetry(active: ethers.Wallet, attempts = 3) {
    let lastErr: unknown = null;
    for (let i = 0; i < attempts; i += 1) {
      try {
        await refreshBalances(active);
        return;
      } catch (err) {
        lastErr = err;
        if (i < attempts - 1) await sleep(1500);
      }
    }
    throw lastErr;
  }

  async function onCreateWallet(e: FormEvent) {
    e.preventDefault();
    await runAction("Creating wallet", async () => {
      const generated = ethers.Wallet.createRandom();
      const next = new ethers.Wallet(generated.privateKey, provider);
      const phrase = generated.mnemonic?.phrase ?? "";
      setNewWalletPhrase(phrase);
      await storePrivateKey(next.privateKey as `0x${string}`, password, next.address as `0x${string}`);
      setWallet(next);
      setStatus(`Wallet created: ${fmt(next.address)}. Syncing balances...`);
      void runAction("Refreshing balances", async () => refreshBalancesWithRetry(next), "Refresh failed", 180000);
    }, "Failed to create wallet");
  }

  async function onImportByPhrase(e: FormEvent) {
    e.preventDefault();
    await runAction("Importing wallet from phrase", async () => {
      if (!seedPhrase.trim()) throw new Error("Seed phrase is required");
      const hd = ethers.HDNodeWallet.fromPhrase(seedPhrase.trim(), seedPassphrase || "");
      const next = new ethers.Wallet(hd.privateKey, provider);
      await storePrivateKey(next.privateKey as `0x${string}`, password, next.address as `0x${string}`);
      setWallet(next);
      setNewWalletPhrase("");
      setStatus(`Wallet imported: ${fmt(next.address)}. Syncing balances...`);
      void runAction("Refreshing balances", async () => refreshBalancesWithRetry(next), "Refresh failed", 180000);
    }, "Failed to import wallet from phrase");
  }

  async function onImportByPrivateKey(e: FormEvent) {
    e.preventDefault();
    await runAction("Importing wallet from private key", async () => {
      const normalized = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
      const next = new ethers.Wallet(normalized, provider);
      await storePrivateKey(next.privateKey as `0x${string}`, password, next.address as `0x${string}`);
      setWallet(next);
      setNewWalletPhrase("");
      setStatus(`Wallet imported: ${fmt(next.address)}. Syncing balances...`);
      void runAction("Refreshing balances", async () => refreshBalancesWithRetry(next), "Refresh failed", 180000);
    }, "Failed to import wallet from private key");
  }

  async function onUnlock(e: FormEvent) {
    e.preventDefault();
    await runAction("Unlocking wallet", async () => {
      const pk = await unlockPrivateKey(password);
      const next = new ethers.Wallet(pk, provider);
      setWallet(next);
      setStatus(`Unlocked ${fmt(next.address)}. Syncing balances...`);
      void runAction("Refreshing balances", async () => refreshBalancesWithRetry(next), "Refresh failed", 180000);
    }, "Unlock failed");
  }

  async function onImportToken(e: FormEvent) {
    e.preventDefault();
    await runAction("Importing token", async () => {
      const addr = ethers.getAddress(newTokenAddress.trim()) as `0x${string}`;
      const token = new ethers.Contract(addr, ERC20_ABI, provider);
      const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()]);
      const next = [...importedTokens.filter((t) => t.address.toLowerCase() !== addr.toLowerCase()), {address: addr, symbol, decimals: Number(decimals)}];
      setImportedTokens(next);
      persistImportedTokens(next);
      setNewTokenAddress("");
      setStatus(`Imported token ${symbol} (${addr}).`);
    }, "Failed to import token");
  }

  async function onShield(e: FormEvent) {
    e.preventDefault();
    if (!wallet) {
      setStatus("Unlock or create a wallet before shielding.");
      return;
    }
    await runAction("Shielding token", async () => {
      if (!shieldAmount || Number(shieldAmount) <= 0) throw new Error("Enter a valid amount");
      const {owner} = deriveShieldKeyMaterial(wallet);
      const viewingPub = viewingPrivToPub(owner.viewingPriv);
      const ownerPk = await deriveOwnerPk(owner.spendingKey, new ethers.Contract(CONTRACTS.poseidon, POSEIDON_ABI, provider));
      const token = new ethers.Contract(selectedToken, ERC20_ABI, wallet);
      const pool = new ethers.Contract(CONTRACTS.pool, POOL_ABI, wallet);
      const poseidon = new ethers.Contract(CONTRACTS.poseidon, POSEIDON_ABI, provider);
      const amount = ethers.parseUnits(shieldAmount, tokenDecimals);
      if (amount < 2n) {
        throw new Error("Shield amount is too small to split into two private notes. Increase amount.");
      }
      const balance = await token.balanceOf(wallet.address);
      if (balance < amount) {
        throw new Error(
          `Insufficient ${tokenSymbol} balance for shielding. Available=${ethers.formatUnits(balance, tokenDecimals)}, required=${ethers.formatUnits(amount, tokenDecimals)}`
        );
      }
      const tokenField = BigInt(ethers.zeroPadValue(selectedToken, 32));
      // Always create two notes so 2-in private transfers are possible immediately.
      const firstChunk = amount / 2n;
      const secondChunk = amount - firstChunk;
      const chunks: bigint[] = [firstChunk, secondChunk];

      const approveTx = await token.approve(CONTRACTS.pool, amount);
      setStatus(`Approve submitted: ${approveTx.hash}`);
      await approveTx.wait();
      setStatus(`Approve confirmed: ${approveTx.hash}. Submitting ${chunks.length} shield note(s)...`);
      for (let i = 0; i < chunks.length; i += 1) {
        const chunkAmount = chunks[i];
        const blinding = BigInt(ethers.randomBytes(31).reduce((acc, b) => (acc << 8n) + BigInt(b), 0n)) || 1n;
        const commitment = BigInt(await poseidon.hash([ownerPk, tokenField, chunkAmount, blinding]));
        const note = {
          owner_pk: ownerPk.toString(),
          token: toHex32(tokenField),
          amount: chunkAmount.toString(),
          blinding: toHex32(blinding),
          commitment: toHex32(commitment),
        };
        const encrypted = await encryptNoteECDH(note, viewingPub);
        const route = routeForRecipient(viewingPub, i);
        const shieldTx = await pool.shieldRouted(
          selectedToken,
          chunkAmount,
          toHex32(commitment),
          encrypted,
          route.channel,
          route.subchannel
        );
        setStatus(`Shield chunk ${i + 1}/${chunks.length} submitted: ${shieldTx.hash}`);
        await shieldTx.wait();
      }
      setShieldAmount("");
      await refreshBalancesWithRetry(wallet, 5);
      setStatus(`Shielded ${shieldAmount} ${tokenSymbol} into private balance (${chunks.length} notes).`);
    }, "Shield failed", 180000);
  }

  async function onPublicSend(e: FormEvent) {
    e.preventDefault();
    if (!wallet) return;
    if (sendMode === "private") {
      await runAction("Submitting private transfer", async () => {
        if (!sendAmount || Number(sendAmount) <= 0) throw new Error("Enter a valid private transfer amount");
        setStatus("Submitting private transfer: discovering notes and preparing proof inputs...");
        const {owner: sender, feeRecipient} = deriveShieldKeyMaterial(wallet);
        const poseidon = new ethers.Contract(CONTRACTS.poseidon, POSEIDON_ABI, provider);
        const senderOwnerPk = await deriveOwnerPk(sender.spendingKey, poseidon);
        if (!senderOwnerPk) throw new Error("Failed to derive sender owner pk");
        const senderViewingPub = viewingPrivToPub(sender.viewingPriv);
        const senderCache = readScanCache(senderViewingPub);
        const requestedAmount = ethers.parseUnits(sendAmount, tokenDecimals);
        const result = await executePrivateTransfer({
          relayerUrl,
          senderSpendingKey: sender.spendingKey,
          senderViewingPriv: sender.viewingPriv,
          senderViewingPub,
          recipientOwnerPk: BigInt(recipientOwnerPk),
          recipientViewingPub: recipientViewingPub as `0x${string}`,
          feeRecipientOwnerPk: await deriveOwnerPk(feeRecipient.spendingKey, poseidon),
          feeRecipientViewingPub: viewingPrivToPub(feeRecipient.viewingPriv),
          relayerRequestTimeoutMs: 120000,
          onStatus: (msg) => setStatus(`Submitting private transfer: ${msg}`),
          scanFromBlock: senderCache ? Math.max(POOL_DEPLOY_BLOCK, senderCache.lastScannedBlock + 1) : POOL_DEPLOY_BLOCK,
          cachedNotes: senderCache?.notes ?? [],
          maxRecipientAmount: requestedAmount,
          tokenAddress: selectedToken,
        });
        if (!result.requestId) throw new Error("Relayer did not return requestId");
        setStatus(`Submitting private transfer: waiting relayer confirmation for ${result.requestId}...`);
        await waitForRelayerConfirmation(relayerUrl, result.requestId, 300000, 3000);
        setStatus(`Private transfer confirmed. Delivered ${ethers.formatUnits(BigInt(result.recipientAmount || "0"), tokenDecimals)} ${tokenSymbol}.`);
        await refreshBalancesWithRetry(wallet);
      }, "Private transfer failed", 300000);
      return;
    }
    await runAction("Submitting public transfer", async () => {
      if (sendAsset === "eth") {
        const tx = await wallet.sendTransaction({to: sendTo, value: ethers.parseEther(sendAmount || "0")});
        await tx.wait();
      } else {
        const token = new ethers.Contract(selectedToken, ERC20_ABI, wallet);
        const tx = await token.transfer(sendTo, ethers.parseUnits(sendAmount || "0", tokenDecimals));
        await tx.wait();
      }
      await refreshBalancesWithRetry(wallet);
      setStatus("Public transfer confirmed.");
    }, "Transfer failed");
  }

  async function onUnshield(e: FormEvent) {
    e.preventDefault();
    if (!wallet) return;
    await runAction("Submitting unshield", async () => {
      if (!unshieldAmount || Number(unshieldAmount) <= 0) throw new Error("Enter a valid unshield amount");
      const recipient =
        unshieldToMode === "self"
          ? (wallet.address as `0x${string}`)
          : (ethers.getAddress(unshieldRecipient.trim()) as `0x${string}`);
      const amount = ethers.parseUnits(unshieldAmount, tokenDecimals);
      const {owner} = deriveShieldKeyMaterial(wallet);
      const senderViewingPub = viewingPrivToPub(owner.viewingPriv);
      const senderCache = readScanCache(senderViewingPub);
      setStatus("Submitting unshield: scanning notes and preparing proof...");
      const result = await executeUnshield({
        relayerUrl,
        senderSpendingKey: owner.spendingKey,
        senderViewingPriv: owner.viewingPriv,
        senderViewingPub,
        recipientAddress: recipient,
        amount,
        onStatus: (msg) => setStatus(`Submitting unshield: ${msg}`),
        scanFromBlock: senderCache ? Math.max(POOL_DEPLOY_BLOCK, senderCache.lastScannedBlock + 1) : POOL_DEPLOY_BLOCK,
        cachedNotes: senderCache?.notes ?? [],
        tokenAddress: selectedToken,
      });
      if (!result.requestId) throw new Error("Relayer did not return requestId");
      setStatus(`Submitting unshield: waiting relayer confirmation for ${result.requestId}...`);
      await waitForRelayerConfirmation(relayerUrl, result.requestId, 300000, 3000);
      setUnshieldAmount("");
      await refreshBalancesWithRetry(wallet, 5);
      setStatus(`Unshield confirmed. Sent ${unshieldAmount} ${tokenSymbol} to ${recipient}.`);
    }, "Unshield failed", 300000);
  }

  const vaultMeta = readVaultMeta();

  return (
    <main className="app">
      <h1>Shielded</h1>
      <p className="muted">Sepolia pool integrated. Public and private balances are clearly separated.</p>

      {!wallet && (
        <section className="card">
          <h2>Wallet Setup</h2>
          <label>Choose flow</label>
          <select
            value={onboardingMode}
            onChange={(e) => setOnboardingMode(e.target.value as "create" | "import_phrase" | "import_pk")}
          >
            <option value="create">Create new wallet</option>
            <option value="import_phrase">Import with seed phrase</option>
            <option value="import_pk">Import with private key</option>
          </select>

          {onboardingMode === "create" && (
            <form onSubmit={onCreateWallet}>
              <label>Vault password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="submit" disabled={isActionRunning("Creating wallet")}>
                {isActionRunning("Creating wallet") ? "Creating..." : "Create Wallet"}
              </button>
            </form>
          )}

          {onboardingMode === "import_phrase" && (
            <form onSubmit={onImportByPhrase}>
              <label>Seed phrase</label>
              <input value={seedPhrase} onChange={(e) => setSeedPhrase(e.target.value)} placeholder="12/24 words..." />
              <label>Seed passphrase (optional)</label>
              <input value={seedPassphrase} onChange={(e) => setSeedPassphrase(e.target.value)} />
              <label>Vault password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="submit" disabled={isActionRunning("Importing wallet from phrase")}>
                {isActionRunning("Importing wallet from phrase") ? "Importing..." : "Import Wallet"}
              </button>
            </form>
          )}

          {onboardingMode === "import_pk" && (
            <form onSubmit={onImportByPrivateKey}>
              <label>Private key</label>
              <input value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} placeholder="0x..." />
              <label>Vault password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="submit" disabled={isActionRunning("Importing wallet from private key")}>
                {isActionRunning("Importing wallet from private key") ? "Importing..." : "Import Wallet"}
              </button>
            </form>
          )}

          {newWalletPhrase && (
            <div className="card">
              <h3>Backup Phrase</h3>
              <p className="muted">Store this safely. It is shown only once.</p>
              <p>{newWalletPhrase}</p>
            </div>
          )}
          {vaultMeta && (
            <form onSubmit={onUnlock}>
              <p className="muted">Existing vault: {fmt(vaultMeta.address)}</p>
              <label>Password to unlock</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="submit" disabled={isActionRunning("Unlocking wallet")}>
                {isActionRunning("Unlocking wallet") ? "Unlocking..." : "Unlock Wallet"}
              </button>
            </form>
          )}
        </section>
      )}

      {wallet && (
        <>
          <section className="card">
            <h2>Account</h2>
            <p>{wallet.address}</p>
            <label>Key Access</label>
            <button
              type="button"
              disabled={isActionRunning("Loading keys")}
              onClick={async () => {
                await runAction("Loading keys", async () => {
                  if (!showSensitiveKeys) await ensureDerivedKeys(wallet);
                  setShowSensitiveKeys((prev) => !prev);
                }, "Failed to derive keys");
              }}
            >
              {isActionRunning("Loading keys") ? "Loading..." : showSensitiveKeys ? "Hide all keys" : "View all keys"}
            </button>
            <button
              type="button"
              disabled={isActionRunning("Refreshing balances")}
              onClick={() =>
                runAction("Refreshing balances", async () => refreshBalancesWithRetry(wallet), "Refresh failed", 180000)
              }
            >
              {isActionRunning("Refreshing balances") ? "Refreshing..." : "Refresh keys and balances"}
            </button>
            <button
              disabled={false}
              onClick={() => {
                clearVault();
                clearAllScanCache();
                setWallet(null);
              }}
            >
              Lock & Clear Vault
            </button>
          </section>

          {(derivedKeys || showSensitiveKeys) && (
            <section className="card">
              <h2>Shielded Keys (Derived)</h2>
              <p className="muted">Deterministically linked to your wallet secret for this account.</p>
              {showSensitiveKeys && derivedKeys && (
                <div className="key-list">
                  <p className="key-item">
                    <strong>EOA private key</strong>
                    <span>{wallet?.privateKey}</span>
                  </p>
                  <p className="key-item">
                    <strong>owner_pk</strong>
                    <span>{derivedKeys.ownerPk}</span>
                  </p>
                  <p className="key-item">
                    <strong>viewing_pub</strong>
                    <span>{derivedKeys.viewingPub}</span>
                  </p>
                  <p className="key-item">
                    <strong>spending_key</strong>
                    <span>{derivedKeys.spendingKey}</span>
                  </p>
                  <p className="key-item">
                    <strong>viewing_priv</strong>
                    <span>{derivedKeys.viewingPriv}</span>
                  </p>
                  <p className="key-item">
                    <strong>fee_recipient_pk</strong>
                    <span>{derivedKeys.feeRecipientPk}</span>
                  </p>
                </div>
              )}
              {showSensitiveKeys && !derivedKeys && <p className="muted">Deriving keys...</p>}
              {!showSensitiveKeys && <p className="muted">Keys are hidden. Use "View all keys" above.</p>}
            </section>
          )}

          <section className="grid">
            <div className="card">
              <h3>Public Balance</h3>
              <label>Active token</label>
              <select value={selectedToken} onChange={(e) => setSelectedToken(e.target.value as `0x${string}`)}>
                {importedTokens.map((t) => (
                  <option key={t.address} value={t.address}>
                    {t.symbol} ({fmt(t.address)})
                  </option>
                ))}
              </select>
              <p>ETH: {publicEth}</p>
              <p>
                {tokenSymbol}: {publicToken}
              </p>
            </div>
            <div className="card">
              <h3>Private Balance</h3>
              <p>Selected token spendable notes: {shieldedNotes}</p>
              <p>{tokenSymbol} (shielded): {shieldedSpendable}</p>
              {privateBalances.length > 0 ? (
                <div className="key-list">
                  {privateBalances.map((b) => (
                    <p key={b.address} className="key-item">
                      <strong>{b.symbol}</strong>
                      <span>
                        {b.spendableAmount} ({b.spendableNotes} notes)
                      </span>
                    </p>
                  ))}
                </div>
              ) : (
                <p className="muted">No spendable private notes yet.</p>
              )}
            </div>
          </section>

          <section className="card">
            <h2>Import Token</h2>
            <form onSubmit={onImportToken}>
              <label>Token contract address</label>
              <input value={newTokenAddress} onChange={(e) => setNewTokenAddress(e.target.value)} placeholder="0x..." />
              <button type="submit" disabled={isActionRunning("Importing token")}>
                {isActionRunning("Importing token") ? "Importing..." : "Import token"}
              </button>
            </form>
          </section>

          <section className="card">
            <h2>Shield Public -&gt; Private</h2>
            <p className="muted">Deposits selected ERC20 into the pool and mints a private note to your derived keys.</p>
            {isActionRunning("Shielding token") && (
              <p className="muted">Shield in progress: approving token, then submitting shield transaction...</p>
            )}
            <form onSubmit={onShield}>
              <label>Token</label>
              <input value={`${tokenSymbol} (${fmt(selectedToken)})`} readOnly />
              <label>Amount</label>
              <input value={shieldAmount} onChange={(e) => setShieldAmount(e.target.value)} placeholder="0.0" />
              <button type="submit" disabled={isActionRunning("Shielding token")}>
                {isActionRunning("Shielding token") ? "Shielding..." : "Shield to private balance"}
              </button>
            </form>
          </section>

          <section className="card">
            <h2>Unshield Private -&gt; Public</h2>
            <p className="muted">Withdraws selected token from a private note to a public recipient address.</p>
            <p className="muted">
              Current flow unshields an exact note amount. If no note matches, split first via private transfer.
            </p>
            <form onSubmit={onUnshield}>
              <label>Destination</label>
              <select value={unshieldToMode} onChange={(e) => setUnshieldToMode(e.target.value as "self" | "custom")}>
                <option value="self">My address ({fmt(wallet.address)})</option>
                <option value="custom">Another address</option>
              </select>
              {unshieldToMode === "custom" && (
                <>
                  <label>Recipient</label>
                  <input value={unshieldRecipient} onChange={(e) => setUnshieldRecipient(e.target.value)} placeholder="0x..." />
                </>
              )}
              <label>Amount</label>
              <input value={unshieldAmount} onChange={(e) => setUnshieldAmount(e.target.value)} placeholder="Exact note amount" />
              <button type="submit" disabled={isActionRunning("Submitting unshield")}>
                {isActionRunning("Submitting unshield") ? "Unshielding..." : "Unshield to public"}
              </button>
            </form>
          </section>

          <section className="card">
            <h2>Send</h2>
            <form onSubmit={onPublicSend}>
              <label>Mode</label>
              <select value={sendMode} onChange={(e) => setSendMode(e.target.value as "public" | "private")}>
                <option value="public">Public transfer</option>
                <option value="private">Private transfer</option>
              </select>
              <label>Asset</label>
              <select value={sendAsset} onChange={(e) => setSendAsset(e.target.value as "eth" | "token")}>
                <option value="token">{tokenSymbol}</option>
                <option value="eth">ETH</option>
              </select>
              {sendMode === "public" && (
                <>
                  <label>Recipient</label>
                  <input value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="0x..." />
                </>
              )}
              <label>Amount</label>
              <input value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} />
              {sendMode === "private" && (
                <>
                  <label>Recipient owner_pk</label>
                  <input
                    value={recipientOwnerPk}
                    onChange={(e) => setRecipientOwnerPk(e.target.value)}
                    placeholder="decimal bigint"
                  />
                  <label>Recipient viewing public key</label>
                  <input
                    value={recipientViewingPub}
                    onChange={(e) => setRecipientViewingPub(e.target.value)}
                    placeholder="0x02..."
                  />
                  <label>Relayer URL</label>
                  <input value={relayerUrl} onChange={(e) => setRelayerUrl(e.target.value)} />
                </>
              )}
              <button type="submit" disabled={isActionRunning("Submitting private transfer") || isActionRunning("Submitting public transfer")}>
                {isActionRunning("Submitting private transfer")
                  ? "Sending private..."
                  : isActionRunning("Submitting public transfer")
                    ? "Sending public..."
                    : "Send"}
              </button>
            </form>
          </section>
        </>
      )}

      <p className="status">{status}</p>
    </main>
  );
}
