import {ethers} from "ethers";

const BN254_FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const SECP256K1_GROUP_ORDER = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

function toHex32(v: bigint): `0x${string}` {
  return ethers.zeroPadValue(ethers.toBeHex(v), 32) as `0x${string}`;
}

function deriveScalar(seedBytes32: `0x${string}`, label: string, modulus: bigint) {
  const digest = ethers.solidityPackedKeccak256(["string", "bytes32", "string"], ["zkproject-key-v1", seedBytes32, label]);
  return (BigInt(digest) % (modulus - 1n)) + 1n;
}

export function keySeedFromPrivateKey(privateKey: `0x${string}`): `0x${string}` {
  return ethers.solidityPackedKeccak256(["string", "bytes32"], ["zkproject-wallet-seed-v1", privateKey]) as `0x${string}`;
}

export function keySeedFromWalletSignature(address: `0x${string}`, signature: `0x${string}`): `0x${string}` {
  return ethers.solidityPackedKeccak256(["string", "address", "bytes"], ["zkproject-wallet-seed-v1", address, signature]) as `0x${string}`;
}

export function deriveUserKeys(seedBytes32: `0x${string}`, label: string) {
  const spendingKey = deriveScalar(seedBytes32, `${label}:spending`, BN254_FIELD_MODULUS);
  const viewingPriv = deriveScalar(seedBytes32, `${label}:viewing`, SECP256K1_GROUP_ORDER);
  return {spendingKey, viewingPriv};
}

export function viewingPrivToPub(viewingPriv: bigint): `0x${string}` {
  const key = new ethers.SigningKey(toHex32(viewingPriv));
  return key.compressedPublicKey as `0x${string}`;
}

export async function deriveOwnerPk(spendingKey: bigint, poseidon: ethers.Contract): Promise<bigint> {
  const out = await poseidon.hash_2(spendingKey, 1n);
  return BigInt(out.toString());
}
