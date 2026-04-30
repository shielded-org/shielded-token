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
    <div className="rounded-2xl border border-dashed border-[#d1d5db] bg-white px-6 py-10 text-center">
      <div className="mx-auto max-w-xl">
        <div className="font-mono text-xs uppercase tracking-[0.24em] text-[#9ca3af]">
          {art}
        </div>
        <h3 className="mt-6 text-2xl font-semibold tracking-[-0.03em] text-[#111827]">
          {title}
        </h3>
        <p className="mt-3 text-sm leading-7 text-[#6b7280]">{description}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </div>
  );
}
