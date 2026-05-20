"use client";

import {ethers} from "ethers";
import {
  CHAIN_ID_ARBITRUM_SEPOLIA,
  CHAIN_ID_BASE_SEPOLIA,
  CHAIN_ID_ETH_SEPOLIA,
  getShieldedNetwork,
  type ShieldedChainId,
  type ShieldedNetwork,
} from "./networks";
import {runAlchemyJsonRpcSerialized} from "./premium-rpc-queue";
import {recommendedLogChunkSizeForRpc} from "./eth-get-logs";
import {getReadRpcUrlCandidates, getWorkingReadProvider} from "./rpc-read";
import {ERC20_ABI, POOL_ABI, POSEIDON_ABI} from "./shielded-config";
import {deriveOwnerPk, deriveUserKeys, keySeedFromWalletSignature, viewingPrivToPub, SHIELD_KEY_DERIVATION_CONSENT_MESSAGE} from "./keys";
import {scanShieldedNotes, type DecryptedNote} from "./shielded";
import {shieldedScanDebug, shieldedScanDebugEnabled, shieldedScanRpcLabel} from "./shielded-scan-debug";
import type {StoredDecryptedNote, TokenDefinition} from "./types";
import {l2GasLimitOverride, txFeeOverrides} from "./tx-gas";
import {tokenAddressFromNoteTokenField} from "./utils";

function toHex32(v: bigint): `0x${string}` {
  return ethers.zeroPadValue(ethers.toBeHex(v), 32) as `0x${string}`;
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return Uint8Array.from(data).buffer;
}

async function hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length = 32): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({name: "HKDF", hash: "SHA-256", salt: toArrayBuffer(salt), info: toArrayBuffer(info)}, key, length * 8);
  return new Uint8Array(bits);
}

