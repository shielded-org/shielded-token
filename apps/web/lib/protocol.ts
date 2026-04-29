"use client";

import {RELAYER_URL} from "./constants";
import {createHex, nowIso} from "./utils";
import type {ProofStep, TransactionKind} from "./types";

function wait(duration: number) {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

export async function simulateProofFlow(
  onStep: (step: ProofStep, etaSeconds: number) => void
) {
  const steps: Array<[ProofStep, number, number]> = [
    ["witness", 15, 1600],
    ["proof", 11, 2200],
    ["submit", 5, 1300],
    ["confirm", 2, 1100],
  ];

  for (const [step, etaSeconds, delay] of steps) {
    onStep(step, etaSeconds);
    await wait(delay);
  }
}

export async function pingRelayer() {
  const response = await fetch(`${RELAYER_URL}/healthz`, {cache: "no-store"});
  return response.ok;
}

export async function submitRelayerPayload(kind: TransactionKind) {
  await wait(800);
  return {
    accepted: true,
    requestId: `req_${kind}_${Math.random().toString(36).slice(2, 8)}`,
    txHash: createHex(`tx-${kind}`),
    createdAt: nowIso(),
  };
}
