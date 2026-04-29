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
    <div className="rounded-lg border border-dashed border-[#222222] bg-[#0d0d0d] px-6 py-10 text-center">
      <div className="mx-auto max-w-xl">
        <div className="font-mono text-xs uppercase tracking-[0.24em] text-[#666666]">
          {art}
        </div>
        <h3 className="mt-6 text-2xl font-semibold tracking-[-0.03em] text-[#f2f2f2]">
          {title}
        </h3>
        <p className="mt-3 text-sm leading-7 text-[#8b8b8b]">{description}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </div>
  );
}
