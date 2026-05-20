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
        <span className="text-sm text-[var(--brand-muted)]">{label}</span>
        <span className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] p-2 text-[var(--brand-accent)] shadow-[0_8px_20px_var(--brand-accent-soft)]">
          {icon}
        </span>
      </div>
      <div className="font-display mt-4 text-3xl font-semibold tracking-[-0.04em] text-[var(--brand-fg)]">{value}</div>
      <p className="mt-3 text-xs uppercase tracking-[0.22em] text-[var(--brand-muted)]">{hint}</p>
    </div>
  );
}
