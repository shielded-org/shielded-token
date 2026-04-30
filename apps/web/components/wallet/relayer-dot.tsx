import {cn} from "@/lib/utils";

export function RelayerDot({status}: {status: "online" | "degraded" | "offline"}) {
  return (
    <span
      className={cn(
        "inline-flex size-2 rounded-full",
        status === "online"
          ? "bg-[#0047ab] shadow-[0_0_12px_rgba(0,71,171,0.8)] animate-pulse"
          : status === "degraded"
            ? "bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.45)]"
            : "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.45)]"
      )}
      aria-hidden="true"
    />
  );
}
