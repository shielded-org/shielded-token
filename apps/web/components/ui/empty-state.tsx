import type {ReactNode} from "react";

export function EmptyState({
  title,
  description,
  art,
  action,
}: {
  title: string;
  description: string;
  art: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--brand-accent)]/25 bg-[var(--brand-surface)] px-6 py-10 text-center shadow-[0_12px_32px_var(--brand-accent-soft)]">
      <div className="mx-auto max-w-xl">
        <div className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--brand-accent)]">{art}</div>
        <h3 className="font-display mt-6 text-2xl font-semibold tracking-[-0.03em] text-[var(--brand-fg)]">{title}</h3>
        <p className="mt-3 text-sm leading-7 text-[var(--brand-muted)]">{description}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </div>
  );
}
