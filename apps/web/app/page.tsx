"use client";

import Link from "next/link";
import {Eye, EyeOff, NotebookTabs, TrendingUp, Wallet2} from "lucide-react";
import {PageShell} from "@/components/layout/page-shell";
import {HashDisplay} from "@/components/ui/hash-display";
import {MetricCard} from "@/components/ui/metric-card";
import {StatusBadge} from "@/components/ui/status-badge";
import {TOKENS} from "@/lib/constants";
import {encodeShieldedAddress} from "@/lib/shielded-address";
import {SEPOLIA} from "@/lib/shielded-config";
import {formatAmount, getShieldedBalance, getTokenTotal, relativeTime, sortTransactions} from "@/lib/utils";
import {useShieldedStore} from "@/store/use-shielded-store";

export default function DashboardPage() {
  const walletAddress = useShieldedStore((state) => state.walletAddress);
  const ownerPk = useShieldedStore((state) => state.ownerPk);
  const viewingPub = useShieldedStore((state) => state.viewingPub);
  const notes = useShieldedStore((state) => state.notes);
  const availableTokens = useShieldedStore((state) => state.tokens);
  const tokenOptions = availableTokens.length > 0 ? availableTokens : TOKENS;
  const revealBalances = useShieldedStore((state) => state.revealBalances);
  const setRevealBalances = useShieldedStore((state) => state.setRevealBalances);
  const transactions = useShieldedStore((state) => state.transactions);
  const isConnected = Boolean(walletAddress);
  const shieldedAddress =
    viewingPub && ownerPk
      ? encodeShieldedAddress({
          ownerPk: BigInt(ownerPk),
          viewingPub,
          chainId: SEPOLIA.chainId,
        })
      : null;
  const totalBalance = getShieldedBalance(notes);
  const sortedTransactions = sortTransactions(transactions);
  const recentTransactions = sortedTransactions.slice(0, 3);
  const transactionCount = sortedTransactions.length;

  return (
    <PageShell
      title="Private dashboard"
      description="Private balance and spendability first. Advanced cryptographic details stay hidden unless explicitly revealed."
    >
      <div className="grid gap-6">
        <section className="surface-panel rounded-[32px] p-7 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0 flex-1">
              <p className="hero-kicker font-mono text-xs uppercase text-[#9ca3af]">
                Total Shielded Balance
              </p>
              {isConnected ? (
                <>
                  <div className="mt-5 flex items-center gap-3">
                    <h2 className="font-mono text-5xl text-[#111827] sm:text-6xl">
                      {revealBalances ? formatAmount(totalBalance) : "••••••"}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setRevealBalances(!revealBalances)}
                      className="inline-flex size-11 items-center justify-center rounded-full border border-[#d1d5db] bg-white text-[#6b7280] hover:-translate-y-0.5 hover:border-[#a5b4fc] hover:text-[#4f46e5]"
                    >
                      {revealBalances ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-[#6b7280]">
                    Hidden by default. Reveal only when you need a quick check.
                  </p>
                </>
              ) : (
                <>
                  <div className="mt-5">
                    <h2 className="font-mono text-4xl text-[#111827] sm:text-5xl">Connect wallet</h2>
                  </div>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-[#6b7280]">
                    Connect an injected wallet from the header to load your shielded keys, sync private notes, and unlock dashboard balances.
                  </p>
                </>
              )}
            </div>
            <div className="min-w-[260px] max-w-full rounded-[26px] border border-[#e5e7eb] bg-white px-4 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[#9ca3af]">Shielded address</p>
              <p className="mt-2 text-sm text-[#6b7280]">
                {shieldedAddress ? "Copy your private receive address." : "Connect wallet to generate your receive address."}
              </p>
              <div className="mt-4">
                {shieldedAddress ? (
                  <HashDisplay value={shieldedAddress} className="max-w-full" />
                ) : (
                  <span className="inline-flex rounded-full border border-[#e5e7eb] bg-[#f8fafc] px-3 py-1.5 font-mono text-xs text-[#9ca3af]">
                    not available
                  </span>
                )}
              </div>
            </div>
          </div>
          {isConnected ? (
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <MetricCard
                label="Unspent Notes"
                value={<span className="font-mono">{notes.filter((note) => note.status === "unspent").length}</span>}
                hint="ready to spend"
                icon={<Wallet2 className="size-4" />}
              />
              <MetricCard
                label="Recent Flow"
                value={<span className="font-mono">{transactionCount}</span>}
                hint="recorded transactions"
                icon={<TrendingUp className="size-4" />}
              />
              <MetricCard
                label="Total Notes"
                value={<span className="font-mono">{notes.length}</span>}
                hint="discovered notes"
                icon={<NotebookTabs className="size-4" />}
              />
            </div>
          ) : null}
        </section>
      </div>

      {isConnected ? (
        <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <div className="surface-panel rounded-[32px] p-7">
            <div className="flex items-center justify-between">
              <div>
                <p className="hero-kicker font-mono text-xs uppercase text-[#9ca3af]">
                  Token Breakdown
                </p>
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#111827]">
                  By note inventory
                </h3>
              </div>
              <Link href="/inbox" className="text-sm text-[#4f46e5] transition hover:text-[#3730a3]">
                Open notes
              </Link>
            </div>
            <div className="mt-6 grid gap-3">
              {tokenOptions.map((token) => {
                const tokenNotes = notes.filter((note) => note.token === token.symbol);
                return (
                  <article
                    key={token.symbol}
                    className="surface-subtle interactive-lift rounded-[26px] p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`flex size-11 items-center justify-center rounded-2xl border border-[#e5e7eb] bg-gradient-to-br ${token.accent} text-sm font-semibold text-[#111827]`}>
                          {token.icon}
                        </div>
                        <div>
                          <p className="text-sm text-[#111827]">{token.name}</p>
                          <p className="font-mono text-xs text-[#9ca3af]">{token.symbol}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-lg text-[#111827]">
                          {revealBalances ? formatAmount(getTokenTotal(notes, token.symbol)) : "••••••"}
                        </p>
                        <p className="text-xs text-[#9ca3af]">{tokenNotes.filter((note) => note.status === "unspent").length} unspent notes</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="surface-panel rounded-[32px] p-7">
            <div className="flex items-center justify-between">
              <div>
                <p className="hero-kicker font-mono text-xs uppercase text-[#9ca3af]">
                  Recent Activity
                </p>
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#111827]">
                  Last 3 transactions
                </h3>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              {recentTransactions.map((transaction) => (
                <article
                  key={transaction.id}
                  className="surface-subtle interactive-lift rounded-[26px] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#9ca3af]">
                        {transaction.kind}
                      </p>
                      <p className="mt-2 font-mono text-lg text-[#111827]">
                        {formatAmount(transaction.amount)} {transaction.token}
                      </p>
                      <p className="mt-2 text-sm text-[#6b7280]">{relativeTime(transaction.createdAt)}</p>
                    </div>
                    <StatusBadge status={transaction.status} />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {transaction.txHash ? <HashDisplay value={transaction.txHash} /> : null}
                    {transaction.counterparty ? <HashDisplay value={transaction.counterparty} /> : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </PageShell>
  );
}
