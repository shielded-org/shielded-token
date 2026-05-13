import {Check, Circle, Loader2} from "lucide-react";
import {useEffect, useState} from "react";
import {PROOF_STEP_LABELS} from "@/lib/constants";
import {cn} from "@/lib/utils";
import type {ProofStep} from "@/lib/types";

const stepOrder: ProofStep[] = ["witness", "proof", "submit", "confirm"];

export function ProofLoader({
  step,
  etaSeconds,
  visible,
  liveStatus,
  variant = "transfer",
}: {
  step: ProofStep;
  etaSeconds: number;
  visible: boolean;
  /** Latest pipeline message (includes elapsed time from the relayer helper). */
  liveStatus?: string | null;
  variant?: "transfer" | "unshield";
}) {
  const [tick, setTick] = useState(etaSeconds);

  useEffect(() => {
    if (!visible) return;
    setTick(etaSeconds);
  }, [visible, etaSeconds, step]);

  useEffect(() => {
    if (!visible || tick <= 0) return;
    const id = window.setInterval(() => setTick((t) => Math.max(0, t - 1)), 1000);
    return () => window.clearInterval(id);
  }, [visible, tick]);

  if (!visible) return null;

  const kicker =
    variant === "unshield" ? "Public withdrawal in progress" : "Private transfer in progress";

  const currentIndex = stepOrder.indexOf(step);
  const percent = Math.min(100, ((currentIndex + 0.65) / stepOrder.length) * 100);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-white/92 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="proof-loader-title"
    >
      <div className="relative mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.14)] sm:p-8">
          <div className="flex items-center gap-3 text-[#4f46e5]">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#4f46e5] opacity-35" />
              <span className="relative inline-flex size-2.5 rounded-full bg-[#4f46e5]" />
            </span>
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-[#6366f1]">
              {kicker}
            </span>
          </div>

          <h2 id="proof-loader-title" className="mt-5 text-2xl font-semibold tracking-tight text-[#111827] sm:text-3xl">
            {PROOF_STEP_LABELS[step]}
          </h2>

          {liveStatus ? (
            <p className="mt-3 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2.5 font-mono text-xs leading-relaxed text-[#374151] sm:text-[13px]">
              {liveStatus}
            </p>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-[#6b7280]">
              {variant === "unshield"
                ? "Proofs run in your browser; then the relayer posts your withdrawal. Do not refresh while the prover is active."
                : "This runs entirely in your browser until the relayer step. Avoid refreshing or leaving this tab—especially while the prover is running."}
            </p>
          )}

          <ol className="mt-8 space-y-0">
            {stepOrder.map((item, index) => {
              const done = index < currentIndex;
              const active = index === currentIndex;
              const pending = index > currentIndex;
              return (
                <li key={item} className="relative flex gap-3 pb-6 last:pb-0">
                  {index < stepOrder.length - 1 ? (
                    <span
                      className={cn(
                        "absolute left-[11px] top-7 bottom-0 w-px -translate-x-1/2",
                        done || active ? "bg-[#c7d2fe]" : "bg-[#e5e7eb]"
                      )}
                      aria-hidden
                    />
                  ) : null}
                  <span className="relative z-[1] flex size-6 shrink-0 items-center justify-center rounded-full border bg-white">
                    {done ? (
                      <span className="flex size-6 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700">
                        <Check className="size-3.5 stroke-[2.5]" aria-hidden />
                      </span>
                    ) : active ? (
                      <span className="flex size-6 items-center justify-center rounded-full border border-[#a5b4fc] bg-[#eef2ff] text-[#4338ca]">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      </span>
                    ) : (
                      <span className="flex size-6 items-center justify-center rounded-full border border-[#e5e7eb] text-[#d1d5db]">
                        <Circle className="size-3.5" aria-hidden />
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p
                      className={cn(
                        "text-sm font-medium leading-snug",
                        done && "text-[#059669]",
                        active && "text-[#111827]",
                        pending && "text-[#9ca3af]"
                      )}
                    >
                      {PROOF_STEP_LABELS[item]}
                    </p>
                    <p className={cn("mt-0.5 text-xs", active ? "text-[#6b7280]" : "text-[#9ca3af]")}>
                      {done ? "Completed" : active ? "In progress…" : "Waiting"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mt-2">
            <div className="h-2 overflow-hidden rounded-full bg-[#e5e7eb]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#4f46e5,#6366f1)] transition-[width] duration-700 ease-out"
                style={{width: `${percent}%`}}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-[#6b7280]">
              <span>Est. time remaining (rough)</span>
              <span className="font-mono tabular-nums text-[#111827]">{tick}s</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
