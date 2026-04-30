import {BadgeCheck, ShieldAlert, TriangleAlert} from "lucide-react";
import {HashDisplay} from "@/components/ui/hash-display";

type ActionOutcomeCardProps = {
  title: string;
  summary: string;
  visibilityNote?: string;
  txHash?: `0x${string}` | null;
  requestId?: string | null;
  status?: "success" | "warning";
};

export function ActionOutcomeCard({
  title,
  summary,
  visibilityNote,
  txHash,
  requestId,
  status = "success",
}: ActionOutcomeCardProps) {
  const warning = status === "warning";

  return (
    <div className={warning
      ? "rounded-[26px] border border-amber-200 bg-amber-50 p-5"
      : "rounded-[26px] border border-[#c7d2fe] bg-[#eef2ff] p-5 shadow-[0_10px_30px_rgba(79,70,229,0.12)]"}
    >
      <p className={warning ? "hero-kicker font-mono text-xs uppercase text-amber-700" : "hero-kicker font-mono text-xs uppercase text-[#4338ca]"}>
        Action outcome
      </p>
      <div className="mt-3 flex items-start gap-2">
        {warning ? <TriangleAlert className="mt-0.5 size-4 text-amber-600" /> : <BadgeCheck className="mt-0.5 size-4 text-[#4338ca]" />}
        <div>
          <p className="text-sm font-medium text-[#111827]">{title}</p>
          <p className="mt-2 text-sm leading-7 text-[#4b5563]">{summary}</p>
        </div>
      </div>
      {visibilityNote ? (
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs text-[#4b5563]">
          <ShieldAlert className="size-3.5 text-[#4f46e5]" />
          {visibilityNote}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {txHash ? <HashDisplay value={txHash} /> : null}
        {requestId ? <span className="font-mono text-xs text-[#6b7280]">{requestId}</span> : null}
      </div>
    </div>
  );
}
