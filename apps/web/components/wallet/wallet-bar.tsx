"use client";

import {HeartPulse, Layers3} from "lucide-react";
import {RelayerDot} from "./relayer-dot";
import {useShieldedStore} from "@/store/use-shielded-store";

export function WalletBar() {
  const relayerHealth = useShieldedStore((state) => state.relayerHealth);
  const lastSyncedBlock = useShieldedStore((state) => state.lastSyncedBlock);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-[#8b8b8b]">
      <span className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/5 px-3 py-2">
        <RelayerDot healthy={relayerHealth.ok} />
        Relayer {relayerHealth.ok ? "healthy" : "down"}
      </span>
      <span className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/5 px-3 py-2">
        <Layers3 className="size-3.5" />
        Synced block {lastSyncedBlock.toLocaleString()}
      </span>
      <span className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/5 px-3 py-2">
        <HeartPulse className="size-3.5" />
        {relayerHealth.latencyMs ? `${relayerHealth.latencyMs}ms` : "checking"}
      </span>
    </div>
  );
}
