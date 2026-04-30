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
        <span className="text-sm text-[#6b7280]">{label}</span>
        <span className="rounded-full border border-[#e5e7eb] bg-white p-2 text-[#4f46e5]">{icon}</span>
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#111827]">
        {value}
      </div>
      <p className="mt-3 text-xs uppercase tracking-[0.22em] text-[#9ca3af]">
        {hint}
      </p>
    </div>
  );
}
