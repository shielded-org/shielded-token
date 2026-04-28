import {FormEvent, useEffect, useMemo, useRef, useState} from "react";
import {ethers} from "ethers";

import {CONTRACTS, ERC20_ABI, POOL_ABI, POOL_DEPLOY_BLOCK, POSEIDON_ABI, SEPOLIA} from "./config";
import {deriveOwnerPk, deriveUserKeys, keySeedFromPrivateKey, viewingPrivToPub} from "./keys";
import {executePrivateTransfer, executeUnshield} from "./privateTransfer";
import {scanShieldedNotes} from "./shielded";
import type {DecryptedNote} from "./shielded";
import {decodeShieldedAddress, encodeShieldedAddress} from "./shieldedAddress";
import {clearVault, readVaultMeta, storePrivateKey, unlockPrivateKey} from "./storage";
import {Badge} from "./components/Badge";
import {ActivityDetail} from "./components/ActivityDetail";
import {ActivityFeed} from "./components/ActivityFeed";
import {BottomNav} from "./components/BottomNav";
import {Button} from "./components/Button";
import {Card} from "./components/Card";
import {ConfirmModal} from "./components/ConfirmModal";
import {FilterPills} from "./components/FilterPills";
import {Input} from "./components/Input";
import {TopHeader} from "./components/TopHeader";
import {Toast} from "./components/Toast";

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
  const [status, setStatus] = useState("");
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendAsset, setSendAsset] = useState<"eth" | "token">("token");
  const [sendMode, setSendMode] = useState<"public" | "private">("public");
  const [recipientOwnerPk, setRecipientOwnerPk] = useState("");
  const [recipientViewingPub, setRecipientViewingPub] = useState("");
  const [recipientShieldedAddress, setRecipientShieldedAddress] = useState("");
  const [advancedRecipientMode, setAdvancedRecipientMode] = useState(false);
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
      setStatus(`Wallet created: ${fmt(next.address)}. Save your recovery phrase.`);
      setOnboardingStep("recovery");
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
      setRouteStack(["home"]);
    }, "Failed to import token");
  }

  async function onShield(e: FormEvent) {
    e.preventDefault();
    if (!wallet) {
      setStatus("Unlock or create a wallet before shielding.");
      return;
    }
    const pendingShieldId = `pending-shield-${Date.now()}`;
    setActivity((prev) => [
      {
        id: pendingShieldId,
        icon: "🔼",
        title: "Shielded",
        subtitle: "From public wallet",
        amount: `+ ${shieldAmount || "0"} ${tokenSymbol}`,
        amountColor: "#22C55E",
        timeLabel: "Just now",
        status: "pending",
      },
      ...prev,
    ]);
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
        if (i === chunks.length - 1) {
          setActivity((prev) =>
            prev.map((entry) =>
              entry.id === pendingShieldId
                ? {
                    ...entry,
                    status: "completed",
                    amount: `+ ${ethers.formatUnits(amount, tokenDecimals)} ${tokenSymbol}`,
                    txHash: shieldTx.hash,
                  }
                : entry
            )
          );
        }
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
      const pendingId = `pending-private-${Date.now()}`;
      setActivity((prev) => [
        {
          id: pendingId,
          icon: "🔒",
          title: "Private Send",
          subtitle: recipientShieldedAddress ? `${recipientShieldedAddress.slice(0, 16)}...` : "Advanced recipient",
          amount: `- ${sendAmount || "0"} ${tokenSymbol}`,
          amountColor: "#EF4444",
          timeLabel: "Just now",
          status: "pending",
        },
        ...prev,
      ]);
      await runAction("Submitting private transfer", async () => {
        if (!sendAmount || Number(sendAmount) <= 0) throw new Error("Enter a valid private transfer amount");
        setStatus("Submitting private transfer: discovering notes and preparing proof inputs...");
        const {owner: sender} = deriveShieldKeyMaterial(wallet);
        const poseidon = new ethers.Contract(CONTRACTS.poseidon, POSEIDON_ABI, provider);
        const senderOwnerPk = await deriveOwnerPk(sender.spendingKey, poseidon);
        if (!senderOwnerPk) throw new Error("Failed to derive sender owner pk");
        const senderViewingPub = viewingPrivToPub(sender.viewingPriv);
        const senderCache = readScanCache(senderViewingPub);
        const requestedAmount = ethers.parseUnits(sendAmount, tokenDecimals);
        const recipientKeys = advancedRecipientMode
          ? {
              ownerPk: BigInt(recipientOwnerPk),
              viewingPub: recipientViewingPub as `0x${string}`,
            }
          : decodeShieldedAddress(recipientShieldedAddress.trim());
        if ("chainId" in recipientKeys && recipientKeys.chainId !== SEPOLIA.chainId) {
          throw new Error(`Shielded address chainId ${recipientKeys.chainId} does not match Sepolia (${SEPOLIA.chainId}).`);
        }
        const result = await executePrivateTransfer({
          relayerUrl,
          senderSpendingKey: sender.spendingKey,
          senderOwnerPk,
          senderViewingPriv: sender.viewingPriv,
          senderViewingPub,
          recipientOwnerPk: recipientKeys.ownerPk,
          recipientViewingPub: recipientKeys.viewingPub,
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
        setActivity((prev) =>
          prev.map((entry) =>
            entry.id === pendingId
              ? {...entry, status: "completed", txHash: result.txHash as `0x${string}` | undefined}
              : entry
          )
        );
        setStatus(`Private transfer confirmed. Delivered ${ethers.formatUnits(BigInt(result.recipientAmount || "0"), tokenDecimals)} ${tokenSymbol}.`);
        await refreshBalancesWithRetry(wallet);
      }, "Private transfer failed", 300000);
      return;
    }
    const pendingPublicId = `pending-public-${Date.now()}`;
    setActivity((prev) => [
      {
        id: pendingPublicId,
        icon: "↑",
        title: "Public Send",
        subtitle: `To ${fmt(sendTo || wallet.address)}`,
        amount: `- ${sendAmount || "0"} ${sendAsset === "eth" ? "ETH" : tokenSymbol}`,
        amountColor: "#EF4444",
        timeLabel: "Just now",
        status: "pending",
      },
      ...prev,
    ]);
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
      setActivity((prev) => prev.map((entry) => (entry.id === pendingPublicId ? {...entry, status: "completed"} : entry)));
      setStatus("Public transfer confirmed.");
    }, "Transfer failed");
  }

  async function onUnshield(e: FormEvent) {
    e.preventDefault();
    if (!wallet) return;
    const pendingUnshieldId = `pending-unshield-${Date.now()}`;
    setActivity((prev) => [
      {
        id: pendingUnshieldId,
        icon: "🔽",
        title: "Unshielded",
        subtitle: unshieldToMode === "self" ? `To ${fmt(wallet.address)}` : `To ${fmt(unshieldRecipient || wallet.address)}`,
        amount: `- ${unshieldAmount || "0"} ${tokenSymbol}`,
        amountColor: "#EF4444",
        timeLabel: "Just now",
        status: "pending",
      },
      ...prev,
    ]);
    await runAction("Submitting unshield", async () => {
      if (!unshieldAmount || Number(unshieldAmount) <= 0) throw new Error("Enter a valid unshield amount");
      const recipient =
        unshieldToMode === "self"
          ? (wallet.address as `0x${string}`)
          : (ethers.getAddress(unshieldRecipient.trim()) as `0x${string}`);
      const amount = ethers.parseUnits(unshieldAmount, tokenDecimals);
      const {owner} = deriveShieldKeyMaterial(wallet);
      const poseidon = new ethers.Contract(CONTRACTS.poseidon, POSEIDON_ABI, provider);
      const senderOwnerPk = await deriveOwnerPk(owner.spendingKey, poseidon);
      const senderViewingPub = viewingPrivToPub(owner.viewingPriv);
      const senderCache = readScanCache(senderViewingPub);
      setStatus("Submitting unshield: scanning notes and preparing proof...");
      const result = await executeUnshield({
        relayerUrl,
        senderSpendingKey: owner.spendingKey,
        senderViewingPriv: owner.viewingPriv,
        senderViewingPub,
        senderOwnerPk,
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
      setActivity((prev) =>
        prev.map((entry) =>
          entry.id === pendingUnshieldId
            ? {...entry, status: "completed", subtitle: `To ${fmt(recipient)}`, txHash: result.txHash as `0x${string}` | undefined}
            : entry
        )
      );
      setUnshieldAmount("");
      await refreshBalancesWithRetry(wallet, 5);
      setStatus(`Unshield confirmed. Sent ${unshieldAmount} ${tokenSymbol} to ${recipient}.`);
    }, "Unshield failed", 300000);
  }

  type Route = "home" | "shield" | "send" | "send-private" | "unshield" | "keys" | "token-import" | "activity" | "activity-detail" | "token-detail";
  type ActivityFilter = "All" | "Shielded" | "Unshield" | "Send" | "Receive";
  type ActivityEntry = {
    id: string;
    icon: string;
    title: string;
    subtitle: string;
    amount: string;
    amountColor: string;
    timeLabel: string;
    status: "completed" | "pending" | "failed";
    txHash?: string;
  };

  const vaultMeta = readVaultMeta();
  const [routeStack, setRouteStack] = useState<Route[]>(["home"]);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [showRevealConfirm, setShowRevealConfirm] = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("All");
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activeActivity, setActiveActivity] = useState<ActivityEntry | null>(null);
  const [tokenDetailAddress, setTokenDetailAddress] = useState<`0x${string}` | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<"choice" | "create" | "recovery" | "import_phrase" | "import_pk" | "unlock">(
    vaultMeta ? "unlock" : "choice"
  );
  const route = routeStack[routeStack.length - 1];

  const pushRoute = (next: Route) => {
    setDirection("forward");
    setRouteStack((prev) => [...prev, next]);
  };
  const popRoute = () => {
    setDirection("backward");
    setRouteStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  };
  const goTab = (tab: "home" | "shield" | "send" | "keys" | "activity") => {
    setDirection("forward");
    const mapped: Route = tab === "send" ? "send" : tab;
    setRouteStack([mapped]);
  };

  const filteredActivity = activity.filter((entry) => {
    if (activityFilter === "All") return true;
    if (activityFilter === "Shielded") return entry.title.includes("Private") || entry.title.includes("Shield");
    if (activityFilter === "Unshield") return entry.title.includes("Unshield");
    if (activityFilter === "Send") return entry.title.includes("Send");
    return entry.title.includes("Receive");
  });
  const totalShieldedNotes = privateBalances.reduce((acc, next) => acc + next.spendableNotes, 0);
  const selectedShieldedToken = tokenDetailAddress
    ? privateBalances.find((balance) => balance.address.toLowerCase() === tokenDetailAddress.toLowerCase()) || null
    : null;

  return (
    <main className="wallet-root">
      {!wallet ? (
        <section className="screen" style={{minHeight: 580, placeContent: "center"}}>
          <div style={{textAlign: "center"}}>
            <div className="shield-pulse" style={{fontSize: 48}}>🛡</div>
            <h1 className="screen-title">Shielded</h1>
          </div>
          <Card>
            {onboardingStep === "choice" && (
              <div className="stack">
                <p className="label">Get started</p>
                <Card interactive onClick={() => setOnboardingStep("create")}>
                  <p className="screen-title" style={{fontSize: 14}}>Create a new wallet</p>
                  <p className="muted">Generate a fresh account with a recovery phrase.</p>
                </Card>
                <Card interactive onClick={() => setOnboardingStep("import_phrase")}>
                  <p className="screen-title" style={{fontSize: 14}}>Import using Secret Recovery Phrase</p>
                  <p className="muted">Restore your existing wallet using 12/24 words.</p>
                </Card>
                <Card interactive onClick={() => setOnboardingStep("import_pk")}>
                  <p className="screen-title" style={{fontSize: 14}}>Import using private key</p>
                  <p className="muted">Advanced import for raw private key holders.</p>
                </Card>
                {vaultMeta && <Button variant="ghost" onClick={() => setOnboardingStep("unlock")}>Unlock existing wallet</Button>}
              </div>
            )}

            {onboardingStep === "unlock" && (
              <form className="stack" onSubmit={onUnlock}>
                <div className="row">
                  <p className="label">Unlock</p>
                  <Button type="button" variant="ghost" fullWidth={false} onClick={() => setOnboardingStep("choice")}>Back</Button>
                </div>
                <p className="muted">Account: {vaultMeta ? fmt(vaultMeta.address) : "vault found"}</p>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
                <Button type="submit">Unlock</Button>
              </form>
            )}

            {onboardingStep === "create" && <form className="stack" onSubmit={onCreateWallet}><div className="row"><p className="label">Create wallet</p><Button type="button" variant="ghost" fullWidth={false} onClick={() => setOnboardingStep("choice")}>Back</Button></div><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create password" /><Button type="submit">Create Wallet</Button></form>}
            {onboardingStep === "import_phrase" && <form className="stack" onSubmit={onImportByPhrase}><div className="row"><p className="label">Import phrase</p><Button type="button" variant="ghost" fullWidth={false} onClick={() => setOnboardingStep("choice")}>Back</Button></div><Input value={seedPhrase} onChange={(e) => setSeedPhrase(e.target.value)} placeholder="12/24 words..." /><Input value={seedPassphrase} onChange={(e) => setSeedPassphrase(e.target.value)} placeholder="Passphrase (optional)" /><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create password" /><Button type="submit">Import Wallet</Button></form>}
            {onboardingStep === "import_pk" && <form className="stack" onSubmit={onImportByPrivateKey}><div className="row"><p className="label">Import private key</p><Button type="button" variant="ghost" fullWidth={false} onClick={() => setOnboardingStep("choice")}>Back</Button></div><Input value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} placeholder="0x..." mono /><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create password" /><Button type="submit">Import Wallet</Button></form>}
            {onboardingStep === "recovery" && (
              <Card>
                <p className="label">Secret Recovery Phrase</p>
                <p className="muted">Write this down and store it offline. You can recover your wallet using this phrase at any time.</p>
                <p className="mono">{newWalletPhrase}</p>
                <div className="row gap" style={{marginTop: 10}}>
                  <Button type="button" variant="ghost" onClick={() => setOnboardingStep("choice")}>Back</Button>
                  <Button type="button" onClick={() => setOnboardingStep("unlock")}>I saved it</Button>
                </div>
              </Card>
            )}
          </Card>
        </section>
      ) : (
        <>
          <TopHeader onLock={() => { clearVault(); clearAllScanCache(); setWallet(null); }} />
          <section className="shell-content">
            <div className={`screen ${direction === "forward" ? "screen-forward" : "screen-backward"}`}>
              {route === "home" && <>
                <Card>
                  <div className="row">
                    <span className="mono">{fmt(wallet.address)}</span>
                    <Button variant="ghost" fullWidth={false} onClick={() => navigator.clipboard.writeText(wallet.address)}>Copy</Button>
                  </div>
                  <p className="label">ETH Balance</p>
                  <p className="hero">{Number(publicEth).toFixed(4)} ETH</p>
                  <p className="muted">{tokenSymbol}: {publicToken}</p>
                </Card>
                <Card className="private-card">
                  <div className="row"><span>🔒 Private Balance</span><Badge variant="private">SHIELDED</Badge></div>
                  <p className="hero">{privateBalances.length} assets</p>
                  <p className="muted">Unified shielded portfolio • {totalShieldedNotes} spendable notes</p>
                </Card>
                <Card>
                  <div className="row"><p className="screen-title" style={{fontSize: 14}}>Tokens</p><Button type="button" variant="ghost" fullWidth={false} onClick={() => pushRoute("token-import")}>Import</Button></div>
                  <div className="stack">
                    {importedTokens.map((token) => {
                      const privateToken = privateBalances.find((entry) => entry.address.toLowerCase() === token.address.toLowerCase());
                      return (
                        <button
                          key={token.address}
                          type="button"
                          className="token-row"
                          onClick={() => {
                            setTokenDetailAddress(token.address);
                            pushRoute("token-detail");
                          }}
                        >
                          <div>
                            <p>{token.symbol}</p>
                            <p className="muted mono">{fmt(token.address)}</p>
                          </div>
                          <div style={{textAlign: "right"}}>
                            <p className="mono">{token.address.toLowerCase() === selectedToken.toLowerCase() ? `${publicToken} ${token.symbol}` : "—"}</p>
                            <p className="muted">Shielded: {privateToken ? privateToken.spendableAmount : "0"}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </Card>
                <div className="row gap">
                  <Button variant="ghost" onClick={() => pushRoute("shield")}>Shield</Button>
                  <Button variant="ghost" onClick={() => pushRoute("unshield")}>Unshield</Button>
                </div>
                <div className="row gap">
                  <Button variant="ghost" onClick={() => pushRoute("send")}>Send</Button>
                  <Button variant="ghost" onClick={() => pushRoute("keys")}>Keys</Button>
                </div>
              </>}

              {route === "shield" && <form className="stack" onSubmit={onShield}>
                <div className="row"><h2 className="screen-title">Shield Funds</h2><Button type="button" variant="ghost" fullWidth={false} onClick={popRoute}>Back</Button></div>
                <select className="input" value={selectedToken} onChange={(e) => setSelectedToken(e.target.value as `0x${string}`)}>{importedTokens.map((t) => <option key={t.address} value={t.address}>{t.symbol} ({fmt(t.address)})</option>)}</select>
                <Input value={shieldAmount} onChange={(e) => setShieldAmount(e.target.value)} rightSlot={<Button type="button" variant="ghost" fullWidth={false} onClick={() => setShieldAmount(publicToken)}>MAX</Button>} />
                <p className="muted">Your funds will be split into 2 private notes for flexible spending.</p>
                <Button type="submit">Shield Funds</Button>
              </form>}

              {route === "unshield" && <form className="stack" onSubmit={onUnshield}>
                <div className="row"><h2 className="screen-title">Unshield</h2><Button type="button" variant="ghost" fullWidth={false} onClick={popRoute}>Back</Button></div>
                <select className="input" value={unshieldToMode} onChange={(e) => setUnshieldToMode(e.target.value as "self" | "custom")}><option value="self">My Wallet ({fmt(wallet.address)})</option><option value="custom">Custom Address</option></select>
                {unshieldToMode === "custom" && <Input value={unshieldRecipient} onChange={(e) => setUnshieldRecipient(e.target.value)} placeholder="0x..." mono />}
                <Input value={unshieldAmount} onChange={(e) => setUnshieldAmount(e.target.value)} rightSlot={<Button type="button" variant="ghost" fullWidth={false} onClick={() => setUnshieldAmount(shieldedSpendable)}>FULL</Button>} />
                <Button type="submit">Unshield</Button>
              </form>}

              {route === "send" && <form className="stack" onSubmit={onPublicSend}>
                <div className="row"><h2 className="screen-title">Send</h2><Button type="button" variant="ghost" fullWidth={false} onClick={popRoute}>Back</Button></div>
                <div className="row gap">
                  <Button type="button" variant="ghost" onClick={() => setSendMode("public")}>Public</Button>
                  <Button type="button" onClick={() => { setSendMode("private"); pushRoute("send-private"); }}>Private</Button>
                </div>
                <select className="input" value={sendAsset} onChange={(e) => setSendAsset(e.target.value as "eth" | "token")}><option value="token">{tokenSymbol}</option><option value="eth">ETH</option></select>
                <Input value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="0x..." mono />
                <Input value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} placeholder="0.0" />
                <Button type="submit">Send</Button>
              </form>}

              {route === "send-private" && <form className="stack" onSubmit={onPublicSend}>
                <div className="row"><h2 className="screen-title">Private Transfer</h2><Button type="button" variant="ghost" fullWidth={false} onClick={popRoute}>Back</Button></div>
                <Input value={recipientShieldedAddress} onChange={(e) => setRecipientShieldedAddress(e.target.value)} placeholder="shd_..." mono />
                <label><input type="checkbox" checked={advancedRecipientMode} onChange={(e) => setAdvancedRecipientMode(e.target.checked)} /> Advanced manual recipient keys</label>
                {advancedRecipientMode && <Card><Input value={recipientOwnerPk} onChange={(e) => setRecipientOwnerPk(e.target.value)} placeholder="owner_pk" /><Input value={recipientViewingPub} onChange={(e) => setRecipientViewingPub(e.target.value)} placeholder="viewing_pub" mono /></Card>}
                <Input value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} rightSlot={<Button type="button" variant="ghost" fullWidth={false} onClick={() => setSendAmount(shieldedSpendable)}>MAX</Button>} />
                <Input value={relayerUrl} onChange={(e) => setRelayerUrl(e.target.value)} />
                <Button type="submit">Send Privately</Button>
              </form>}

              {route === "keys" && <>
                <div className="row"><h2 className="screen-title">Shielded Identity</h2><Button type="button" variant="ghost" fullWidth={false} onClick={popRoute}>Back</Button></div>
                <Card>
                  <p className="label">Shielded address</p>
                  <p className="mono">{derivedKeys ? encodeShieldedAddress({ownerPk: BigInt(derivedKeys.ownerPk), viewingPub: derivedKeys.viewingPub as `0x${string}`, chainId: SEPOLIA.chainId}) : "Loading..."}</p>
                  <Button variant="ghost" onClick={() => derivedKeys && navigator.clipboard.writeText(encodeShieldedAddress({ownerPk: BigInt(derivedKeys.ownerPk), viewingPub: derivedKeys.viewingPub as `0x${string}`, chainId: SEPOLIA.chainId}))}>Copy</Button>
                </Card>
                <Card>
                  <Button variant="ghost" onClick={() => setShowRevealConfirm(true)}>{showSensitiveKeys ? "Hide Keys" : "Reveal Key Material"}</Button>
                  {showSensitiveKeys && derivedKeys && <div className="blurred"><p className="mono">owner_pk: {derivedKeys.ownerPk}</p><p className="mono">viewing_pub: {derivedKeys.viewingPub}</p><p className="mono">spending_key: {derivedKeys.spendingKey}</p><p className="mono">viewing_priv: {derivedKeys.viewingPriv}</p></div>}
                </Card>
              </>}

              {route === "token-import" && (
                <form className="stack" onSubmit={onImportToken}>
                  <div className="row"><h2 className="screen-title">Import Token</h2><Button type="button" variant="ghost" fullWidth={false} onClick={popRoute}>Back</Button></div>
                  <p className="muted">Paste an ERC20 token contract to add it into your wallet token list.</p>
                  <Input value={newTokenAddress} onChange={(e) => setNewTokenAddress(e.target.value)} placeholder="0x token address..." mono />
                  <Button type="submit">Import Token</Button>
                </form>
              )}

              {route === "activity" && <>
                <h2 className="screen-title">Activity</h2>
                <FilterPills options={["All", "Shielded", "Unshield", "Send", "Receive"]} active={activityFilter} onChange={setActivityFilter} />
                {filteredActivity.length ? (
                  <ActivityFeed
                    items={filteredActivity}
                    onOpenItem={(id) => {
                      const chosen = activity.find((entry) => entry.id === id) || null;
                      setActiveActivity(chosen);
                      pushRoute("activity-detail");
                    }}
                  />
                ) : (
                  <Card><p className="muted" style={{textAlign: "center"}}>No activity yet.</p><Button variant="ghost" onClick={() => pushRoute("shield")}>Shield Now</Button></Card>
                )}
              </>}

              {route === "activity-detail" && activeActivity && (
                <ActivityDetail
                  title={activeActivity.title}
                  icon={activeActivity.icon}
                  status={activeActivity.status}
                  amount={activeActivity.amount}
                  subtitle={activeActivity.subtitle}
                  txHash={activeActivity.txHash}
                  onBack={popRoute}
                />
              )}

              {route === "token-detail" && tokenDetailAddress && (
                <>
                  <div className="row"><h2 className="screen-title">Token Details</h2><Button type="button" variant="ghost" fullWidth={false} onClick={popRoute}>Back</Button></div>
                  <Card>
                    <p className="label">Token</p>
                    <p className="screen-title" style={{fontSize: 18}}>{selectedShieldedToken ? selectedShieldedToken.symbol : fmt(tokenDetailAddress)}</p>
                    <p className="muted mono">{tokenDetailAddress}</p>
                  </Card>
                  <Card className="private-card">
                    <p className="label">Total shielded amount</p>
                    <p className="hero">{selectedShieldedToken ? selectedShieldedToken.spendableAmount : "0"} {selectedShieldedToken ? selectedShieldedToken.symbol : ""}</p>
                    <p className="muted">{selectedShieldedToken ? selectedShieldedToken.spendableNotes : 0} spendable notes</p>
                  </Card>
                  <div className="row gap">
                    <Button variant="ghost" onClick={() => pushRoute("shield")}>Shield</Button>
                    <Button variant="ghost" onClick={() => { setSelectedToken(tokenDetailAddress); pushRoute("send-private"); }}>Send Private</Button>
                  </div>
                </>
              )}
            </div>
          </section>
          <BottomNav active={route === "shield" ? "shield" : route === "send" || route === "send-private" ? "send" : route === "keys" || route === "token-import" ? "keys" : route === "activity" || route === "activity-detail" ? "activity" : "home"} onSelect={goTab} />
        </>
      )}
      <ConfirmModal open={showRevealConfirm} title="Reveal sensitive key material?" body="You are about to display sensitive key material. Make sure no one can see your screen." onCancel={() => setShowRevealConfirm(false)} onConfirm={async () => { setShowRevealConfirm(false); if (!showSensitiveKeys && wallet) await ensureDerivedKeys(wallet); setShowSensitiveKeys((v) => !v); }} />
      {status && status !== "Ready" && <Toast message={status} tone={/failed|error/i.test(status) ? "error" : /confirmed|synced|created|imported|unlocked/i.test(status) ? "success" : "info"} onDismiss={() => setStatus("")} />}
    </main>
  );
}
