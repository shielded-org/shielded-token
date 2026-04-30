import {ethers} from "ethers";
import {POOL_ABI} from "./shielded-config";

export type DecryptedNote = {
  commitment: `0x${string}`;
  amount: bigint;
  blinding: `0x${string}`;
  token: `0x${string}`;
  txHash: `0x${string}`;
};

function toHex32(v: bigint): `0x${string}` {
  return ethers.zeroPadValue(ethers.toBeHex(v), 32) as `0x${string}`;
}

async function getLogsChunked(params: {
  provider: ethers.JsonRpcProvider;
  address: `0x${string}`;
  fromBlock: number;
  toBlock: number;
  topics: (string | string[] | null)[];
  chunkSize?: number;
}) {
  const out: ethers.Log[] = [];
  const chunkSize = params.chunkSize ?? 50_000;
  let start = params.fromBlock;
  while (start <= params.toBlock) {
    const end = Math.min(start + chunkSize - 1, params.toBlock);
    const part = await params.provider.getLogs({address: params.address, fromBlock: start, toBlock: end, topics: params.topics});
    out.push(...part);
    start = end + 1;
  }
  return out;
}

export function decryptNoteECDH(encryptedNoteHex: `0x${string}`, recipientViewingPriv: bigint) {
  const envelopeRaw = ethers.toUtf8String(encryptedNoteHex);
  const envelope = JSON.parse(envelopeRaw) as {
    v: number; eph: `0x${string}`; salt: `0x${string}`; iv: `0x${string}`; ct: `0x${string}`; tag: `0x${string}`;
  };
  if (envelope.v !== 1) return null;
  const key = new ethers.SigningKey(toHex32(recipientViewingPriv));
  const sharedSecretHex = key.computeSharedSecret(envelope.eph);
  return {envelope, sharedSecretHex} as const;
}

function bytesFromHex(hex: `0x${string}`): Uint8Array {
  return ethers.getBytes(hex);
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return Uint8Array.from(data).buffer;
}

async function hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length = 32): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({name: "HKDF", hash: "SHA-256", salt: toArrayBuffer(salt), info: toArrayBuffer(info)}, key, length * 8);
  return new Uint8Array(bits);
}

export async function decryptEnvelope(encryptedNoteHex: `0x${string}`, recipientViewingPriv: bigint) {
  try {
    const pre = decryptNoteECDH(encryptedNoteHex, recipientViewingPriv);
    if (!pre) return null;
    const salt = bytesFromHex(pre.envelope.salt);
    const iv = bytesFromHex(pre.envelope.iv);
    const ct = bytesFromHex(pre.envelope.ct);
    const tag = bytesFromHex(pre.envelope.tag);
    const key = await hkdfSha256(bytesFromHex(pre.sharedSecretHex as `0x${string}`), salt, new TextEncoder().encode("zkproject-note-v1"), 32);
    const cryptoKey = await crypto.subtle.importKey("raw", toArrayBuffer(key), "AES-GCM", false, ["decrypt"]);
    const fullCipher = new Uint8Array(ct.length + tag.length);
    fullCipher.set(ct);
    fullCipher.set(tag, ct.length);
    const plaintext = await crypto.subtle.decrypt({name: "AES-GCM", iv: toArrayBuffer(iv)}, cryptoKey, toArrayBuffer(fullCipher));
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as {token: `0x${string}`; amount: string; blinding: `0x${string}`; commitment: `0x${string}`;};
    if (!parsed?.token || !parsed?.amount || !parsed?.commitment) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function scanShieldedNotes(params: {
  provider: ethers.JsonRpcProvider;
  poolAddress: `0x${string}`;
  fromBlock: number;
  viewingPriv: bigint;
  viewingPub: `0x${string}`;
}) {
  const iface = new ethers.Interface(POOL_ABI);
  const event = iface.getEvent("RoutedCommitment");
  if (!event) return {notes: [] as DecryptedNote[], stats: {channel: ethers.ZeroHash as `0x${string}`, latestBlock: 0, totalLogs: 0, decryptSuccess: 0}};
  const topic = event.topicHash;
  const channel = ethers.keccak256(params.viewingPub);
  const latestBlock = await params.provider.getBlockNumber();
  const logs = await getLogsChunked({
    provider: params.provider,
    address: params.poolAddress,
    fromBlock: params.fromBlock,
    toBlock: latestBlock,
    topics: [topic, channel],
    chunkSize: 50_000,
  });
  const notes: DecryptedNote[] = [];
  let decryptSuccess = 0;
  for (const log of logs) {
    const parsed = iface.parseLog(log);
    if (!parsed) continue;
    const encrypted = parsed.args.encryptedNote as `0x${string}`;
    const note = await decryptEnvelope(encrypted, params.viewingPriv);
    if (!note) continue;
    decryptSuccess += 1;
    notes.push({commitment: note.commitment, amount: BigInt(note.amount), blinding: note.blinding, token: note.token, txHash: log.transactionHash as `0x${string}`});
  }
  return {notes, stats: {channel: channel as `0x${string}`, latestBlock, totalLogs: logs.length, decryptSuccess}};
}
