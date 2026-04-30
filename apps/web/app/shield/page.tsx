"use client";

import {Copy, ShieldCheck} from "lucide-react";
import {useMemo, useState} from "react";
import {PageShell} from "@/components/layout/page-shell";
import {AmountInput} from "@/components/ui/amount-input";
import {ActionOutcomeCard} from "@/components/ui/action-outcome-card";
import {Button} from "@/components/ui/button";
import {HashDisplay} from "@/components/ui/hash-display";
import {PrivacyWarning} from "@/components/ui/privacy-warning";
import {SelectField} from "@/components/ui/select-field";
import {TOKENS} from "@/lib/constants";
import {createHex, copyText, formatAmount, getAmountValidationMessage, nowIso} from "@/lib/utils";
import {useShieldedStore} from "@/store/use-shielded-store";

export default function ShieldPage() {
  const addNote = useShieldedStore((state) => state.addNote);
  const upsertTransaction = useShieldedStore((state) => state.upsertTransaction);

  const [token, setToken] = useState(TOKENS[0].symbol);
  const [amount, setAmount] = useState("100.000000");
  const [submitting, setSubmitting] = useState(false);
  const [successNote, setSuccessNote] = useState<`0x${string}` | null>(null);
  const [successTxHash, setSuccessTxHash] = useState<`0x${string}` | null>(null);
  const amountError = getAmountValidationMessage(amount, Number.MAX_SAFE_INTEGER, 6);

  const commitment = useMemo(
    () => createHex(`${token}-${amount}-commitment`),
    [token, amount]
  );

  async function handleSubmit() {
    setSubmitting(true);
    const txHash = createHex("shield-tx");
    const encryptedNote = createHex("shielded-note");
    const noteId = crypto.randomUUID();

    window.setTimeout(() => {
      addNote({
        id: noteId,
        token,
        amount: Number(amount || 0).toFixed(6),
        status: "unspent",
        commitment,
        encryptedNote,
        discoveredAt: nowIso(),
        source: "shield",
        txHash,
      });
      upsertTransaction({
        id: noteId,
        kind: "shield",
        token,
        amount: Number(amount || 0).toFixed(6),
        createdAt: nowIso(),
        status: "confirmed",
        txHash,
      });
      setSuccessNote(encryptedNote);
      setSuccessTxHash(txHash);
      setSubmitting(false);
    }, 1300);
  }

  return (
    <PageShell
      eyebrow="Boundary Action"
      title="Enter the private pool."
      description="Deposit publicly once, then hold spendable value in private state. This flow keeps boundary visibility clear."
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_0.82fr]">
        <section className="surface-panel rounded-[32px] p-7 sm:p-8">
          <div className="space-y-5">
            <PrivacyWarning message="This action is a public boundary — your deposit address and amount are visible on-chain." variant="warning" />
            <div className="grid gap-5">
              <label className="space-y-2">
                <span className="text-sm text-[#6b7280]">Token</span>
                <SelectField value={token} onChange={(event) => setToken(event.target.value)}>
                  {TOKENS.map((item) => (
                    <option key={item.symbol} value={item.symbol}>
                      {item.name}
                    </option>
                  ))}
                </SelectField>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[#6b7280]">Amount</span>
                <AmountInput value={amount} onChange={setAmount} />
                {amountError ? <p className="text-xs text-amber-300">{amountError}</p> : null}
              </label>
              <div className="surface-subtle rounded-[26px] p-5">
                  <p className="hero-kicker font-mono text-xs uppercase text-[#9ca3af]">
                  Commitment Preview
                </p>
                <div className="mt-4">
                  <HashDisplay value={commitment} />
                </div>
              </div>
            </div>
            <Button className="rounded-2xl" onClick={handleSubmit} disabled={submitting || Boolean(amountError)} icon={<ShieldCheck className="size-4" />}>
              {submitting ? "Registering note..." : "Shield via wallet"}
            </Button>
            {amountError && !submitting ? (
              <p className="text-xs text-[#6b7280]">Fix amount input to continue.</p>
            ) : null}

            {successNote ? (
              <div className="space-y-3">
                <ActionOutcomeCard
                  title="Deposit completed"
                  summary={`Created 1 new unspent ${token} note worth ${formatAmount(amount)}. You can now spend privately from the pool.`}
                  visibilityNote="Public footprint: deposit address and amount are visible on-chain."
                  txHash={successTxHash}
                  status="warning"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <HashDisplay value={successNote} />
                  <button
                    type="button"
                    onClick={() => copyText(successNote)}
                    className="inline-flex items-center gap-2 rounded-md border border-[#d1d5db] bg-white px-3 py-2 text-xs text-[#374151] transition hover:text-[#4f46e5]"
                  >
                    <Copy className="size-3.5" />
                    Copy note
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="surface-panel rounded-[32px] p-7">
            <p className="hero-kicker font-mono text-xs uppercase text-[#9ca3af]">
              What happens
            </p>
            <ol className="mt-5 space-y-4 text-sm leading-8 text-[#6b7280]">
              <li>1. Your wallet signs a public on-chain deposit into the shielded contract.</li>
              <li>2. The app derives a fresh note commitment and encrypted payload.</li>
              <li>3. The note becomes discoverable later through private inbox scanning.</li>
            </ol>
          </section>
          <section className="surface-panel rounded-[32px] p-7">
            <p className="hero-kicker font-mono text-xs uppercase text-[#9ca3af]">
              Deposit summary
            </p>
            <div className="mt-5 space-y-3 rounded-[26px] border border-[#e5e7eb] bg-[#f9fafb] p-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#9ca3af]">Token</span>
                <span className="text-[#111827]">{token}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#9ca3af]">Amount</span>
                <span className="font-mono text-[#111827]">{formatAmount(amount)} {token}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#9ca3af]">Pool mode</span>
                <span className="text-[#111827]">Shielded entry</span>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </PageShell>
  );
}
