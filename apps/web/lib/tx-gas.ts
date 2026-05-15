import {ethers} from "ethers";
import {CHAIN_ID_ARBITRUM_SEPOLIA, CHAIN_ID_BASE_SEPOLIA} from "./networks";

type L2GasKind = "approve" | "shield" | "mint";

const L2_GAS: Partial<
  Record<
    number,
    {
      approveFloor: bigint;
      shieldFloor: bigint;
      mintFloor: bigint;
      approveMulBps: bigint;
      shieldMulBps: bigint;
      mintMulBps: bigint;
    }
  >
> = {
  [CHAIN_ID_ARBITRUM_SEPOLIA]: {
    approveFloor: 450_000n,
    shieldFloor: 6_000_000n,
    mintFloor: 900_000n,
    approveMulBps: 16_000n,
    shieldMulBps: 16_000n,
    mintMulBps: 16_000n,
  },
  [CHAIN_ID_BASE_SEPOLIA]: {
    approveFloor: 250_000n,
    shieldFloor: 4_000_000n,
    mintFloor: 600_000n,
    approveMulBps: 14_000n,
    shieldMulBps: 14_000n,
    mintMulBps: 14_000n,
  },
};

/**
 * Public L2 RPCs and wallets often under-estimate gas for heavy pool calls (especially Arbitrum).
 * Returns explicit `gasLimit` when on known L2 testnets so MetaMask does not submit with a cap that reverts out-of-gas.
 */
export async function l2GasLimitOverride(
  signer: ethers.Signer,
  estimateGas: () => Promise<bigint>,
  kind: L2GasKind
): Promise<{gasLimit: bigint} | undefined> {
  const prov = signer.provider;
  if (!prov) return undefined;
  const {chainId} = await prov.getNetwork();
  const cid = Number(chainId);
  const row = L2_GAS[cid];
  if (!row) return undefined;
  const floor = kind === "approve" ? row.approveFloor : kind === "mint" ? row.mintFloor : row.shieldFloor;
  const mul = kind === "approve" ? row.approveMulBps : kind === "mint" ? row.mintMulBps : row.shieldMulBps;
  try {
    const est = await estimateGas();
    const bumped = (est * mul) / 10_000n;
    return {gasLimit: bumped > floor ? bumped : floor};
  } catch {
    return {gasLimit: floor};
  }
}

/**
 * Ensure EIP-1559 caps clear the latest base fee. Wallets/RPCs sometimes return stale `maxFeePerGas`
 * (e.g. Arbitrum Sepolia), which triggers "max fee per gas less than block base fee".
 */
export async function txFeeOverrides(provider: ethers.Provider): Promise<{
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasPrice?: bigint;
}> {
  const latest = await provider.getBlock("latest");
  const base = latest?.baseFeePerGas;
  const fee = await provider.getFeeData();

  if (base != null) {
    let prio = fee.maxPriorityFeePerGas ?? 100_000n;
    if (prio < 100_000n) prio = 100_000n;
    const suggested = fee.maxFeePerGas ?? 0n;
    const minFromBase = (base * 15n) / 10n + prio;
    const maxFee = suggested > minFromBase ? suggested : minFromBase;
    return {maxFeePerGas: maxFee, maxPriorityFeePerGas: prio};
  }

  if (fee.gasPrice != null && fee.gasPrice > 0n) {
    return {gasPrice: (fee.gasPrice * 115n) / 100n};
  }
  return {};
}
