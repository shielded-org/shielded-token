import {TriangleAlert} from "lucide-react";

export function PrivacyWarning({message}: {message: string}) {
  return (
    <div className="rounded-[24px] border border-amber-400/18 bg-[linear-gradient(180deg,rgba(251,191,36,0.12),rgba(251,191,36,0.05))] p-4 text-sm text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />
        <p className="leading-6">{message}</p>
      </div>
    </div>
  );
}
