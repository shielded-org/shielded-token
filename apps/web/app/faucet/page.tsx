"use client";

import {Droplets, ExternalLink} from "lucide-react";
import {ethers} from "ethers";
import {useEffect, useMemo, useState} from "react";
import Link from "next/link";
import {PageShell} from "@/components/layout/page-shell";
import {AmountInput} from "@/components/ui/amount-input";
import {Button} from "@/components/ui/button";
import {PrivacyWarning} from "@/components/ui/privacy-warning";
import {SelectField} from "@/components/ui/select-field";
import {
  buildTokenDefinitionsForShieldedNetwork,
  getShieldedNetwork,
  getShieldedNetworks,
  type ShieldedChainId,
} from "@/lib/networks";
import {formatWalletBroadcastError, fetchShieldedNetworkErc20BalanceRaw} from "@/lib/rpc-read";
import {MOCK_ERC20_MINT_ABI} from "@/lib/shielded-config";
import {toast} from "@/lib/toast";
import {l2GasLimitOverride, txFeeOverrides} from "@/lib/tx-gas";
import {formatAmount, getAmountValidationMessage} from "@/lib/utils";
import {getBrowserSigner} from "@/lib/web3";
import {readInjectedChainId, switchInjectedWalletToShieldedChain} from "@/lib/wallet-switch-chain";
import {useShieldedStore} from "@/store/use-shielded-store";

const MAX_MINT_HUMAN = 100_000_000;

function formatReadableBalance(formattedUnits: string, maxFractionDigits = 8): string {
  const n = Number(formattedUnits);
  if (!Number.isFinite(n)) return formattedUnits;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.min(maxFractionDigits, 18),
  });
}

