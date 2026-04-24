import {toHex} from "viem";

import {hashField} from "./hash";
import type {Hex, ShieldedTransferInput, ShieldedTransferProofBundle} from "./types";

function toBytes32(value: bigint): Hex {
  return toHex(value, {size: 32});
}

function noteCommitment(ownerPk: bigint, token: Hex, amount: bigint, blinding: bigint): bigint {
  return hashField(ownerPk, token, amount, blinding);
}

function nullifier(spendingKey: bigint, commitment: bigint): bigint {
  return hashField(spendingKey, commitment);
}

export function buildShieldedTransferBundle(input: ShieldedTransferInput): ShieldedTransferProofBundle {
  const ownerPk = hashField(input.spendingKey, 23n);

  const inCommitment0 = noteCommitment(ownerPk, input.token, input.inAmount0, input.inBlinding0);
  const inCommitment1 = noteCommitment(ownerPk, input.token, input.inAmount1, input.inBlinding1);

  const outCommitment0 = noteCommitment(
    input.outRecipientPk0,
    input.token,
    input.outAmount0,
    input.outBlinding0
  );
  const outCommitment1 = noteCommitment(
    input.outRecipientPk1,
    input.token,
    input.outAmount1,
    input.outBlinding1
  );

  const nullifier0 = nullifier(input.spendingKey, inCommitment0);
  const nullifier1 = nullifier(input.spendingKey, inCommitment1);

  const balanceIn = input.inAmount0 + input.inAmount1;
  const balanceOut = input.outAmount0 + input.outAmount1 + input.fee;
  if (balanceIn !== balanceOut) {
    throw new Error(`Balance mismatch: ${balanceIn} != ${balanceOut}`);
  }

  // Placeholder proof bytes for phase scaffolding. Replace with bb.js output.
  const proofMaterial = hashField(
    inCommitment0,
    inCommitment1,
    outCommitment0,
    outCommitment1,
    input.merkleRoot
  );
  const proof = toBytes32(proofMaterial);

  return {
    proof,
    nullifiers: [toBytes32(nullifier0), toBytes32(nullifier1)],
    newCommitments: [toBytes32(outCommitment0), toBytes32(outCommitment1)],
    merkleRoot: input.merkleRoot,
    token: input.token,
    fee: input.fee,
    createdAtMs: Date.now(),
  };
}
