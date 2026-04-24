export type Hex = `0x${string}`;

export type ShieldedTransferInput = {
  token: Hex;
  merkleRoot: Hex;
  fee: bigint;
  spendingKey: bigint;
  inAmount0: bigint;
  inAmount1: bigint;
  inBlinding0: bigint;
  inBlinding1: bigint;
  outAmount0: bigint;
  outAmount1: bigint;
  outRecipientPk0: bigint;
  outRecipientPk1: bigint;
  outBlinding0: bigint;
  outBlinding1: bigint;
};

export type ShieldedTransferProofBundle = {
  proof: Hex;
  nullifiers: [Hex, Hex];
  newCommitments: [Hex, Hex];
  merkleRoot: Hex;
  token: Hex;
  fee: bigint;
  createdAtMs: number;
};

export type NewCommitmentEvent = {
  txHash: Hex;
  commitment: Hex;
  ciphertext: Hex;
  senderHint: Hex;
  index: number;
};

export type DiscoveredNote = {
  txHash: Hex;
  commitment: Hex;
  amount: bigint;
  ownerTag: Hex;
  noteIndex: number;
};
