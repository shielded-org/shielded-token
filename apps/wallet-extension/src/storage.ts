import {decryptText, encryptText} from "./crypto";

const VAULT_KEY = "zkwallet.vault.v1";

type WalletVault = {
  encryptedPrivateKey: {salt: string; iv: string; ciphertext: string};
  address: `0x${string}`;
};

export async function storePrivateKey(privateKey: `0x${string}`, password: string, address: `0x${string}`) {
  const encryptedPrivateKey = await encryptText(privateKey, password);
  const vault: WalletVault = {encryptedPrivateKey, address};
  localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
}

export function readVaultMeta(): {address: `0x${string}`} | null {
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as WalletVault;
  return {address: parsed.address};
}

export async function unlockPrivateKey(password: string): Promise<`0x${string}`> {
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) throw new Error("No wallet vault found");
  const parsed = JSON.parse(raw) as WalletVault;
  const decrypted = await decryptText(parsed.encryptedPrivateKey, password);
  if (!decrypted.startsWith("0x")) throw new Error("Invalid vault payload");
  return decrypted as `0x${string}`;
}

export function clearVault() {
  localStorage.removeItem(VAULT_KEY);
}
