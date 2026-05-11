"use client";

import {AlertTriangle} from "lucide-react";
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {getShieldedNetwork} from "@/lib/networks";
import {readInjectedChainId, switchInjectedWalletToShieldedChain} from "@/lib/wallet-switch-chain";
import {useShieldedStore} from "@/store/use-shielded-store";

export function WalletNetworkSyncBanner() {
  const address = useShieldedStore((s) => s.walletAddress);
  const walletChainId = useShieldedStore((s) => s.chainId);
  const shieldedRpcChainId = useShieldedStore((s) => s.shieldedRpcChainId);
  const setWalletConnection = useShieldedStore((s) => s.setWalletConnection);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetNet = getShieldedNetwork(shieldedRpcChainId);
  const mismatch =
    Boolean(address) &&
    Boolean(targetNet) &&
    (walletChainId === null || walletChainId !== shieldedRpcChainId);

  if (!mismatch || !targetNet || !address) {
    return null;
  }

  async function onSwitch() {
    setError(null);
    setPending(true);
    try {
      await switchInjectedWalletToShieldedChain(shieldedRpcChainId);
      const next = await readInjectedChainId();
      if (next != null) {
        setWalletConnection(address, next);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      role="status"
      className="mt-3 flex flex-col gap-2 rounded-xl border border-amber-300/50 bg-amber-50/95 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
        <div>
          <p className="font-medium text-amber-950">Wallet network does not match pool network</p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-900/90">
            The app is using <strong>{targetNet.label}</strong> for the shielded pool, but the wallet is on a different chain
            {walletChainId != null ? ` (chain id ${walletChainId})` : ""}. Switch the wallet so deposits and signatures use the
            same network as &quot;Pool network&quot; in the header.
          </p>
          {error ? <p className="mt-2 text-xs text-red-800">{error}</p> : null}
        </div>
      </div>
      <Button type="button" variant="secondary" className="shrink-0 self-start sm:self-center" disabled={pending} onClick={() => void onSwitch()}>
        {pending ? "Opening wallet…" : `Switch wallet to ${targetNet.label}`}
      </Button>
    </div>
  );
}
