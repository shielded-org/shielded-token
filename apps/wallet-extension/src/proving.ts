import {ethers} from "ethers";
import {Noir} from "@noir-lang/noir_js";
import {UltraPlonkBackend} from "@aztec/bb.js";

type CircuitJson = {
  bytecode: string;
  abi: unknown;
};

function normalizeProofToBytes(raw: unknown): Uint8Array {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (typeof raw === "string") {
    if (!raw.startsWith("0x")) throw new Error("Unexpected proof string format");
    return ethers.getBytes(raw);
  }
  // Support older/newer backend wrappers that expose { proof } with varying types.
  if (raw && typeof raw === "object" && "proof" in (raw as Record<string, unknown>)) {
    return normalizeProofToBytes((raw as Record<string, unknown>).proof);
  }
  throw new Error("Unsupported proof format returned by UltraHonkBackend");
}

function toHex32(v: bigint): `0x${string}` {
  return ethers.zeroPadValue(ethers.toBeHex(v), 32) as `0x${string}`;
}

export async function loadCircuitArtifact(): Promise<CircuitJson> {
  const res = await fetch("/circuits/shielded_transfer.json");
  if (!res.ok) throw new Error("Missing shielded_transfer.json in extension public assets");
  return (await res.json()) as CircuitJson;
}

export async function generateProof(params: {
  spendingKey: bigint;
  inAmounts: [bigint, bigint];
  inBlindings: [`0x${string}`, `0x${string}`];
  merkleSiblings: [`0x${string}`[], `0x${string}`[]];
  merkleDirections: [boolean[], boolean[]];
  outAmounts: [bigint, bigint];
  outRecipientPks: [`0x${string}`, `0x${string}`];
  outBlindings: [`0x${string}`, `0x${string}`];
  token: `0x${string}`;
  merkleRoot: `0x${string}`;
  nullifiers: [`0x${string}`, `0x${string}`];
  outCommitments: [`0x${string}`, `0x${string}`];
  fee: bigint;
  feeRecipientPk: `0x${string}`;
  mode?: bigint;
  unshieldRecipient?: `0x${string}`;
  unshieldAmount?: bigint;
  unshieldTokenAddress?: `0x${string}`;
}) {
  const circuit = await loadCircuitArtifact();
  const noir = new Noir(circuit as never);
  const backend = new UltraPlonkBackend((circuit as any).bytecode, {threads: 2} as any);
  const inputs = {
    spending_key: toHex32(params.spendingKey),
    in_amounts: [params.inAmounts[0].toString(), params.inAmounts[1].toString()],
    in_blindings: [params.inBlindings[0], params.inBlindings[1]],
    merkle_siblings: [params.merkleSiblings[0], params.merkleSiblings[1]],
    merkle_directions: [params.merkleDirections[0], params.merkleDirections[1]],
    out_amounts: [params.outAmounts[0].toString(), params.outAmounts[1].toString()],
    out_recipient_pks: [params.outRecipientPks[0], params.outRecipientPks[1]],
    out_blindings: [params.outBlindings[0], params.outBlindings[1]],
    token: params.token,
    merkle_root: params.merkleRoot,
    nullifiers: [params.nullifiers[0], params.nullifiers[1]],
    out_commitments: [params.outCommitments[0], params.outCommitments[1]],
    fee: params.fee.toString(),
    fee_recipient_pk: params.feeRecipientPk,
    mode: (params.mode ?? 0n).toString(),
    unshield_recipient: ethers.zeroPadValue(params.unshieldRecipient ?? "0x00", 32),
    unshield_amount: (params.unshieldAmount ?? 0n).toString(),
    unshield_token_address: ethers.zeroPadValue(params.unshieldTokenAddress ?? "0x00", 32),
  };

  const witnessResult = await noir.execute(inputs as any);
  const proofData = await (backend as any).generateProof(witnessResult.witness);
  const proofBytes = normalizeProofToBytes(proofData);
  return {
    proof: ethers.hexlify(proofBytes) as `0x${string}`,
  };
}

export async function generateUnshieldProof(params: {
  spendingKey: bigint;
  inAmount: bigint;
  inBlinding: `0x${string}`;
  merkleSiblings: `0x${string}`[];
  merkleDirections: boolean[];
  token: `0x${string}`;
  merkleRoot: `0x${string}`;
  nullifier: `0x${string}`;
  recipient: `0x${string}`;
  amount: bigint;
  tokenAddress: `0x${string}`;
  changeAmount: bigint;
  changeOwnerPk: `0x${string}`;
  changeBlinding: `0x${string}`;
  changeCommitment: `0x${string}`;
}) {
  return generateProof({
    spendingKey: params.spendingKey,
    inAmounts: [params.inAmount, 0n],
    inBlindings: [params.inBlinding, "0x0000000000000000000000000000000000000000000000000000000000000000"],
    merkleSiblings: [params.merkleSiblings, new Array(20).fill("0x0000000000000000000000000000000000000000000000000000000000000000")],
    merkleDirections: [params.merkleDirections, new Array(20).fill(false)],
    outAmounts: [params.changeAmount, 0n],
    outRecipientPks: [params.changeOwnerPk, "0x0000000000000000000000000000000000000000000000000000000000000000"],
    outBlindings: [params.changeBlinding, "0x0000000000000000000000000000000000000000000000000000000000000000"],
    token: params.token,
    merkleRoot: params.merkleRoot,
    nullifiers: [params.nullifier, "0x0000000000000000000000000000000000000000000000000000000000000000"],
    outCommitments: [params.changeCommitment, "0x0000000000000000000000000000000000000000000000000000000000000000"],
    fee: 0n,
    feeRecipientPk: "0x0000000000000000000000000000000000000000000000000000000000000000",
    mode: 1n,
    unshieldRecipient: params.recipient,
    unshieldAmount: params.amount,
    unshieldTokenAddress: params.tokenAddress,
  });
}
