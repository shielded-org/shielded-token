import type {ShieldedTransferProofBundle} from "./types";

export type RelayerResponse = {
  accepted: boolean;
  requestId: string;
  txHash?: `0x${string}`;
  error?: string;
};

export async function submitBundleToRelayer(
  relayerUrl: string,
  bundle: ShieldedTransferProofBundle
): Promise<RelayerResponse> {
  const response = await fetch(`${relayerUrl}/relay/shielded-transfer`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({
      ...bundle,
      fee: bundle.fee.toString(),
    }),
  });

  if (!response.ok) {
    return {
      accepted: false,
      requestId: "unknown",
      error: `Relayer returned status ${response.status}`,
    };
  }

  return (await response.json()) as RelayerResponse;
}
