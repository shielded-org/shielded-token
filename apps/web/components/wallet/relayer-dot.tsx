import {cn} from "@/lib/utils";

export function RelayerDot({healthy}: {healthy: boolean}) {
  return (
    <span
      className={cn(
        "inline-flex size-2 rounded-full",
        healthy
          ? "bg-[#00ff7f] shadow-[0_0_12px_rgba(0,255,127,0.8)] animate-pulse"
          : "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.45)]"
      )}
      aria-hidden="true"
    />
  );
}
