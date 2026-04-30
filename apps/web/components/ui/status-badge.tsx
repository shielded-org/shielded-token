import {cn} from "@/lib/utils";
import type {TransactionStatus} from "@/lib/types";

const styles: Record<TransactionStatus, string> = {
  pending: "border-[#d1d5db] bg-[#f3f4f6] text-[#6b7280]",
  submitted: "border-[#93c5fd] bg-[#eff6ff] text-[#1d4ed8]",
  confirmed: "border-[#86efac] bg-[#f0fdf4] text-[#166534]",
  failed: "border-red-200 bg-red-50 text-red-700",
};

export function StatusBadge({status}: {status: TransactionStatus}) {
  return (
    <span className={cn("rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]", styles[status])}>
      {status}
    </span>
  );
}
