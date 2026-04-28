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

export type Note = {
  id: string;
  token: string;
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
