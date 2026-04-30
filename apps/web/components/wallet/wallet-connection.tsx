"use client";

import {BadgeCheck, PlugZap} from "lucide-react";
import {useMemo, useState} from "react";
import {formatUnits} from "viem";
import {useAccount, useBalance, useChainId, useConnect, useDisconnect} from "wagmi";
import {Button} from "@/components/ui/button";
import {shortenHash} from "@/lib/utils";
import {mainnet, sepolia} from "wagmi/chains";

export function WalletConnection() {
  const {address, isConnected} = useAccount();
  const chainId = useChainId();
  const {connect, connectors, isPending} = useConnect();
  const {disconnect} = useDisconnect();
  const [showWalletDialog, setShowWalletDialog] = useState(false);
  const [pendingConnectorId, setPendingConnectorId] = useState<string | null>(null);
  const {data: balance} = useBalance({
    address,
    query: {enabled: Boolean(address)},
  });
  const chainName = chainId === mainnet.id ? "Mainnet" : chainId === sepolia.id ? "Sepolia" : `Chain ${chainId}`;
  const supportedChain = chainId === mainnet.id || chainId === sepolia.id;
  const availableConnectors = useMemo(() => {
    const seen = new Set<string>();
    return connectors.filter((connector) => {
      const key = `${connector.id}:${connector.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [connectors]);
  const connectorUnavailable = availableConnectors.length === 0;

  function connectWith(connectorId: string) {
    const connector = availableConnectors.find((item) => item.id === connectorId);
    if (!connector) return;
    setPendingConnectorId(connector.id);
    connect({connector});
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isConnected ? (
        <div className="inline-flex items-center gap-2 rounded-full border border-[#d1d5db] bg-white px-3 py-2 text-xs text-[#374151]">
          <BadgeCheck className="size-3.5 text-[#4f46e5]" />
          <span className="font-mono">{shortenHash(address ?? "")}</span>
          <span className="text-[#6b7280]">
            {balance
              ? `${Number(formatUnits(balance.value, balance.decimals)).toFixed(3)} ${balance.symbol}`
              : chainName}
          </span>
          {!supportedChain ? (
            <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-amber-300">
              Wrong network
            </span>
          ) : null}
          <span className="rounded-full border border-[#c7d2fe] bg-[#eef2ff] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[#3730a3]">
            {chainName}
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
          className="rounded-full px-5"
          icon={<PlugZap className="size-4" />}
          disabled={connectorUnavailable || isPending}
          onClick={() => setShowWalletDialog(true)}
        >
          {isPending ? "Connecting..." : "Connect wallet"}
        </Button>
      )}
      {!isConnected && connectorUnavailable ? (
        <span className="text-xs text-amber-700">No wallet connector configured.</span>
      ) : null}

      {showWalletDialog && !isConnected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/35 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-[0_24px_40px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-[#111827]">Choose wallet</h3>
              <button
                type="button"
                onClick={() => setShowWalletDialog(false)}
                className="rounded-lg border border-[#e5e7eb] px-2 py-1 text-xs text-[#6b7280] hover:bg-[#f9fafb]"
              >
                Close
              </button>
            </div>
            <p className="mt-1 text-sm text-[#6b7280]">
              Select which wallet to connect.
            </p>
            <div className="mt-4 grid gap-2">
              {availableConnectors.map((connector) => (
                <button
                  key={`${connector.id}:${connector.name}`}
                  type="button"
                  className="flex items-center justify-between rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5 text-sm text-[#111827] hover:bg-[#f9fafb]"
                  onClick={() => connectWith(connector.id)}
                  disabled={isPending}
                >
                  <span>{connector.name}</span>
                  {isPending && pendingConnectorId === connector.id ? (
                    <span className="text-xs text-[#6b7280]">Connecting...</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
