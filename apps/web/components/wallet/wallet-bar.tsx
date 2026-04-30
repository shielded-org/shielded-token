"use client";

import {HeartPulse, Layers3} from "lucide-react";
import {RelayerDot} from "./relayer-dot";
import {useShieldedStore} from "@/store/use-shielded-store";

export function WalletBar() {
  const relayerHealth = useShieldedStore((state) => state.relayerHealth);
  const lastSyncedBlock = useShieldedStore((state) => state.lastSyncedBlock);
  const relayerStatus = !relayerHealth.ok
    ? "offline"
    : relayerHealth.latencyMs && relayerHealth.latencyMs > 600
      ? "degraded"
      : "online";
  const relayerLabel = relayerStatus[0].toUpperCase() + relayerStatus.slice(1);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-[#6b7280]">
      <span className="inline-flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-3 py-2">
        <RelayerDot status={relayerStatus} />
        Relayer {relayerLabel}
      </span>
      <span className="inline-flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-3 py-2">
        <Layers3 className="size-3.5" />
        Synced to block {lastSyncedBlock.toLocaleString()}
      </span>
      <span className="inline-flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-3 py-2">
        <HeartPulse className="size-3.5" />
        {relayerHealth.latencyMs ? `${relayerHealth.latencyMs}ms relay RTT` : "Checking relay"}
      </span>
    </div>
  );
}
