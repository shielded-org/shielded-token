import {ethers} from "ethers";

import {CONTRACTS, POOL_ABI, POOL_DEPLOY_BLOCK, POSEIDON_ABI, SEPOLIA} from "./config";
import {buildInputMerklePaths, buildMerklePathForCommitment} from "./merkle";
import {generateProof, generateUnshieldProof} from "./proving";
import {scanShieldedNotes} from "./shielded";
import type {DecryptedNote} from "./shielded";

function toHex32(v: bigint): `0x${string}` {
  return ethers.zeroPadValue(ethers.toBeHex(v), 32) as `0x${string}`;
}

function parseHexToBigInt(hex: string) {
  return BigInt(hex);
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

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return ethers.hexlify(bytes) as `0x${string}`;
}

function hexToBytes(hex: string): Uint8Array {
  return ethers.getBytes(hex);
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return Uint8Array.from(data).buffer;
}

async function hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length = 32): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {name: "HKDF", hash: "SHA-256", salt: toArrayBuffer(salt), info: toArrayBuffer(info)},
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

async function encryptNoteECDH(note: object, recipientViewingPubHex: `0x${string}`): Promise<`0x${string}`> {
  const ephWallet = ethers.Wallet.createRandom();
  const sharedSecretHex = ephWallet.signingKey.computeSharedSecret(recipientViewingPubHex);
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await hkdfSha256(hexToBytes(sharedSecretHex), salt, new TextEncoder().encode("zkproject-note-v1"), 32);
  const cryptoKey = await crypto.subtle.importKey("raw", toArrayBuffer(key), "AES-GCM", false, ["encrypt"]);
  const plaintext = new TextEncoder().encode(JSON.stringify(note));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({name: "AES-GCM", iv}, cryptoKey, plaintext));
  const ct = encrypted.slice(0, encrypted.length - 16);
  const tag = encrypted.slice(encrypted.length - 16);
  const envelope = {
    v: 1,
    eph: ephWallet.signingKey.compressedPublicKey,
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    ct: bytesToHex(ct),
    tag: bytesToHex(tag),
  };
  return ethers.hexlify(ethers.toUtf8Bytes(JSON.stringify(envelope))) as `0x${string}`;
}

async function poseidonHash2(poseidon: ethers.Contract, a: bigint, b: bigint): Promise<`0x${string}`> {
  const out = await poseidon.hash_2(a, b);
  return toHex32(BigInt(out.toString()));
}

async function noteCommitment(
  poseidon: ethers.Contract,
  owner: bigint,
  tokenField: `0x${string}`,
  amount: bigint,
  blinding: bigint
): Promise<`0x${string}`> {
  const out = await poseidon.hash([owner, parseHexToBigInt(tokenField), amount, blinding]);
  return toHex32(BigInt(out.toString()));
}

