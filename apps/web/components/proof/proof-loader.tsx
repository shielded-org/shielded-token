import {PROOF_STEP_LABELS} from "@/lib/constants";
import {cn} from "@/lib/utils";
import type {ProofStep} from "@/lib/types";

const stepOrder: ProofStep[] = ["witness", "proof", "submit", "confirm"];

export function ProofLoader({
  step,
  etaSeconds,
  visible,
}: {
  step: ProofStep;
  etaSeconds: number;
  visible: boolean;
}) {
  if (!visible) return null;

  const currentIndex = stepOrder.indexOf(step);
  const percent = ((currentIndex + 1) / stepOrder.length) * 100;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-white/90 backdrop-blur-sm">
      <div className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6">
        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.14)]">
          <div className="flex items-center gap-3 text-[#4f46e5]">
            <span className="size-2 rounded-full bg-[#4f46e5] shadow-[0_0_12px_rgba(79,70,229,0.6)] animate-pulse" />
            <span className="font-mono text-xs uppercase tracking-[0.28em]">
              Prover Active
            </span>
          </div>
          <h2 className="mt-6 text-3xl font-semibold text-[#111827]">
            {PROOF_STEP_LABELS[step]}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-7 text-[#6b7280]">
            Heavy proofs stay in the browser. Keep this tab active while witness
            generation, proving, and relayer submission advance in sequence. Do
            not refresh until confirmation completes.
          </p>

          <div className="mt-8 space-y-4">
            {stepOrder.map((item, index) => (
              <div key={item} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-full border text-[10px] font-semibold",
                      index <= currentIndex
                        ? "border-[#a5b4fc] bg-[#eef2ff] text-[#4338ca]"
                        : "border-[#e5e7eb] text-[#9ca3af]"
                    )}
                  >
                    {index + 1}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-sm",
                      index <= currentIndex ? "text-[#111827]" : "text-[#9ca3af]"
                    )}
                  >
                    {PROOF_STEP_LABELS[item]}
                  </span>
                </div>
                <span className="font-mono text-xs text-[#9ca3af]">
                  {index < currentIndex ? "done" : index === currentIndex ? "live" : "queued"}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <div className="h-2 overflow-hidden rounded-full bg-[#e5e7eb]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#4f46e5,#6366f1)] transition-all duration-500"
                style={{width: `${percent}%`}}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-[#6b7280]">
              <span>Estimated remaining</span>
              <span className="font-mono">{etaSeconds}s</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
