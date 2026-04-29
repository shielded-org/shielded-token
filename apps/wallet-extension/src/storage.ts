import {ethers} from "ethers";
import {decryptText, encryptText} from "./crypto";

const VAULT_KEY = "zkwallet.vault.v1";
const VAULT_ACCOUNTS_KEY = "zkwallet.vault.accounts.v1";
const VAULT_LAST_ACCOUNT_KEY = "zkwallet.vault.lastAccountId.v1";
const VAULT_MNEMONIC_KEY = "zkwallet.vault.mnemonic.v1";

type WalletVault = {
  encryptedPrivateKey: {salt: string; iv: string; ciphertext: string};
  address: `0x${string}`;
  encryptedMnemonic?: {salt: string; iv: string; ciphertext: string};
  mnemonic?: string;
  phrase?: string;
};

type WalletVaultAccount = {
  id: string;
  name: string;
  encryptedPrivateKey: {salt: string; iv: string; ciphertext: string};
  kind?: "imported" | "derived";
  derivationIndex?: number;
  address: `0x${string}`;
};

function readVaultAccountsRaw(): WalletVaultAccount[] {
  const raw = localStorage.getItem(VAULT_ACCOUNTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as WalletVaultAccount[];
  } catch {
    return [];
  }
}

function writeVaultAccountsRaw(accounts: WalletVaultAccount[]) {
  localStorage.setItem(VAULT_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function migrateSingleVaultIntoAccountsIfNeeded() {
  const accounts = readVaultAccountsRaw();
  if (accounts.length > 0) return;
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as WalletVault;
    const migrated: WalletVaultAccount = {
      id: crypto.randomUUID(),
      name: "Account 1",
      encryptedPrivateKey: parsed.encryptedPrivateKey,
      address: parsed.address,
    };
    writeVaultAccountsRaw([migrated]);
  } catch {
    // ignore invalid legacy payload
  }
}

export async function storePrivateKey(
  privateKey: `0x${string}`,
  password: string,
  address: `0x${string}`,
  mnemonic?: string
) {
  const encryptedPrivateKey = await encryptText(privateKey, password);
  if (mnemonic) {
    const encryptedMnemonic = await encryptText(mnemonic, password);
    localStorage.setItem(VAULT_MNEMONIC_KEY, JSON.stringify(encryptedMnemonic));
  }
  const vault: WalletVault = {encryptedPrivateKey, address};
  localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
  migrateSingleVaultIntoAccountsIfNeeded();
  const accounts = readVaultAccountsRaw();
  const exists = accounts.some((a) => a.address.toLowerCase() === address.toLowerCase());
  if (!exists) {
    accounts.push({
      id: crypto.randomUUID(),
      name: `Account ${accounts.length + 1}`,
      encryptedPrivateKey,
      kind: mnemonic ? "derived" : "imported",
      derivationIndex: mnemonic ? 0 : undefined,
      address,
    });
    writeVaultAccountsRaw(accounts);
  }
}

export function readVaultMeta(): {address: `0x${string}`} | null {
  migrateSingleVaultIntoAccountsIfNeeded();
  const accounts = readVaultAccountsRaw();
  if (accounts.length > 0) return {address: accounts[0].address};
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as WalletVault;
  return {address: parsed.address};
}

export async function unlockPrivateKey(password: string): Promise<`0x${string}`> {
  migrateSingleVaultIntoAccountsIfNeeded();
  const accounts = readVaultAccountsRaw();
  if (accounts.length > 0) {
    const decrypted = await decryptText(accounts[0].encryptedPrivateKey, password);
    if (!decrypted.startsWith("0x")) throw new Error("Invalid vault payload");
    return decrypted as `0x${string}`;
  }
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) throw new Error("No wallet vault found");
  const parsed = JSON.parse(raw) as WalletVault;
  const decrypted = await decryptText(parsed.encryptedPrivateKey, password);
  if (!decrypted.startsWith("0x")) throw new Error("Invalid vault payload");
  return decrypted as `0x${string}`;
}

export function clearVault() {
  localStorage.removeItem(VAULT_KEY);
  localStorage.removeItem(VAULT_ACCOUNTS_KEY);
  localStorage.removeItem(VAULT_LAST_ACCOUNT_KEY);
  localStorage.removeItem(VAULT_MNEMONIC_KEY);
}

export function listVaultAccountsMeta(): Array<{id: string; name: string; address: `0x${string}`}> {
  migrateSingleVaultIntoAccountsIfNeeded();
  return readVaultAccountsRaw().map((a) => ({id: a.id, name: a.name, address: a.address}));
}

export async function unlockVaultAccount(accountId: string, password: string): Promise<`0x${string}`> {
  migrateSingleVaultIntoAccountsIfNeeded();
  const account = readVaultAccountsRaw().find((a) => a.id === accountId);
  if (!account) throw new Error("Account not found");
  if (account.kind === "derived" && Number.isInteger(account.derivationIndex)) {
    const mnemonic = await readWalletMnemonic(password);
    if (!mnemonic) throw new Error("Wallet mnemonic unavailable");
    const hd = ethers.HDNodeWallet.fromPhrase(mnemonic, "", `m/44'/60'/0'/0/${account.derivationIndex}`);
    return hd.privateKey as `0x${string}`;
  }
  const decrypted = await decryptText(account.encryptedPrivateKey, password);
  if (!decrypted.startsWith("0x")) throw new Error("Invalid vault payload");
  return decrypted as `0x${string}`;
}