export async function executePrivateTransfer(params: {
  relayerUrl: string;
  senderSpendingKey: bigint;
  senderViewingPriv: bigint;
  senderViewingPub: `0x${string}`;
  recipientOwnerPk: bigint;
  recipientViewingPub: `0x${string}`;
  feeRecipientOwnerPk: bigint;
  feeRecipientViewingPub: `0x${string}`;
  onStatus?: (msg: string) => void;
  relayerRequestTimeoutMs?: number;
  scanFromBlock?: number;
  cachedNotes?: DecryptedNote[];
  maxRecipientAmount?: bigint;
  tokenAddress?: `0x${string}`;
}) {
  const status = params.onStatus ?? (() => {});
  const relayerTimeoutMs = params.relayerRequestTimeoutMs ?? 120000;
  const startedAt = Date.now();
  const mark = (msg: string) => status(`${msg} (+${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);

  const provider = new ethers.JsonRpcProvider(SEPOLIA.rpcUrl, SEPOLIA.chainId);
  const poseidon = new ethers.Contract(CONTRACTS.poseidon, POSEIDON_ABI, provider);
  const pool = new ethers.Contract(CONTRACTS.pool, POOL_ABI, provider);
  const selectedToken = params.tokenAddress ?? (CONTRACTS.token as `0x${string}`);
  const tokenField = ethers.zeroPadValue(selectedToken, 32) as `0x${string}`;
  const tokenFieldNorm = tokenField.toLowerCase();
  const scanFromBlock = params.scanFromBlock ?? POOL_DEPLOY_BLOCK;
  mark(`Scanning shielded notes from block ${scanFromBlock}`);
  const scan = await scanShieldedNotes({
    provider,
    poolAddress: CONTRACTS.pool as `0x${string}`,
    fromBlock: scanFromBlock,
    viewingPriv: params.senderViewingPriv,
    viewingPub: params.senderViewingPub,
  });
  const merged = [...(params.cachedNotes ?? []), ...scan.notes];
  const dedup = new Map<string, DecryptedNote>();
  for (const n of merged) dedup.set(`${n.commitment}:${n.txHash}`, n);
  const discovered = Array.from(dedup.values());
  mark(`Discovered notes=${discovered.length} (new ${scan.notes.length})`);
  const spendable = [];
  for (const note of discovered) {
    const noteTokenField = normalizeTokenField(note.token);
    if (!noteTokenField || noteTokenField !== tokenFieldNorm) continue;
    const nf = await poseidonHash2(poseidon, params.senderSpendingKey, BigInt(note.commitment));
    const isSpent = await pool.nullifierSet(nf);
    if (!isSpent) spendable.push(note);
  }
  if (spendable.length < 2) {
    throw new Error("Need at least 2 unspent notes for private transfer.");
  }
  spendable.sort((a, b) => (a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0));
  type Candidate = {
    i: number;
    j: number;
    totalIn: bigint;
    fee: bigint;
    recipientAmount: bigint;
  };
  const candidates: Candidate[] = [];
  for (let i = 0; i < spendable.length; i += 1) {
    for (let j = i + 1; j < spendable.length; j += 1) {
      const totalIn = spendable[i].amount + spendable[j].amount;
      const fee = (totalIn * 5n) / 1000n;
      if (fee === 0n) continue;
      const recipientAmount = totalIn - fee;
      candidates.push({i, j, totalIn, fee, recipientAmount});
    }
  }
  if (candidates.length === 0) {
    throw new Error("Could not find 2 spendable notes with non-zero fee. Use larger note amounts.");
  }
  let chosen: Candidate | null = null;
  if (params.maxRecipientAmount != null) {
    const bounded = candidates.filter((c) => c.recipientAmount <= params.maxRecipientAmount!);
    if (bounded.length === 0) {
      throw new Error("No available 2-note combination can satisfy the requested private amount.");
    }
    bounded.sort((a, b) => (a.recipientAmount < b.recipientAmount ? 1 : a.recipientAmount > b.recipientAmount ? -1 : 0));
    chosen = bounded[0];
  } else {
    candidates.sort((a, b) => (a.recipientAmount < b.recipientAmount ? -1 : a.recipientAmount > b.recipientAmount ? 1 : 0));
    chosen = candidates[0];
  }
  mark(`Spendable notes=${spendable.length}; preparing proof inputs`);
  const in0 = spendable[chosen.i];
  const in1 = spendable[chosen.j];
  const totalIn = chosen.totalIn;
  const fee = chosen.fee;
  const recipientAmount = chosen.recipientAmount;
  const changeAmount = fee;
  const outBlinding0 = BigInt(ethers.randomBytes(31).reduce((a, b) => (a << 8n) + BigInt(b), 0n) + 1n);
  const outBlinding1 = BigInt(ethers.randomBytes(31).reduce((a, b) => (a << 8n) + BigInt(b), 0n) + 1n);
  const nullifier0 = await poseidonHash2(poseidon, params.senderSpendingKey, BigInt(in0.commitment));
  const nullifier1 = await poseidonHash2(poseidon, params.senderSpendingKey, BigInt(in1.commitment));
  const outCommitment0 = await noteCommitment(poseidon, params.recipientOwnerPk, tokenField, recipientAmount, outBlinding0);
  const outCommitment1 = await noteCommitment(poseidon, params.feeRecipientOwnerPk, tokenField, changeAmount, outBlinding1);
  const merkle = await buildInputMerklePaths({
    provider,
    poseidonAddress: CONTRACTS.poseidon as `0x${string}`,
    merkleTreeAddress: CONTRACTS.merkleTree as `0x${string}`,
    targetCommitments: [in0.commitment, in1.commitment],
  });
  mark("Generating proof");
  const proof = await generateProof({
    spendingKey: params.senderSpendingKey,
    inAmounts: [in0.amount, in1.amount],
    inBlindings: [in0.blinding, in1.blinding],
    merkleSiblings: [merkle.siblings[0], merkle.siblings[1]],
    merkleDirections: [merkle.directions[0], merkle.directions[1]],
    outAmounts: [recipientAmount, changeAmount],
    outRecipientPks: [toHex32(params.recipientOwnerPk), toHex32(params.feeRecipientOwnerPk)],
    outBlindings: [toHex32(outBlinding0), toHex32(outBlinding1)],
    token: tokenField,
    merkleRoot: merkle.root,
    nullifiers: [nullifier0, nullifier1],
    outCommitments: [outCommitment0, outCommitment1],
    fee,
    feeRecipientPk: toHex32(params.feeRecipientOwnerPk),
  });
  const proofBytes = ethers.getBytes(proof.proof).length;
  const proofDigest = ethers.keccak256(proof.proof).slice(0, 18);
  mark(`Proof generated bytes=${proofBytes} hash=${proofDigest}...; encrypting output notes`);

  const route0 = routeForRecipient(params.recipientViewingPub, 0);
  const route1 = routeForRecipient(params.feeRecipientViewingPub, 0);
  const encryptedNote0 = await encryptNoteECDH(
    {token: tokenField, amount: recipientAmount.toString(), blinding: toHex32(outBlinding0), commitment: outCommitment0},
    params.recipientViewingPub
  );
  const encryptedNote1 = await encryptNoteECDH(
    {token: tokenField, amount: changeAmount.toString(), blinding: toHex32(outBlinding1), commitment: outCommitment1},
    params.feeRecipientViewingPub
  );

  mark("Submitting bundle to relayer");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), relayerTimeoutMs);
  let res: Response;
  try {
    res = await fetch(`${params.relayerUrl}/relay/shielded-transfer`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      signal: controller.signal,
      body: JSON.stringify({
        shieldedTarget: CONTRACTS.pool,
        proof: proof.proof,
        nullifiers: [nullifier0, nullifier1],
        newCommitments: [outCommitment0, outCommitment1],
        encryptedNotes: [encryptedNote0, encryptedNote1],
        channels: [route0.channel, route1.channel],
        subchannels: [route0.subchannel, route1.subchannel],
        merkleRoot: merkle.root,
        token: tokenField,
        fee: fee.toString(),
        feeRecipientPk: toHex32(params.feeRecipientOwnerPk),
        gasLimit: 16_000_000,
      }),
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`Relayer request timed out after ${relayerTimeoutMs}ms`);
    }
    if (err instanceof TypeError) {
      throw new Error(
        `Failed to reach relayer at ${params.relayerUrl}. ` +
        `Ensure relayer is running and extension host permissions allow this URL.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`Relayer rejected request: ${await res.text()}`);
  const payload = await res.json();
  mark(`Relayer accepted request${payload?.requestId ? ` id=${payload.requestId}` : ""}`);
  return {
    ...payload,
    recipientAmount: recipientAmount.toString(),
    fee: fee.toString(),
    consumedCommitments: [in0.commitment, in1.commitment] as [`0x${string}`, `0x${string}`],
  };
}

