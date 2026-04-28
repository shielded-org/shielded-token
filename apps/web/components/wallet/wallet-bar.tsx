"use client";

import {BadgeCheck, HeartPulse, Layers3, PlugZap} from "lucide-react";
import {formatUnits} from "viem";
import {useAccount, useBalance, useChainId, useConnect, useDisconnect} from "wagmi";
import {RelayerDot} from "./relayer-dot";
import {Button} from "@/components/ui/button";
import {useShieldedStore} from "@/store/use-shielded-store";
import {SegmentedControl} from "@/components/ui/segmented-control";
import {shortenHash} from "@/lib/utils";

export function WalletBar() {
  const {address, isConnected} = useAccount();
  const chainId = useChainId();
  const {connect, connectors, isPending} = useConnect();
  const {disconnect} = useDisconnect();
  const {data: balance} = useBalance({
    address,
    query: {enabled: Boolean(address)},
  });
  const mode = useShieldedStore((state) => state.mode);
  const relayerHealth = useShieldedStore((state) => state.relayerHealth);
  const lastSyncedBlock = useShieldedStore((state) => state.lastSyncedBlock);
  const setMode = useShieldedStore((state) => state.setMode);

  return (
    <div className="surface-subtle rounded-[28px] p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#8b8b8b]">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/5 px-3 py-2">
            <RelayerDot healthy={relayerHealth.ok} />
            Relayer {relayerHealth.ok ? "healthy" : "down"}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/5 px-3 py-2">
            <Layers3 className="size-3.5" />
            Last synced: block {lastSyncedBlock.toLocaleString()}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/5 px-3 py-2">
            <HeartPulse className="size-3.5" />
            {relayerHealth.latencyMs ? `${relayerHealth.latencyMs}ms` : "checking"}
          </span>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[
              {label: "Pool", value: "pool"},
              {label: "Monolith", value: "monolith"},
            ]}
          />
          <div className="flex items-center gap-2 text-xs text-[#8b8b8b]">
            {isConnected ? (
              <div className="hidden items-center gap-2 rounded-full border border-white/8 bg-white/5 px-3 py-3 md:inline-flex">
                <BadgeCheck className="size-3.5 text-[#00ff7f]" />
                <span className="font-mono text-[#cccccc]">{shortenHash(address ?? "")}</span>
                <span>
                  {balance
                    ? `${Number(formatUnits(balance.value, balance.decimals)).toFixed(3)} ${balance.symbol}`
                    : `chain ${chainId}`}
                </span>
              </div>
            ) : null}
            {isConnected ? (
              <Button variant="secondary" onClick={() => disconnect()}>
                Disconnect
              </Button>
            ) : (
              <Button
                variant="secondary"
                icon={<PlugZap className="size-4" />}
                disabled={connectors.length === 0 || isPending}
                onClick={() => {
                  const connector = connectors[0];
                  if (connector) {
                    connect({connector});
                  }
                }}
              >
                {isPending ? "Connecting..." : "Connect wallet"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
