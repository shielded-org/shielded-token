"use client";

import {BadgeCheck, PlugZap} from "lucide-react";
import {ethers} from "ethers";
import {useEffect, useMemo, useState} from "react";
import {Button} from "@/components/ui/button";
import {getActiveInjectedProvider, listInjectedProviders, setActiveInjectedProvider} from "@/lib/injected-wallet";
import {getShieldedNetwork} from "@/lib/networks";
import {useHasMounted} from "@/lib/use-has-mounted";
import {shortenHash} from "@/lib/utils";
import {arbitrumSepolia, baseSepolia, mainnet, sepolia} from "wagmi/chains";
import {useShieldedStore} from "@/store/use-shielded-store";

export function WalletConnection() {
  const hasMounted = useHasMounted();
  const address = useShieldedStore((state) => state.walletAddress);
  const chainId = useShieldedStore((state) => state.chainId);
  const setWalletConnection = useShieldedStore((state) => state.setWalletConnection);
  const clearKeyMaterial = useShieldedStore((state) => state.clearKeyMaterial);
  const shieldedRpcChainId = useShieldedStore((state) => state.shieldedRpcChainId);
  const [showWalletDialog, setShowWalletDialog] = useState(false);
  const [pendingConnectorId, setPendingConnectorId] = useState<string | null>(null);
  const [nativeBalance, setNativeBalance] = useState<string | null>(null);
  const isConnected = Boolean(hasMounted && address);
  const chainName =
    chainId === mainnet.id
      ? "Mainnet"
      : chainId === sepolia.id
        ? "Sepolia"
        : chainId === baseSepolia.id
        ? "Base Sepolia"
      : chainId === arbitrumSepolia.id
        ? "Arbitrum Sepolia"
        : `Chain ${chainId}`;
  const supportedChain =
    chainId === mainnet.id || chainId === sepolia.id || chainId === baseSepolia.id || chainId === arbitrumSepolia.id;
  const poolNet = getShieldedNetwork(shieldedRpcChainId);
  const walletMatchesPool = chainId != null && chainId === shieldedRpcChainId;
  const availableConnectors = useMemo(() => {
    if (!hasMounted) return [];
    return listInjectedProviders().map((item) => ({id: item.name.toLowerCase(), name: item.name, provider: item.provider}));
  }, [hasMounted]);
  const connectorUnavailable = !hasMounted || availableConnectors.length === 0;
  const isPending = pendingConnectorId !== null;

  useEffect(() => {
    if (!address) return undefined;
    const provider = getActiveInjectedProvider();
    if (!provider?.on) return undefined;
    const onChainChanged = (hexChainId: unknown) => {
      const next = typeof hexChainId === "string" ? Number(hexChainId) : NaN;
      if (!Number.isFinite(next)) return;
      const {walletAddress} = useShieldedStore.getState();
      if (walletAddress) {
        useShieldedStore.getState().setWalletConnection(walletAddress, next);
      }
    };
    provider.on("chainChanged", onChainChanged);
    return () => {
      provider.removeListener?.("chainChanged", onChainChanged);
    };
  }, [address]);

  async function connectWith(connectorId: string) {
    const connector = availableConnectors.find((item) => item.id === connectorId);
    if (!connector) return;
    try {
      setPendingConnectorId(connector.id);
      setActiveInjectedProvider(connector.provider);
      const result = (await connector.provider.request({method: "eth_requestAccounts"})) as string[];
      const selected = result?.[0];
      if (!selected) throw new Error("No wallet account returned.");
      const chainHex = (await connector.provider.request({method: "eth_chainId"})) as string;
      const provider = new ethers.BrowserProvider(connector.provider as unknown as ethers.Eip1193Provider);
      const balance = await provider.getBalance(selected);
      setNativeBalance(ethers.formatEther(balance));
      setWalletConnection(selected as `0x${string}`, Number(chainHex));
      setShowWalletDialog(false);
    } finally {
      setPendingConnectorId(null);
    }
  }

  async function disconnectWallet() {
    setWalletConnection(null, null);
    setNativeBalance(null);
    clearKeyMaterial();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isConnected ? (
        <div className="inline-flex items-center gap-2 rounded-full border border-[#d1d5db] bg-white px-3 py-2 text-xs text-[#374151]">
          <BadgeCheck className="size-3.5 text-[#4f46e5]" />
          <span className="font-mono">{shortenHash(address ?? "")}</span>
          <span className="text-[#6b7280]">
            {nativeBalance
              ? `${Number(nativeBalance).toFixed(3)} ETH`
              : chainName}
          </span>
          {!supportedChain ? (
            <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-amber-300">
              Wrong network
            </span>
          ) : null}
          {supportedChain && isConnected && poolNet && !walletMatchesPool ? (
            <span
              className="max-w-44 truncate rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-amber-800"
              title={`Pool network is ${poolNet.label}. Use Switch wallet in the header banner to align your wallet.`}
            >
              Pool: {poolNet.label}
            </span>
          ) : null}
          <span className="rounded-full border border-[var(--brand-accent)]/25 bg-[var(--brand-accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent)]">
            {chainName}
          </span>
        </div>
      ) : null}
      {isConnected ? (
        <Button variant="secondary" onClick={disconnectWallet}>
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
