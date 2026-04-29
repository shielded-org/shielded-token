"use client";

import Link from "next/link";
import {ArrowRight, Eye, EyeOff, NotebookTabs, ShieldPlus, TrendingUp, Wallet2} from "lucide-react";
import {PageShell} from "@/components/layout/page-shell";
import {Button} from "@/components/ui/button";
import {HashDisplay} from "@/components/ui/hash-display";
import {MetricCard} from "@/components/ui/metric-card";
import {StatusBadge} from "@/components/ui/status-badge";
import {TOKENS} from "@/lib/constants";
import {formatAmount, getShieldedBalance, getTokenTotal, relativeTime, sortTransactions} from "@/lib/utils";
import {useShieldedStore} from "@/store/use-shielded-store";

export default function DashboardPage() {
  const notes = useShieldedStore((state) => state.notes);
  const revealBalances = useShieldedStore((state) => state.revealBalances);
  const setRevealBalances = useShieldedStore((state) => state.setRevealBalances);
  const transactions = useShieldedStore((state) => state.transactions);

  const totalBalance = getShieldedBalance(notes);
  const recentTransactions = sortTransactions(transactions).slice(0, 3);

  return (
    <PageShell
      eyebrow="Overview"
      title="Private balances, surgical controls."
      description="The dashboard keeps public-chain facts at the edge and your shielded state in the center. Review value, note inventory, relayer posture, and recent private activity without feeling like you are staring at a dev console."
      actions={
        <div className="flex flex-wrap gap-3">
          <Link href="/shield">
            <Button icon={<ShieldPlus className="size-4" />}>Shield</Button>
          </Link>
          <Link href="/transfer">
            <Button variant="secondary" icon={<ArrowRight className="size-4" />}>
              Transfer
            </Button>
          </Link>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.28fr_0.72fr]">
        <section className="surface-panel rounded-[32px] p-7 sm:p-8">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-end">
            <div>
              <p className="hero-kicker font-mono text-xs uppercase text-[#666666]">
                Total Shielded Balance
              </p>
              <div className="mt-5 flex items-center gap-3">
                <h2 className="font-mono text-5xl text-[#f2f2f2] sm:text-6xl">
                  {revealBalances ? formatAmount(totalBalance) : "••••••"}
                </h2>
                <button
                  type="button"
                  onClick={() => setRevealBalances(!revealBalances)}
                  className="inline-flex size-11 items-center justify-center rounded-full border border-white/8 bg-white/5 text-[#8b8b8b] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:-translate-y-0.5 hover:border-[#7df9ff]/22 hover:text-[#00ff7f]"
                >
                  {revealBalances ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="mt-5 max-w-2xl text-sm leading-8 text-[#8b8b8b]">
                Hidden by default. Reveal only when you need a quick human check.
              </p>
            </div>
            <div className="surface-subtle rounded-[28px] p-5">
              <p className="hero-kicker font-mono text-xs uppercase text-[#666666]">
                Why this view works
              </p>
              <div className="mt-5 space-y-4 text-sm leading-7 text-[#8b8b8b]">
                <p>Public-chain actions stay clearly marked as boundaries.</p>
                <p>Private notes, spendability, and recent flow stay grouped together.</p>
                <p>The next action is always one click away: shield, transfer, or exit.</p>
              </div>
            </div>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <MetricCard
                label="Unspent Notes"
                value={<span className="font-mono">{notes.filter((note) => note.status === "unspent").length}</span>}
                hint="ready to spend"
                icon={<Wallet2 className="size-4" />}
              />
              <MetricCard
                label="Recent Flow"
                value={<span className="font-mono">{recentTransactions.length}</span>}
                hint="last 24h events"
                icon={<TrendingUp className="size-4" />}
              />
              <MetricCard
                label="Inbox"
                value={<span className="font-mono">{notes.length}</span>}
                hint="discovered notes"
                icon={<NotebookTabs className="size-4" />}
              />
          </div>
        </section>

        <section className="surface-panel rounded-[32px] p-7">
          <p className="hero-kicker font-mono text-xs uppercase text-[#666666]">
            Quick Actions
          </p>
          <div className="mt-5 grid gap-3">
            <Link href="/shield">
              <Button className="w-full justify-between rounded-2xl py-6" icon={<ShieldPlus className="size-4" />}>
                Shield tokens
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Link href="/transfer">
              <Button variant="secondary" className="w-full justify-between rounded-2xl py-6" icon={<ArrowRight className="size-4" />}>
                Private transfer
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Link href="/unshield">
              <Button variant="secondary" className="w-full justify-between rounded-2xl py-6" icon={<Wallet2 className="size-4" />}>
                Exit to public balance
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        </section>
      </div>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <div className="surface-panel rounded-[32px] p-7">
          <div className="flex items-center justify-between">
            <div>
              <p className="hero-kicker font-mono text-xs uppercase text-[#666666]">
                Token Breakdown
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#f2f2f2]">
                By note inventory
              </h3>
            </div>
            <Link href="/inbox" className="text-sm text-[#00ff7f] transition hover:text-[#7df9ff]">
              Open inbox
            </Link>
          </div>
          <div className="mt-6 grid gap-3">
            {TOKENS.map((token) => {
              const tokenNotes = notes.filter((note) => note.token === token.symbol);
              return (
                <article
                  key={token.symbol}
                  className="surface-subtle interactive-lift rounded-[26px] p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`flex size-11 items-center justify-center rounded-2xl border border-white/8 bg-gradient-to-br ${token.accent} text-sm font-semibold text-[#f2f2f2] shadow-[0_10px_30px_rgba(0,0,0,0.2)]`}>
                        {token.icon}
                      </div>
                      <div>
                        <p className="text-sm text-[#f2f2f2]">{token.name}</p>
                        <p className="font-mono text-xs text-[#666666]">{token.symbol}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-lg text-[#f2f2f2]">
                        {revealBalances ? formatAmount(getTokenTotal(notes, token.symbol)) : "••••••"}
                      </p>
                      <p className="text-xs text-[#666666]">{tokenNotes.filter((note) => note.status === "unspent").length} unspent notes</p>
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
              <p className="hero-kicker font-mono text-xs uppercase text-[#666666]">
                Recent Activity
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#f2f2f2]">
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
                    <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#666666]">
                      {transaction.kind}
                    </p>
                    <p className="mt-2 font-mono text-lg text-[#f2f2f2]">
                      {formatAmount(transaction.amount)} {transaction.token}
                    </p>
                    <p className="mt-2 text-sm text-[#666666]">{relativeTime(transaction.createdAt)}</p>
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
    </PageShell>
  );
}
