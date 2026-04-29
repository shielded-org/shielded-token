import {cn} from "@/lib/utils";
import type {TransactionStatus} from "@/lib/types";

const styles: Record<TransactionStatus, string> = {
  pending: "border-[#3a3a3a] bg-[#171717] text-[#8b8b8b]",
  submitted: "border-[#7df9ff]/20 bg-[#7df9ff]/10 text-[#7df9ff]",
  confirmed: "border-[#0047ab]/20 bg-[#0047ab]/10 text-[#4d7fd6]",
  failed: "border-red-500/20 bg-red-500/10 text-red-300",
};

export function StatusBadge({status}: {status: TransactionStatus}) {
  return (
    <span className={cn("rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]", styles[status])}>
      {status}
    </span>
  );
}
