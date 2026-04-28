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
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#060606]/96 backdrop-blur-sm">
      <div className="scanlines absolute inset-0 opacity-60" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,127,0.08),transparent_32%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6">
        <div className="rounded-lg border border-[#222222] bg-[#0d0d0d]/92 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
          <div className="flex items-center gap-3 text-[#00ff7f]">
            <span className="size-2 rounded-full bg-[#00ff7f] shadow-[0_0_12px_rgba(0,255,127,0.85)] animate-pulse" />
            <span className="font-mono text-xs uppercase tracking-[0.28em]">
              Prover Active
            </span>
          </div>
          <h2 className="mt-6 text-3xl font-semibold text-[#f2f2f2]">
            {PROOF_STEP_LABELS[step]}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-7 text-[#8b8b8b]">
            Heavy proofs stay in the browser. Keep this tab active while witness
            generation, proving, and relayer submission advance in sequence.
          </p>

          <div className="mt-8 space-y-4">
            {stepOrder.map((item, index) => (
              <div key={item} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-full border text-[10px] font-semibold",
                      index <= currentIndex
                        ? "border-[#00ff7f]/45 bg-[#00ff7f]/10 text-[#00ff7f]"
                        : "border-[#222222] text-[#666666]"
                    )}
                  >
                    {index + 1}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-sm",
                      index <= currentIndex ? "text-[#f2f2f2]" : "text-[#666666]"
                    )}
                  >
                    {PROOF_STEP_LABELS[item]}
                  </span>
                </div>
                <span className="font-mono text-xs text-[#666666]">
                  {index < currentIndex ? "done" : index === currentIndex ? "live" : "queued"}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <div className="h-2 overflow-hidden rounded-full bg-[#121212]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#00ff7f,#7df9ff)] transition-all duration-500"
                style={{width: `${percent}%`}}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-[#666666]">
              <span>Estimated remaining</span>
              <span className="font-mono">{etaSeconds}s</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