export async function addVaultAccount(params: {
  privateKey: `0x${string}`;
  password: string;
  address: `0x${string}`;
  name?: string;
  kind?: "imported" | "derived";
  derivationIndex?: number;
}) {
  migrateSingleVaultIntoAccountsIfNeeded();
  const encryptedPrivateKey = await encryptText(params.privateKey, params.password);
  const accounts = readVaultAccountsRaw();
  const exists = accounts.some((a) => a.address.toLowerCase() === params.address.toLowerCase());
  if (exists) return;
  accounts.push({
    id: crypto.randomUUID(),
    name: params.name?.trim() || `Account ${accounts.length + 1}`,
    encryptedPrivateKey,
    kind: params.kind || "imported",
    derivationIndex: params.derivationIndex,
    address: params.address,
  });
  writeVaultAccountsRaw(accounts);
}

export function removeVaultAccount(accountId: string) {
  const filtered = readVaultAccountsRaw().filter((a) => a.id !== accountId);
  writeVaultAccountsRaw(filtered);
}

export function readLastOpenedAccountId(): string | null {
  const raw = localStorage.getItem(VAULT_LAST_ACCOUNT_KEY);
  return raw || null;
}

export function setLastOpenedAccountId(accountId: string) {
  localStorage.setItem(VAULT_LAST_ACCOUNT_KEY, accountId);
}

export async function readWalletMnemonic(password: string): Promise<string | null> {
  const raw = localStorage.getItem(VAULT_MNEMONIC_KEY);
  if (raw) {
    const encryptedMnemonic = JSON.parse(raw) as {salt: string; iv: string; ciphertext: string};
    const decrypted = await decryptText(encryptedMnemonic, password);
    return decrypted || null;
  }

  // Legacy fallback: recover mnemonic if older vault payload embedded it.
  const legacyRaw = localStorage.getItem(VAULT_KEY);
  if (!legacyRaw) return null;
  try {
    const parsed = JSON.parse(legacyRaw) as WalletVault;
    if (parsed.encryptedMnemonic) {
      const decrypted = await decryptText(parsed.encryptedMnemonic, password);
      if (decrypted) {
        const reEncrypted = await encryptText(decrypted, password);
        localStorage.setItem(VAULT_MNEMONIC_KEY, JSON.stringify(reEncrypted));
        return decrypted;
      }
    }
    const legacyPhrase = parsed.mnemonic || parsed.phrase;
    if (legacyPhrase && legacyPhrase.trim()) {
      const normalized = legacyPhrase.trim();
      const reEncrypted = await encryptText(normalized, password);
      localStorage.setItem(VAULT_MNEMONIC_KEY, JSON.stringify(reEncrypted));
      return normalized;
    }
  } catch {
    return null;
  }
  return null;
}

export async function addVaultDerivedAccount(password: string, name?: string): Promise<{id: string; address: `0x${string}`}> {
  migrateSingleVaultIntoAccountsIfNeeded();
  const mnemonic = await readWalletMnemonic(password);
  if (!mnemonic) throw new Error("Wallet mnemonic unavailable. Restore from recovery phrase to enable derived account creation.");
  const accounts = readVaultAccountsRaw();
  const existingAddresses = new Set(accounts.map((a) => a.address.toLowerCase()));
  const maxIndex = accounts
    .filter((a) => Number.isInteger(a.derivationIndex))
    .reduce((acc, a) => Math.max(acc, a.derivationIndex as number), -1);
  // Legacy vaults may have a root mnemonic account without derivation metadata.
  // In that case, start at index 1 to avoid recreating the existing index 0 address.
  let nextIndex = maxIndex >= 0 ? maxIndex + 1 : (accounts.length > 0 ? 1 : 0);
  let hd = ethers.HDNodeWallet.fromPhrase(mnemonic, "", `m/44'/60'/0'/0/${nextIndex}`);
  while (existingAddresses.has(hd.address.toLowerCase())) {
    nextIndex += 1;
    hd = ethers.HDNodeWallet.fromPhrase(mnemonic, "", `m/44'/60'/0'/0/${nextIndex}`);
  }
  const encryptedPrivateKey = await encryptText(hd.privateKey as `0x${string}`, password);
  const account: WalletVaultAccount = {
    id: crypto.randomUUID(),
    name: name?.trim() || `Account ${accounts.length + 1}`,
    encryptedPrivateKey,
    kind: "derived",
    derivationIndex: nextIndex,
    address: hd.address as `0x${string}`,
  };
  accounts.push(account);
  writeVaultAccountsRaw(accounts);
  return {id: account.id, address: account.address};
}
