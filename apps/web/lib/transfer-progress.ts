import type {ProofStep} from "@/lib/types";

/** Map `executePrivateTransfer` / `executeUnshield` status strings to UI proof steps. */
export function mapRelayStatusMessageToProofStep(msg: string): ProofStep | null {
  const m = msg.toLowerCase();
  if (m.includes("submitting") || m.includes("relayer") || m.includes("bundle")) return "submit";
  if (
    m.includes("generating proof") ||
    m.includes("unshield proof") ||
    m.includes("zero-knowledge") ||
    m.includes("in the browser") ||
    m.includes("browser prover")
  ) {
    return "proof";
  }
  if (
    m.includes("scanning") ||
    m.includes("spendable") ||
    m.includes("spend status") ||
    m.includes("candidate") ||
    m.includes("merkle") ||
    m.includes("resolving") ||
    m.includes("loading merkle")
  ) {
    return "witness";
  }
  return null;
}

export function suggestedEtaForProofStep(step: ProofStep): number {
  switch (step) {
    case "witness":
      return 55;
    case "proof":
      return 95;
    case "submit":
      return 40;
    case "confirm":
      return 8;
    default:
      return 30;
  }
}