function requireNet(chainId: ShieldedChainId) {
  const net = getShieldedNetwork(chainId);
  if (!net) throw new Error(`Unknown shielded chainId ${chainId}`);
  return net;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** One `eth_getLogs` pass per **pool chain** at a time; different networks do not block each other. */
const scanPrivateStateQueueByChain = new Map<ShieldedChainId, Promise<unknown>>();

function runScanPrivateStateSerializedForChain<T>(shieldedChainId: ShieldedChainId, task: () => Promise<T>): Promise<T> {
  const prev = scanPrivateStateQueueByChain.get(shieldedChainId) ?? Promise.resolve();
  const p = prev.then(task, task);
  scanPrivateStateQueueByChain.set(
    shieldedChainId,
    p.then(
      () => undefined,
      () => undefined
    )
  );
  return p;
}

function mergeDecryptedNotesDedupe(carry: DecryptedNote[], fresh: DecryptedNote[]): DecryptedNote[] {
  const m = new Map<string, DecryptedNote>();
  for (const n of carry) m.set(`${n.commitment}:${n.txHash}`, n);
  for (const n of fresh) m.set(`${n.commitment}:${n.txHash}`, n);
  return Array.from(m.values());
}

const L2_CHAIN_IDS = [CHAIN_ID_BASE_SEPOLIA, CHAIN_ID_ARBITRUM_SEPOLIA] as const;

function logChunkSizeForRpc(net: ShieldedNetwork, rpcUrl: string): number | undefined {
  return recommendedLogChunkSizeForRpc(net.id, rpcUrl, L2_CHAIN_IDS);
}

/**
 * Run `eth_getLogs` note scan across read RPC candidates.
 * On Base / Arbitrum Sepolia, **merge** results from every URL: some public L2 endpoints return 200 + empty
 * or partial logs. Ethereum Sepolia keeps the faster "first successful scan" behavior.
 *
 * **Extension parity:** `apps/wallet-extension` scans with a **single** wallet `JsonRpcProvider` (one pass).
 * The web app merges several mirrors; without care that repeats full `eth_getLogs` history per URL and
 * overlaps Alchemy across chains → 429. We reorder premium RPCs last, serialize Alchemy, throttle, and
 * short-circuit when a mirror already returned all logs decrypted.
 */
export async function scanShieldedNotesWithRpcFallback(
  net: ShieldedNetwork,
  scanArgs: {
    poolAddress: `0x${string}`;
    fromBlock: number;
    viewingPriv: bigint;
    viewingPub: `0x${string}`;
  }
) {
  const urls = getReadRpcUrlCandidates(net);
  const mergeMultiRpc = net.id === CHAIN_ID_BASE_SEPOLIA || net.id === CHAIN_ID_ARBITRUM_SEPOLIA;

  if (shieldedScanDebugEnabled()) {
    shieldedScanDebug("scanShieldedNotesWithRpcFallback:start", {
      shieldedChainId: net.id,
      netLabel: net.label,
      pool: scanArgs.poolAddress,
      fromBlock: scanArgs.fromBlock,
      viewingPubPrefix: `${scanArgs.viewingPub.slice(0, 12)}…`,
      mergeMultiRpc,
      rpcCandidatesOrdered: urls.map(shieldedScanRpcLabel),
      logChunkSizes: urls.map((u) => logChunkSizeForRpc(net, u) ?? null),
    });
  }

  if (!mergeMultiRpc) {
    let lastErr: unknown;
    for (const url of urls) {
      try {
        return await runAlchemyJsonRpcSerialized(url, async () => {
          const provider = new ethers.JsonRpcProvider(url, net.id);
          await provider.getBlockNumber();
          return scanShieldedNotes({
            provider,
            ...scanArgs,
            logChunkSize: logChunkSizeForRpc(net, url),
            debugRpcLabel: shieldedScanRpcLabel(url),
          });
        });
      } catch (e) {
        lastErr = e;
        if (shieldedScanDebugEnabled()) {
          shieldedScanDebug("scanShieldedNotesWithRpcFallback:ethRpcError", {
            shieldedChainId: net.id,
            netLabel: net.label,
            url: shieldedScanRpcLabel(url),
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
    if (lastErr instanceof Error) throw lastErr;
    throw new Error(lastErr ? String(lastErr) : "No RPC could complete shielded note scan (eth_getLogs).");
  }

  let lastErr: unknown;
  const merged = new Map<string, DecryptedNote>();
  let minLatestBlock = Number.POSITIVE_INFINITY;
  let maxTotalLogs = 0;
  let channel: `0x${string}` = ethers.ZeroHash as `0x${string}`;
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]!;
    if (i > 0) await sleep(90);
    try {
      const res = await runAlchemyJsonRpcSerialized(url, async () => {
        const provider = new ethers.JsonRpcProvider(url, net.id);
        await provider.getBlockNumber();
        return scanShieldedNotes({
          provider,
          ...scanArgs,
          logChunkSize: logChunkSizeForRpc(net, url),
          debugRpcLabel: shieldedScanRpcLabel(url),
        });
      });
      minLatestBlock = Math.min(minLatestBlock, res.stats.latestBlock);
      maxTotalLogs = Math.max(maxTotalLogs, res.stats.totalLogs);
      channel = res.stats.channel;
      for (const n of res.notes) {
        merged.set(`${n.commitment}:${n.txHash}`, n);
      }
      const fullDecrypt =
        res.stats.totalLogs > 0 && res.stats.decryptSuccess === res.stats.totalLogs;
      if (fullDecrypt || res.notes.length > 0) {
        if (shieldedScanDebugEnabled()) {
          shieldedScanDebug("scanShieldedNotesWithRpcFallback:shortCircuit", {
            shieldedChainId: net.id,
            netLabel: net.label,
            rpc: shieldedScanRpcLabel(url),
            rpcIndex: i,
            totalLogs: res.stats.totalLogs,
            decryptedNotes: res.notes.length,
            reason: fullDecrypt
              ? "All logs decrypted on this mirror; skipping remaining RPCs."
              : "Found decryptable notes on this mirror; skipping remaining RPCs (avoids duplicate full-history scans).",
          });
        }
        break;
      }
    } catch (e) {
      lastErr = e;
      if (shieldedScanDebugEnabled()) {
        shieldedScanDebug("scanShieldedNotesWithRpcFallback:l2RpcError", {
          shieldedChainId: net.id,
          netLabel: net.label,
          pool: scanArgs.poolAddress,
          rpcIndex: i,
          url: shieldedScanRpcLabel(url),
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
  if (!Number.isFinite(minLatestBlock)) {
    if (lastErr instanceof Error) throw lastErr;
    throw new Error(lastErr ? String(lastErr) : "No RPC could complete shielded note scan (eth_getLogs).");
  }
  const notes = Array.from(merged.values());
  if (shieldedScanDebugEnabled()) {
    shieldedScanDebug("scanShieldedNotesWithRpcFallback:merged", {
      shieldedChainId: net.id,
      mergedNoteCount: notes.length,
      minLatestBlock,
      maxTotalLogs,
      channel,
    });
  }
  return {
    notes,
    stats: {
      channel,
      latestBlock: minLatestBlock,
      totalLogs: maxTotalLogs,
      decryptSuccess: notes.length,
    },
  };
}

export type ShieldedScanCachePayload = {
  viewingPub: `0x${string}`;
  lastScannedBlock: number;
  notes: DecryptedNote[];
};

export type ScanPrivateStateResult = {
  notes: DecryptedNote[];
  stats: Awaited<ReturnType<typeof scanShieldedNotes>>["stats"];
  cacheOut: ShieldedScanCachePayload;
};

export function storedDecryptedNotesToLive(rows: StoredDecryptedNote[]): DecryptedNote[] {
  return rows.map((r) => ({
    commitment: r.commitment,
    amount: BigInt(r.amount),
    blinding: r.blinding,
    token: r.token,
    txHash: r.txHash,
  }));
}

export function liveDecryptedNotesToStored(notes: DecryptedNote[]): StoredDecryptedNote[] {
  return notes.map((n) => ({
    commitment: n.commitment,
    amount: n.amount.toString(),
    blinding: n.blinding,
    token: n.token,
    txHash: n.txHash,
  }));
}

/** Include `poolDeployBlock` so changing env / redeploy does not reuse a stale cursor. */
export function shieldedScanCacheKey(chainId: ShieldedChainId, poolAddress: string, poolDeployBlock: number): string {
  return `${chainId}:${poolAddress.toLowerCase()}:${poolDeployBlock}`;
}

function viewingPubEq(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export async function deriveShieldedKeysFromWallet(
  address: `0x${string}`,
  signMessage: (message: string) => Promise<`0x${string}`>,
  shieldedChainId: ShieldedChainId = CHAIN_ID_ETH_SEPOLIA
) {
  const net = requireNet(shieldedChainId);
  const signature = await signMessage(SHIELD_KEY_DERIVATION_CONSENT_MESSAGE);
  const seed = keySeedFromWalletSignature(address, signature);
  const owner = deriveUserKeys(seed, "owner");
  const feeRecipient = deriveUserKeys(seed, "feeRecipient");
  const provider = await getWorkingReadProvider(net);
  const poseidon = new ethers.Contract(net.contracts.poseidon, POSEIDON_ABI, provider);
  const ownerPk = await deriveOwnerPk(owner.spendingKey, poseidon);
  const feeRecipientPk = await deriveOwnerPk(feeRecipient.spendingKey, poseidon);
  const viewingPub = viewingPrivToPub(owner.viewingPriv);
  if (shieldedScanDebugEnabled()) {
    let recoveryByte: number | null = null;
    try {
      const bytes = ethers.getBytes(signature);
      if (bytes.length >= 65) recoveryByte = bytes[64]!;
    } catch {
      recoveryByte = null;
    }
    const unusualV = recoveryByte != null && recoveryByte < 27;
    shieldedScanDebug("deriveShieldedKeysFromWallet", {
      wallet: ethers.getAddress(address),
      shieldedChainIdUsedForPoseidonOnly: shieldedChainId,
      seedIndependentOfChainId: true,
      consentMessageChars: SHIELD_KEY_DERIVATION_CONSENT_MESSAGE.length,
      signatureHexChars: signature.length,
      signatureRecoveryByte: recoveryByte,
      ...(unusualV
        ? {
            recoveryByteNote:
              "v is 0/1 (non-27/28); seed hashes raw wallet bytes. If another client shows different notes, compare signature encoding.",
          }
        : {}),
      viewingPubPrefix: `${viewingPub.slice(0, 12)}…`,
    });
  }
  return {
    ownerPk,
    spendingKey: owner.spendingKey,
    viewingPriv: owner.viewingPriv,
    viewingPub,
    feeRecipientPk,
  };
}

export async function scanPrivateState(
  viewingPriv: bigint,
  viewingPub: `0x${string}`,
  shieldedChainId: ShieldedChainId,
  options?: {
    /** Rare override — normally use incremental cache from the store */
    fromBlockOverride?: number;
    /** Same viewer + merged notes + cursor as wallet-extension scan cache */
    priorCache?: ShieldedScanCachePayload | null;
  }
): Promise<ScanPrivateStateResult> {
  return runScanPrivateStateSerializedForChain(shieldedChainId, () =>
    scanPrivateStateImpl(viewingPriv, viewingPub, shieldedChainId, options)
  );
}

async function scanPrivateStateImpl(
  viewingPriv: bigint,
  viewingPub: `0x${string}`,
  shieldedChainId: ShieldedChainId,
  options?: {
    fromBlockOverride?: number;
    priorCache?: ShieldedScanCachePayload | null;
  }
): Promise<ScanPrivateStateResult> {
  const net = requireNet(shieldedChainId);
  const poolDeploy = net.poolDeployBlock;

  let fromBlock = options?.fromBlockOverride ?? poolDeploy;
  let carry: DecryptedNote[] = [];

  if (options?.priorCache && viewingPubEq(options.priorCache.viewingPub, viewingPub)) {
    fromBlock = Math.max(poolDeploy, options.priorCache.lastScannedBlock + 1);
    carry = options.priorCache.notes;
  }

  if (shieldedScanDebugEnabled()) {
    shieldedScanDebug("scanPrivateState", {
      shieldedChainId,
      pool: net.contracts.pool,
      poolDeployBlock: poolDeploy,
      scanFromBlock: fromBlock,
      priorCacheHit: Boolean(options?.priorCache && viewingPubEq(options.priorCache.viewingPub, viewingPub)),
      carryNotes: carry.length,
    });
  }

  const delta = await scanShieldedNotesWithRpcFallback(net, {
    poolAddress: net.contracts.pool,
    fromBlock,
    viewingPriv,
    viewingPub,
  });

  const merged = mergeDecryptedNotesDedupe(carry, delta.notes);

  return {
    notes: merged,
    stats: delta.stats,
    cacheOut: {
      viewingPub,
      lastScannedBlock: delta.stats.latestBlock,
      notes: merged,
    },
  };
}

export type ResolvedNoteState = DecryptedNote & {
  nullifier?: `0x${string}`;
  isSpent: boolean;
};

async function poseidonHash2(poseidon: ethers.Contract, a: bigint, b: bigint): Promise<`0x${string}`> {
  const out = await poseidon.hash_2(a, b);
  return toHex32(BigInt(out.toString()));
}

export async function resolveNoteStates(notes: DecryptedNote[], spendingKey: bigint, shieldedChainId: ShieldedChainId) {
  const net = requireNet(shieldedChainId);
  const provider = await getWorkingReadProvider(net);
  const poseidon = new ethers.Contract(net.contracts.poseidon, POSEIDON_ABI, provider);
  const pool = new ethers.Contract(net.contracts.pool, POOL_ABI, provider);

  return Promise.all(
    notes.map(async (note) => {
      try {
        const nullifier = await poseidonHash2(poseidon, spendingKey, BigInt(note.commitment));
        const isSpent = await pool.nullifierSet(nullifier);
        return {
          ...note,
          nullifier,
          isSpent: Boolean(isSpent),
        } satisfies ResolvedNoteState;
      } catch {
        return {...note, isSpent: false} satisfies ResolvedNoteState;
      }
    })
  );
}

export async function shieldDeposit(params: {
  signer: ethers.Signer;
  ownerPk: bigint;
  viewingPub: `0x${string}`;
  tokenAddress: `0x${string}`;
  amount: bigint;
  shieldedChainId: ShieldedChainId;
}) {
  const net = requireNet(params.shieldedChainId);
  const readProvider = await getWorkingReadProvider(net);
  const poseidon = new ethers.Contract(net.contracts.poseidon, POSEIDON_ABI, readProvider);
  const token = new ethers.Contract(params.tokenAddress, ERC20_ABI, params.signer);
  const pool = new ethers.Contract(net.contracts.pool, POOL_ABI, params.signer);
  const tokenField = BigInt(ethers.zeroPadValue(params.tokenAddress, 32));
  const blinding = BigInt(ethers.randomBytes(31).reduce((acc, b) => (acc << 8n) + BigInt(b), 0n)) || 1n;
  const commitment = BigInt(await poseidon.hash([params.ownerPk, tokenField, params.amount, blinding]));
  const envelope = await encryptNoteECDH(
    {
      owner_pk: params.ownerPk.toString(),
      token: toHex32(tokenField),
      amount: params.amount.toString(),
      blinding: toHex32(blinding),
      commitment: toHex32(commitment),
    },
    params.viewingPub
  );
  /** Same channel the indexer uses: `keccak256(viewingPub)` — not chain-specific. */
  const channel = ethers.keccak256(params.viewingPub);
  const subchannel = ethers.solidityPackedKeccak256(["bytes32", "uint64"], [channel, 0n]);
  const prov = params.signer.provider;
  const feeOpts = prov ? await txFeeOverrides(prov) : {};
  const approveGas = await l2GasLimitOverride(params.signer, () => token.approve.estimateGas(net.contracts.pool, params.amount), "approve");
  const approveTx = await token.approve(net.contracts.pool, params.amount, {...feeOpts, ...(approveGas ?? {})});
  await approveTx.wait();
  const feeOpts2 = prov ? await txFeeOverrides(prov) : {};
  const shieldGas = await l2GasLimitOverride(
    params.signer,
    () =>
      pool.shieldRouted.estimateGas(
        params.tokenAddress,
        params.amount,
        toHex32(commitment),
        envelope,
        channel,
        subchannel
      ),
    "shield"
  );
  const shieldTx = await pool.shieldRouted(
    params.tokenAddress,
    params.amount,
    toHex32(commitment),
    envelope,
    channel,
    subchannel,
    {...feeOpts2, ...(shieldGas ?? {})}
  );
  await shieldTx.wait();
  return {txHash: shieldTx.hash as `0x${string}`, commitment: toHex32(commitment), encryptedNote: envelope};
}

async function encryptNoteECDH(note: object, recipientViewingPubHex: `0x${string}`): Promise<`0x${string}`> {
  const ephWallet = ethers.Wallet.createRandom();
  const sharedSecretHex = ephWallet.signingKey.computeSharedSecret(recipientViewingPubHex);
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await hkdfSha256(ethers.getBytes(sharedSecretHex as `0x${string}`), salt, new TextEncoder().encode("zkproject-note-v1"), 32);
  const cryptoKey = await crypto.subtle.importKey("raw", toArrayBuffer(key), "AES-GCM", false, ["encrypt"]);
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

function normalizeTokenField(tokenLike: string): string | null {
  try {
    return ethers.zeroPadValue(tokenLike as `0x${string}`, 32).toLowerCase();
  } catch {
    return null;
  }
}

function fallbackTokenLabel(tokenField: `0x${string}`) {
  const compact = tokenField.slice(-8).toUpperCase();
  return `TOKEN-${compact}`;
}

export function mapNotesToUi(notes: ResolvedNoteState[], tokens: TokenDefinition[], poolChainId: ShieldedChainId) {
  const tokenByField = new Map<string, TokenDefinition>();
  for (const token of tokens) {
    tokenByField.set(ethers.zeroPadValue(token.contractAddress, 32).toLowerCase(), token);
  }

  return notes.map((n, idx) => {
    const normalizedField = normalizeTokenField(n.token);
    const tokenMeta = normalizedField ? tokenByField.get(normalizedField) : undefined;
    const tokenContractAddress = tokenAddressFromNoteTokenField(n.token) ?? undefined;
    const tokenByAddr =
      tokenContractAddress != null
        ? tokens.find((t) => t.contractAddress.toLowerCase() === tokenContractAddress.toLowerCase())
        : undefined;
    /** Padded-field map first; else match canonical ERC-20 so decimals/symbol stay correct (avoids defaulting to 18 on USDC). */
    const meta = tokenMeta ?? tokenByAddr;

    return {
      id: `${n.commitment}-${idx}`,
      shieldedChainId: poolChainId,
      token: meta?.symbol ?? fallbackTokenLabel(n.token),
      ...(tokenContractAddress ? {tokenContractAddress} : {}),
      amount: ethers.formatUnits(n.amount, meta?.decimals ?? 18),
      status: n.isSpent ? ("spent" as const) : ("unspent" as const),
      commitment: n.commitment,
      nullifier: n.nullifier,
      encryptedNote: "0x" as `0x${string}`,
      discoveredAt: new Date().toISOString(),
      source: "shield" as const,
      txHash: n.txHash,
    };
  });
}
