import type {ReactNode} from "react";

export function MetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <div className="surface-subtle interactive-lift rounded-[28px] p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[#666666]">{label}</span>
        <span className="rounded-full border border-white/8 bg-white/5 p-2 text-[#0047ab]">{icon}</span>
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#f2f2f2]">
        {value}
      </div>
      <p className="mt-3 text-xs uppercase tracking-[0.22em] text-[#666666]">
        {hint}
      </p>
    </div>
  );
}
