"use client";

import {ethers} from "ethers";
import {CONTRACTS, ERC20_ABI, POOL_ABI, POOL_DEPLOY_BLOCK, POSEIDON_ABI, SEPOLIA} from "./shielded-config";
import {deriveOwnerPk, deriveUserKeys, keySeedFromWalletSignature, viewingPrivToPub} from "./keys";
import {scanShieldedNotes, type DecryptedNote} from "./shielded";

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

export async function deriveShieldedKeysFromWallet(address: `0x${string}`, signMessage: (message: string) => Promise<`0x${string}`>) {
  const signature = await signMessage("Shielded key derivation consent (deterministic, no transaction)");
  const seed = keySeedFromWalletSignature(address, signature);
  const owner = deriveUserKeys(seed, "owner");
  const feeRecipient = deriveUserKeys(seed, "feeRecipient");
  const provider = new ethers.JsonRpcProvider(SEPOLIA.rpcUrl, SEPOLIA.chainId);
  const poseidon = new ethers.Contract(CONTRACTS.poseidon, POSEIDON_ABI, provider);
  const ownerPk = await deriveOwnerPk(owner.spendingKey, poseidon);
  const feeRecipientPk = await deriveOwnerPk(feeRecipient.spendingKey, poseidon);
  return {
    ownerPk,
    spendingKey: owner.spendingKey,
    viewingPriv: owner.viewingPriv,
    viewingPub: viewingPrivToPub(owner.viewingPriv),
    feeRecipientPk,
  };
}

export async function scanPrivateState(viewingPriv: bigint, viewingPub: `0x${string}`, fromBlock = POOL_DEPLOY_BLOCK) {
  const provider = new ethers.JsonRpcProvider(SEPOLIA.rpcUrl, SEPOLIA.chainId);
  return scanShieldedNotes({
    provider,
    poolAddress: CONTRACTS.pool,
    fromBlock,
    viewingPriv,
    viewingPub,
  });
}

export async function shieldDeposit(params: {
  signer: ethers.Signer;
  ownerPk: bigint;
  viewingPub: `0x${string}`;
  tokenAddress: `0x${string}`;
  amount: bigint;
}) {
  const provider = new ethers.JsonRpcProvider(SEPOLIA.rpcUrl, SEPOLIA.chainId);
  const poseidon = new ethers.Contract(CONTRACTS.poseidon, POSEIDON_ABI, provider);
  const token = new ethers.Contract(params.tokenAddress, ERC20_ABI, params.signer);
  const pool = new ethers.Contract(CONTRACTS.pool, POOL_ABI, params.signer);
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
  const channel = ethers.keccak256(params.viewingPub);
  const subchannel = ethers.solidityPackedKeccak256(["bytes32", "uint64"], [channel, 0n]);
  const approveTx = await token.approve(CONTRACTS.pool, params.amount);
  await approveTx.wait();
  const shieldTx = await pool.shieldRouted(params.tokenAddress, params.amount, toHex32(commitment), envelope, channel, subchannel);
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

export function mapNotesToUi(notes: DecryptedNote[]) {
  return notes.map((n, idx) => ({
    id: `${n.commitment}-${idx}`,
    token: "sUSD",
    amount: ethers.formatUnits(n.amount, 18),
    status: "unspent" as const,
    commitment: n.commitment,
    encryptedNote: "0x" as `0x${string}`,
    discoveredAt: new Date().toISOString(),
    source: "shield" as const,
    txHash: n.txHash,
  }));
}
