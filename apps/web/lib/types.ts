export type AppMode = "monolith" | "pool";

export type NoteStatus = "unspent" | "spent";

export type TransactionStatus = "pending" | "submitted" | "confirmed" | "failed";

export type TransactionKind = "shield" | "transfer" | "unshield";

export type TokenDefinition = {
  symbol: string;
  name: string;
  decimals: number;
  accent: string;
  icon: string;
  contractAddress: `0x${string}`;
};

/** Pool chain this note was discovered on; must match UI pool network (no cross-chain mixing). */
export type ShieldedPoolChainId = 11155111 | 84532 | 421614;

export type Note = {
  id: string;
  shieldedChainId: ShieldedPoolChainId;
  token: string;
  /** Canonical ERC-20 address from the note payload (32-byte–padded in ciphertext). Used when `token` is a fallback label. */
  tokenContractAddress?: `0x${string}`;
  amount: string;
  status: NoteStatus;
  commitment: `0x${string}`;
  nullifier?: `0x${string}`;
  encryptedNote: `0x${string}`;
  discoveredAt: string;
  source: TransactionKind;
  txHash?: `0x${string}`;
};

export type TransactionRecord = {
  id: string;
  kind: TransactionKind;
  token: string;
  amount: string;
  createdAt: string;
  status: TransactionStatus;
  txHash?: `0x${string}`;
  requestId?: string;
  counterparty?: string;
};

export type RelayerHealth = {
  ok: boolean;
  latencyMs: number | null;
  checkedAt: string;
};

export type ProofStep = "witness" | "proof" | "submit" | "confirm";

/** JSON-safe decrypted note for persisted incremental pool scans (matches wallet extension cache intent). */
export type StoredDecryptedNote = {
  commitment: `0x${string}`;
  amount: string;
  blinding: `0x${string}`;
  token: `0x${string}`;
  txHash: `0x${string}`;
};

/** Keyed by `${chainId}:${poolAddressLower}` — holds decrypted notes + cursor like extension local scan cache. */
export type ShieldedScanCacheRow = {
  viewingPub: string;
  lastScannedBlock: number;
  notes: StoredDecryptedNote[];
};
