"use client";

import {BadgeCheck, PlugZap} from "lucide-react";
import {formatUnits} from "viem";
import {useAccount, useBalance, useChainId, useConnect, useDisconnect} from "wagmi";
import {Button} from "@/components/ui/button";
import {shortenHash} from "@/lib/utils";

export function WalletConnection() {
  const {address, isConnected} = useAccount();
  const chainId = useChainId();
  const {connect, connectors, isPending} = useConnect();
  const {disconnect} = useDisconnect();
  const {data: balance} = useBalance({
    address,
    query: {enabled: Boolean(address)},
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isConnected ? (
        <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/5 px-3 py-2 text-xs text-[#cccccc]">
          <BadgeCheck className="size-3.5 text-[#0047ab]" />
          <span className="font-mono">{shortenHash(address ?? "")}</span>
          <span className="text-[#8b8b8b]">
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
          variant="primary"
          className="rounded-full px-5 shadow-[0_16px_40px_rgba(0,71,171,0.28)]"
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
  );
}
