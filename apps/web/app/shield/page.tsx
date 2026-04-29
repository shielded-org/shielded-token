"use client";

import {Copy, ShieldCheck} from "lucide-react";
import {useMemo, useState} from "react";
import {PageShell} from "@/components/layout/page-shell";
import {AmountInput} from "@/components/ui/amount-input";
import {Button} from "@/components/ui/button";
import {HashDisplay} from "@/components/ui/hash-display";
import {PrivacyWarning} from "@/components/ui/privacy-warning";
import {SelectField} from "@/components/ui/select-field";
import {TOKENS} from "@/lib/constants";
import {createHex, copyText, formatAmount, nowIso} from "@/lib/utils";
import {useShieldedStore} from "@/store/use-shielded-store";

export default function ShieldPage() {
  const addNote = useShieldedStore((state) => state.addNote);
  const upsertTransaction = useShieldedStore((state) => state.upsertTransaction);

  const [token, setToken] = useState(TOKENS[0].symbol);
  const [amount, setAmount] = useState("100.000000");
  const [submitting, setSubmitting] = useState(false);
  const [successNote, setSuccessNote] = useState<`0x${string}` | null>(null);

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
      setSubmitting(false);
    }, 1300);
  }

  return (
    <PageShell
      eyebrow="Boundary Action"
      title="Enter the private pool."
      description="Shielding is the public handoff into private state. We keep the form direct, warn clearly about what becomes public, and return a freshly encrypted note on success."
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_0.82fr]">
        <section className="surface-panel rounded-[32px] p-7 sm:p-8">
          <div className="space-y-5">
            <PrivacyWarning message="This action is a public boundary — your deposit address and amount are visible on-chain." />
            <div className="grid gap-5">
              <label className="space-y-2">
                <span className="text-sm text-[#8b8b8b]">Token</span>
                <SelectField value={token} onChange={(event) => setToken(event.target.value)}>
                  {TOKENS.map((item) => (
                    <option key={item.symbol} value={item.symbol}>
                      {item.name}
                    </option>
                  ))}
                </SelectField>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-[#8b8b8b]">Amount</span>
                <AmountInput value={amount} onChange={setAmount} />
              </label>
              <div className="surface-subtle rounded-[26px] p-5">
                <p className="hero-kicker font-mono text-xs uppercase text-[#666666]">
                  Commitment Preview
                </p>
                <div className="mt-4">
                  <HashDisplay value={commitment} />
                </div>
              </div>
            </div>
            <Button className="rounded-2xl" onClick={handleSubmit} disabled={submitting || Number(amount) <= 0} icon={<ShieldCheck className="size-4" />}>
              {submitting ? "Registering note..." : "Shield via wallet"}
            </Button>

            {successNote ? (
              <div className="rounded-[26px] border border-[#00ff7f]/20 bg-[#00ff7f]/8 p-5 shadow-[0_18px_44px_rgba(0,255,127,0.08)]">
                <p className="hero-kicker font-mono text-xs uppercase text-[#00ff7f]">
                  Note registered
                </p>
                <p className="mt-3 text-sm leading-7 text-[#8b8b8b]">
                  Save the encrypted note output for later recovery tooling. The UI never exposes your spending key.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <HashDisplay value={successNote} />
                  <button
                    type="button"
                    onClick={() => copyText(successNote)}
                    className="inline-flex items-center gap-2 rounded-md border border-[#222222] px-3 py-2 text-xs text-[#cccccc] transition hover:text-[#00ff7f]"
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
            <p className="hero-kicker font-mono text-xs uppercase text-[#666666]">
              What happens
            </p>
            <ol className="mt-5 space-y-4 text-sm leading-8 text-[#8b8b8b]">
              <li>1. Your wallet signs a public on-chain deposit into the shielded contract.</li>
              <li>2. The app derives a fresh note commitment and encrypted payload.</li>
              <li>3. The note becomes discoverable later through private inbox scanning.</li>
            </ol>
          </section>
          <section className="surface-panel rounded-[32px] p-7">
            <p className="hero-kicker font-mono text-xs uppercase text-[#666666]">
              Deposit summary
            </p>
            <div className="mt-5 space-y-3 rounded-[26px] border border-white/8 bg-white/[0.03] p-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#666666]">Token</span>
                <span className="text-[#f2f2f2]">{token}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#666666]">Amount</span>
                <span className="font-mono text-[#f2f2f2]">{formatAmount(amount)} {token}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#666666]">Pool mode</span>
                <span className="text-[#f2f2f2]">Shielded entry</span>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </PageShell>
  );
}
