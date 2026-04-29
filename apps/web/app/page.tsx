"use client";

import Link from "next/link";
import {Check, Copy, Eye, EyeOff, NotebookTabs, TrendingUp, Wallet2} from "lucide-react";
import {useMemo, useState} from "react";
import {PageShell} from "@/components/layout/page-shell";
import {Button} from "@/components/ui/button";
import {HashDisplay} from "@/components/ui/hash-display";
import {MetricCard} from "@/components/ui/metric-card";
import {StatusBadge} from "@/components/ui/status-badge";
import {TOKENS} from "@/lib/constants";
import {deriveShieldedAccountPreview} from "@/lib/shielded-account";
import {copyText, formatAmount, getShieldedBalance, getTokenTotal, relativeTime, sortTransactions} from "@/lib/utils";
import {useShieldedStore} from "@/store/use-shielded-store";

function KeyPreviewCard({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <article className="surface-subtle rounded-[24px] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-[#8b8b8b]">{label}</p>
          <p className="mt-3 break-all font-mono text-xs leading-6 text-[#f2f2f2]">{value}</p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/5 text-[#8b8b8b] transition hover:border-[#0047ab]/22 hover:text-[#0047ab]"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="size-4 text-[#0047ab]" /> : <Copy className="size-4" />}
        </button>
      </div>
    </article>
  );
}

export default function DashboardPage() {
  const notes = useShieldedStore((state) => state.notes);
  const revealBalances = useShieldedStore((state) => state.revealBalances);
  const setRevealBalances = useShieldedStore((state) => state.setRevealBalances);
  const spendingKey = useShieldedStore((state) => state.spendingKey);
  const transactions = useShieldedStore((state) => state.transactions);
  const viewingKey = useShieldedStore((state) => state.viewingKey);

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const totalBalance = getShieldedBalance(notes);
  const recentTransactions = sortTransactions(transactions).slice(0, 3);
  const accountPreview = useMemo(
    () => deriveShieldedAccountPreview(spendingKey, viewingKey),
    [spendingKey, viewingKey]
  );

  async function handleCopy(label: string, value: string) {
    await copyText(value);
    setCopiedField(label);
    window.setTimeout(() => setCopiedField((current) => (current === label ? null : current)), 1400);
  }

  return (
    <PageShell
      title="Private account"
      description="A simpler view of your shielded balance, recent flow, and account keys."
    >
      <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <section className="surface-panel rounded-[32px] p-7 sm:p-8">
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
              className="inline-flex size-11 items-center justify-center rounded-full border border-white/8 bg-white/5 text-[#8b8b8b] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:-translate-y-0.5 hover:border-[#0047ab]/22 hover:text-[#0047ab]"
            >
              {revealBalances ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <p className="mt-4 text-sm leading-7 text-[#8b8b8b]">
            Hidden by default. Reveal only when you need a quick check.
          </p>
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
              hint="latest transfers"
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
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="hero-kicker font-mono text-xs uppercase text-[#666666]">
                Shielded Account
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#f2f2f2]">
                Keys and address
              </h3>
              <p className="mt-3 text-sm leading-7 text-[#8b8b8b]">
                Preview the current owner and viewing key material tied to this local shielded account.
              </p>
            </div>
            <Button
              variant="secondary"
              className="rounded-2xl"
              onClick={() => setShowKeys((value) => !value)}
              icon={showKeys ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            >
              {showKeys ? "Hide keys" : "Preview keys"}
            </Button>
          </div>
          {showKeys ? (
            <div className="mt-6 grid gap-3">
              <KeyPreviewCard
                label="Shielded address"
                value={accountPreview.shieldedAddress}
                copied={copiedField === "Shielded address"}
                onCopy={() => handleCopy("Shielded address", accountPreview.shieldedAddress)}
              />
              <KeyPreviewCard
                label="owner_pk"
                value={accountPreview.ownerPublicKey}
                copied={copiedField === "owner_pk"}
                onCopy={() => handleCopy("owner_pk", accountPreview.ownerPublicKey)}
              />
              <KeyPreviewCard
                label="owner private key"
                value={accountPreview.ownerPrivateKey}
                copied={copiedField === "owner private key"}
                onCopy={() => handleCopy("owner private key", accountPreview.ownerPrivateKey)}
              />
              <KeyPreviewCard
                label="viewing_pk"
                value={accountPreview.viewingPublicKey}
                copied={copiedField === "viewing_pk"}
                onCopy={() => handleCopy("viewing_pk", accountPreview.viewingPublicKey)}
              />
              <KeyPreviewCard
                label="viewing private key"
                value={accountPreview.viewingPrivateKey}
                copied={copiedField === "viewing private key"}
                onCopy={() => handleCopy("viewing private key", accountPreview.viewingPrivateKey)}
              />
            </div>
          ) : (
            <div className="surface-subtle mt-6 rounded-[26px] p-5">
              <p className="text-sm leading-7 text-[#8b8b8b]">
                Key material stays hidden until you explicitly reveal it. Use the preview button when you need to inspect or copy a value.
              </p>
            </div>
          )}
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
            <Link href="/inbox" className="text-sm text-[#4d7fd6] transition hover:text-[#7df9ff]">
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