export async function executeUnshield(params: {
  relayerUrl: string;
  senderSpendingKey: bigint;
  senderViewingPriv: bigint;
  senderViewingPub: `0x${string}`;
  recipientAddress: `0x${string}`;
  amount: bigint;
  onStatus?: (msg: string) => void;
  relayerRequestTimeoutMs?: number;
  scanFromBlock?: number;
  cachedNotes?: DecryptedNote[];
  tokenAddress?: `0x${string}`;
}) {
  const status = params.onStatus ?? (() => {});
  const relayerTimeoutMs = params.relayerRequestTimeoutMs ?? 120000;
  const startedAt = Date.now();
  const mark = (msg: string) => status(`${msg} (+${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);

  const provider = new ethers.JsonRpcProvider(SEPOLIA.rpcUrl, SEPOLIA.chainId);
  const poseidon = new ethers.Contract(CONTRACTS.poseidon, POSEIDON_ABI, provider);
  const pool = new ethers.Contract(CONTRACTS.pool, POOL_ABI, provider);
  const selectedToken = params.tokenAddress ?? (CONTRACTS.token as `0x${string}`);
  const tokenField = ethers.zeroPadValue(selectedToken, 32) as `0x${string}`;
  const tokenFieldNorm = tokenField.toLowerCase();
  const scanFromBlock = params.scanFromBlock ?? POOL_DEPLOY_BLOCK;

  mark(`Scanning shielded notes from block ${scanFromBlock}`);
  const scan = await scanShieldedNotes({
    provider,
    poolAddress: CONTRACTS.pool as `0x${string}`,
    fromBlock: scanFromBlock,
    viewingPriv: params.senderViewingPriv,
    viewingPub: params.senderViewingPub,
  });
  const merged = [...(params.cachedNotes ?? []), ...scan.notes];
  const dedup = new Map<string, DecryptedNote>();
  for (const n of merged) dedup.set(`${n.commitment}:${n.txHash}`, n);
  const discovered = Array.from(dedup.values());
  mark(`Discovered notes=${discovered.length} (new ${scan.notes.length})`);

  const candidates: DecryptedNote[] = [];
  for (const note of discovered) {
    const noteTokenField = normalizeTokenField(note.token);
    if (!noteTokenField || noteTokenField !== tokenFieldNorm) continue;
    if (note.amount !== params.amount) continue;
    const nf = await poseidonHash2(poseidon, params.senderSpendingKey, BigInt(note.commitment));
    const isSpent = await pool.nullifierSet(nf);
    if (!isSpent) candidates.push(note);
  }
  if (candidates.length === 0) {
    throw new Error(
      `No unspent note found with exact amount ${params.amount.toString()} for selected token.`
    );
  }
  const note = candidates[0];
  const nullifier = await poseidonHash2(poseidon, params.senderSpendingKey, BigInt(note.commitment));
  const merkle = await buildMerklePathForCommitment({
    provider,
    poseidonAddress: CONTRACTS.poseidon as `0x${string}`,
    merkleTreeAddress: CONTRACTS.merkleTree as `0x${string}`,
    targetCommitment: note.commitment,
  });

  mark("Generating unshield proof");
  const proof = await generateUnshieldProof({
    spendingKey: params.senderSpendingKey,
    inAmount: note.amount,
    inBlinding: note.blinding,
    merkleSiblings: merkle.siblings,
    merkleDirections: merkle.directions,
    token: tokenField,
    merkleRoot: merkle.root,
    nullifier,
    recipient: params.recipientAddress,
    amount: params.amount,
    tokenAddress: selectedToken,
  });
  const proofBytes = ethers.getBytes(proof.proof).length;
  const proofDigest = ethers.keccak256(proof.proof).slice(0, 18);
  mark(`Unshield proof generated bytes=${proofBytes} hash=${proofDigest}...`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), relayerTimeoutMs);
  let res: Response;
  try {
    res = await fetch(`${params.relayerUrl}/relay/unshield`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      signal: controller.signal,
      body: JSON.stringify({
        shieldedTarget: CONTRACTS.pool,
        proof: proof.proof,
        nullifier,
        token: selectedToken,
        recipient: params.recipientAddress,
        amount: params.amount.toString(),
        merkleRoot: merkle.root,
        gasLimit: 16_000_000,
      }),
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new Error(`Relayer request timed out after ${relayerTimeoutMs}ms`);
    if (err instanceof TypeError) {
      throw new Error(
        `Failed to reach relayer at ${params.relayerUrl}. ` +
        `Ensure relayer is running and extension host permissions allow this URL.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`Relayer rejected request: ${await res.text()}`);
  const payload = await res.json();
  mark(`Relayer accepted unshield request${payload?.requestId ? ` id=${payload.requestId}` : ""}`);
  return payload;
}