export default function FaucetPage() {
  const address = useShieldedStore((state) => state.walletAddress);
  const shieldedRpcChainId = useShieldedStore((state) => state.shieldedRpcChainId);

  const networks = useMemo(() => getShieldedNetworks(), []);
  const [faucetChainId, setFaucetChainId] = useState<ShieldedChainId>(() => {
    const allowed = new Set(networks.map((n) => n.id));
    if (allowed.has(shieldedRpcChainId)) return shieldedRpcChainId;
    return networks[0]!.id;
  });

  useEffect(() => {
    const allowed = new Set(getShieldedNetworks().map((n) => n.id));
    setFaucetChainId((prev) => (allowed.has(prev) ? prev : getShieldedNetworks()[0]!.id));
  }, [shieldedRpcChainId]);

  const net = getShieldedNetwork(faucetChainId);
  const tokenOptions = useMemo(() => (net ? buildTokenDefinitionsForShieldedNetwork(net) : []), [net]);

  const [tokenSymbol, setTokenSymbol] = useState(() => tokenOptions[0]?.symbol ?? "USDC");
  const [amount, setAmount] = useState("10000");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | null>(null);
  const [publicBalanceLabel, setPublicBalanceLabel] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceTick, setBalanceTick] = useState(0);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);

  const tokenMeta = tokenOptions.find((t) => t.symbol === tokenSymbol) ?? tokenOptions[0];
  const amountError = tokenMeta
    ? getAmountValidationMessage(amount, MAX_MINT_HUMAN, tokenMeta.decimals)
    : "No token selected.";

  const tokenListKey = useMemo(
    () => tokenOptions.map((t) => `${t.symbol}:${t.contractAddress.toLowerCase()}`).join("|"),
    [tokenOptions]
  );

  useEffect(() => {
    if (!tokenOptions.length) return;
    setTokenSymbol((prev) => (tokenOptions.some((t) => t.symbol === prev) ? prev : tokenOptions[0]!.symbol));
  }, [faucetChainId, tokenListKey, tokenOptions]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const p = typeof window !== "undefined" ? await readInjectedChainId() : null;
      if (!cancelled) setWalletChainId(p);
    })();
    return () => {
      cancelled = true;
    };
  }, [address, faucetChainId, balanceTick, lastTxHash]);

  useEffect(() => {
    if (!address || !net || !tokenMeta) {
      setPublicBalanceLabel(null);
      setBalanceLoading(false);
      return;
    }
    let cancelled = false;
    setBalanceLoading(true);
    void (async () => {
      try {
        const raw = await fetchShieldedNetworkErc20BalanceRaw(
          net,
          address as `0x${string}`,
          tokenMeta.contractAddress
        );
        if (cancelled) return;
        const formatted = ethers.formatUnits(raw, tokenMeta.decimals);
        setPublicBalanceLabel(formatReadableBalance(formatted));
      } catch {
        if (!cancelled) setPublicBalanceLabel(null);
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, net, tokenMeta, balanceTick]);

  async function handleMint() {
    if (!address || !net || !tokenMeta) return;
    setSubmitting(true);
    setSubmitError(null);
    setLastTxHash(null);
    try {
      let parsed: bigint;
      try {
        parsed = ethers.parseUnits(amount.trim() || "0", tokenMeta.decimals);
      } catch {
        setSubmitError("Invalid amount for this token's decimals.");
        return;
      }
      if (parsed <= 0n) {
        setSubmitError("Amount must be greater than zero.");
        return;
      }
      await switchInjectedWalletToShieldedChain(faucetChainId);
      const signer = await getBrowserSigner(address);
      const c = new ethers.Contract(tokenMeta.contractAddress, MOCK_ERC20_MINT_ABI, signer);
      const mintGas = await l2GasLimitOverride(signer, () => c.mint.estimateGas(address, parsed), "mint");
      const feeOpts = signer.provider ? await txFeeOverrides(signer.provider) : {};
      const tx = await c.mint(address, parsed, {...feeOpts, ...(mintGas ?? {})});
      await tx.wait();
      setLastTxHash(tx.hash as `0x${string}`);
      setBalanceTick((n) => n + 1);
      toast.success(`Minted ${formatAmount(amount)} ${tokenMeta.symbol} on ${net.label}.`);
    } catch (err) {
      const msg = formatWalletBroadcastError(err, net);
      console.error("[faucet] mint failed:", err);
      setSubmitError(msg);
      toast.error(msg.length > 420 ? `${msg.slice(0, 420)}…` : msg);
    } finally {
      setSubmitting(false);
    }
  }

  const chainMismatch = address != null && walletChainId != null && walletChainId !== faucetChainId;

  return (
    <PageShell
      eyebrow="Testnet"
      title="Token faucet"
      description="Mint free mock ERC-20s (USDC, USDT, DAI, LINK, pool MOCK, etc.) on the same chains as the shielded pool. Addresses match each network's pool configuration."
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_0.82fr]">
        <section className="surface-panel rounded-[32px] p-7 sm:p-8">
          <div className="space-y-5">
            <PrivacyWarning
              message="Testnet only — mint transactions and balances are fully public on-chain. Anyone can mint these mock tokens."
              variant="warning"
            />

            {!networks.length ? (
              <p className="text-sm text-[#6b7280]">No shielded networks are configured in this build.</p>
            ) : !tokenOptions.length ? (
              <p className="text-sm text-[#6b7280]">
                No pool tokens are configured for this chain. Set the appropriate{" "}
                <span className="font-mono text-xs">NEXT_PUBLIC_*_POOL_TOKENS_JSON</span> env or use a canonical pool
                deploy so default mock addresses load.
              </p>
            ) : (
              <>
                <div className="grid gap-5">
                  <label className="space-y-2">
                    <span className="text-sm text-[#6b7280]">Network</span>
                    <SelectField
                      value={String(faucetChainId)}
                      onChange={(e) => setFaucetChainId(Number(e.target.value) as ShieldedChainId)}
                    >
                      {networks.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.label}
                        </option>
                      ))}
                    </SelectField>
                    <p className="text-xs text-[#9ca3af]">
                      Uses the same contract addresses as the in-app pool for this chain (including env overrides).
                    </p>
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm text-[#6b7280]">Token</span>
                    <SelectField value={tokenSymbol} onChange={(e) => setTokenSymbol(e.target.value)}>
                      {tokenOptions.map((item) => (
                        <option key={item.symbol} value={item.symbol}>
                          {item.name} ({item.symbol})
                        </option>
                      ))}
                    </SelectField>
                    {tokenMeta ? (
                      <p className="break-all font-mono text-xs text-[#6b7280]">
                        Contract: {tokenMeta.contractAddress}
                      </p>
                    ) : null}
                    <p className="text-sm text-[#6b7280]" aria-live="polite">
                      {!address ? (
                        <>Connect your wallet to mint and to see your balance.</>
                      ) : balanceLoading ? (
                        <>Loading balance…</>
                      ) : publicBalanceLabel !== null ? (
                        <>
                          Balance:{" "}
                          <span className="font-mono text-[#374151]">
                            {publicBalanceLabel} {tokenMeta?.symbol}
                          </span>
                        </>
                      ) : (
                        <>Could not load balance for this token.</>
                      )}
                    </p>
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm text-[#6b7280]">Amount (human units)</span>
                    <AmountInput value={amount} onChange={setAmount} />
                    {amountError ? <p className="text-xs text-amber-700">{amountError}</p> : null}
                  </label>
                </div>

                {chainMismatch ? (
                  <p className="rounded-xl border border-amber-200/60 bg-amber-50/90 p-3 text-xs text-amber-950">
                    Your wallet is on a different chain than the faucet selection. Mint will prompt a switch to{" "}
                    {net?.label}.
                  </p>
                ) : null}

                <Button
                  className="rounded-2xl"
                  onClick={() => void handleMint()}
                  disabled={submitting || Boolean(amountError) || !address || !tokenMeta}
                  icon={<Droplets className="size-4" />}
                >
                  {submitting ? "Confirm in wallet…" : "Mint to my wallet"}
                </Button>

                {submitError ? (
                  <p className="rounded-xl border border-amber-200/40 bg-amber-50/90 p-3 text-xs leading-relaxed text-amber-950">
                    {submitError}
                  </p>
                ) : null}

                {lastTxHash && net ? (
                  <a
                    href={`${net.explorerBaseUrl}/tx/${lastTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-[#4f46e5] hover:underline"
                  >
                    View on explorer
                    <ExternalLink className="size-4" />
                  </a>
                ) : null}
              </>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="surface-panel rounded-[32px] p-7">
            <p className="hero-kicker font-mono text-xs uppercase text-[#9ca3af]">How it works</p>
            <ol className="mt-5 space-y-4 text-sm leading-8 text-[#6b7280]">
              <li>1. Pick the testnet that matches where you want public tokens (same chains as the pool).</li>
              <li>2. Choose a mock token — addresses are taken from the live pool config for that chain.</li>
              <li>3. Sign a <span className="font-mono text-xs">mint</span> call; tokens credit your connected wallet.</li>
            </ol>
          </section>
          <section className="surface-panel rounded-[32px] p-7">
            <p className="hero-kicker font-mono text-xs uppercase text-[#9ca3af]">Next step</p>
            <p className="mt-3 text-sm leading-7 text-[#6b7280]">
              After minting, use <Link className="font-medium text-[#4f46e5] hover:underline" href="/shield">Deposit</Link>{" "}
              to move tokens into the shielded pool.
            </p>
          </section>
        </aside>
      </div>
    </PageShell>
  );
}
