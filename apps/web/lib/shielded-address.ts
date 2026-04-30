import {ethers} from "ethers";

const FORMAT_VERSION = 1;
const PREFIX = "shd_";
const OWNER_PK_BYTES = 32;
const VIEWING_PUB_BYTES = 33;
const CHECKSUM_BYTES = 4;
const PAYLOAD_BYTES = 1 + 4 + OWNER_PK_BYTES + VIEWING_PUB_BYTES;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "===".slice((b64.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function checksum4(payload: Uint8Array): Uint8Array {
  const digest = ethers.getBytes(ethers.keccak256(payload));
  return digest.slice(0, CHECKSUM_BYTES);
}

function u32be(value: number): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = (value >>> 24) & 0xff;
  out[1] = (value >>> 16) & 0xff;
  out[2] = (value >>> 8) & 0xff;
  out[3] = value & 0xff;
  return out;
}

function readU32be(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]);
}

export function encodeShieldedAddress(params: {ownerPk: bigint; viewingPub: `0x${string}`; chainId: number;}): string {
  const ownerBytes = ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(params.ownerPk), OWNER_PK_BYTES));
  const viewingBytes = ethers.getBytes(params.viewingPub);
  if (viewingBytes.length !== VIEWING_PUB_BYTES) throw new Error("Viewing public key must be compressed (33 bytes).");
  const payload = new Uint8Array(PAYLOAD_BYTES);
  payload[0] = FORMAT_VERSION;
  payload.set(u32be(params.chainId), 1);
  payload.set(ownerBytes, 5);
  payload.set(viewingBytes, 5 + OWNER_PK_BYTES);
  const full = new Uint8Array(PAYLOAD_BYTES + CHECKSUM_BYTES);
  full.set(payload, 0);
  full.set(checksum4(payload), PAYLOAD_BYTES);
  return `${PREFIX}${toBase64Url(full)}`;
}

export function decodeShieldedAddress(address: string) {
  if (!address.startsWith(PREFIX)) throw new Error("Invalid shielded address prefix.");
  const raw = fromBase64Url(address.slice(PREFIX.length));
  if (raw.length !== PAYLOAD_BYTES + CHECKSUM_BYTES) throw new Error("Invalid shielded address length.");
  const payload = raw.slice(0, PAYLOAD_BYTES);
  const givenChecksum = raw.slice(PAYLOAD_BYTES);
  const expectedChecksum = checksum4(payload);
  for (let i = 0; i < CHECKSUM_BYTES; i += 1) if (givenChecksum[i] !== expectedChecksum[i]) throw new Error("Invalid shielded address checksum.");
  const version = payload[0];
  if (version !== FORMAT_VERSION) throw new Error(`Unsupported shielded address version ${version}.`);
  const chainId = readU32be(payload, 1);
  const ownerPk = BigInt(ethers.hexlify(payload.slice(5, 5 + OWNER_PK_BYTES)));
  const viewingPub = ethers.hexlify(payload.slice(5 + OWNER_PK_BYTES, 5 + OWNER_PK_BYTES + VIEWING_PUB_BYTES)) as `0x${string}`;
  return {ownerPk, viewingPub, chainId, version};
}
