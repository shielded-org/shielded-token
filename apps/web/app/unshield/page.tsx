"use client";

import {LogOut} from "lucide-react";
import {useMemo, useState} from "react";
import {NoteCard} from "@/components/notes/note-card";
import {PageShell} from "@/components/layout/page-shell";
import {ProofLoader} from "@/components/proof/proof-loader";
import {Button} from "@/components/ui/button";
import {InputField} from "@/components/ui/input-field";
import {PrivacyWarning} from "@/components/ui/privacy-warning";
import {StatusBadge} from "@/components/ui/status-badge";
import {simulateProofFlow, submitRelayerPayload} from "@/lib/protocol";
import {createHex, formatAmount, nowIso} from "@/lib/utils";
import {useShieldedStore} from "@/store/use-shielded-store";
import type {ProofStep, TransactionStatus} from "@/lib/types";

export default function UnshieldPage() {
  const notes = useShieldedStore((state) => state.notes);
  const markNoteSpent = useShieldedStore((state) => state.markNoteSpent);
  const upsertTransaction = useShieldedStore((state) => state.upsertTransaction);
  const updateTransactionStatus = useShieldedStore((state) => state.updateTransactionStatus);

  const [recipient, setRecipient] = useState("0x8f3CF7ad23Cd3CaDbD9735AFf958023239c6A063");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [proofStep, setProofStep] = useState<ProofStep>("witness");
  const [etaSeconds, setEtaSeconds] = useState(18);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<TransactionStatus>("pending");

  const unspentNotes = useMemo(
    () => notes.filter((note) => note.status === "unspent"),
    [notes]
  );
  const selectedNote = unspentNotes.find((note) => note.id === selectedNoteId) ?? unspentNotes[0];

  async function handleUnshield() {
    if (!selectedNote) return;
    setLoading(true);
    setStatus("pending");
    const transactionId = crypto.randomUUID();
    upsertTransaction({
      id: transactionId,
      kind: "unshield",
      token: selectedNote.token,
      amount: selectedNote.amount,
      createdAt: nowIso(),
      status: "pending",
      counterparty: recipient as `0x${string}`,
    });

    await simulateProofFlow((step, eta) => {
      setProofStep(step);
      setEtaSeconds(eta);
      if (step === "submit") {
        setStatus("submitted");
        updateTransactionStatus(transactionId, "submitted");
      }
    });

    const response = await submitRelayerPayload("unshield");
    markNoteSpent(selectedNote.id, createHex(`nullifier-${selectedNote.id}`));
    setStatus("confirmed");
    updateTransactionStatus(transactionId, "confirmed", response.txHash);
    setLoading(false);
  }

  return (
    <>
      <ProofLoader step={proofStep} etaSeconds={etaSeconds} visible={loading} />
      <PageShell
        eyebrow="Public Exit"
        title="Leave the pool carefully."
        description="Choose a note, specify the recipient wallet, and prepare users for the fact that the destination address becomes visible once value exits private state."
      >
        <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <section className="surface-panel rounded-[32px] p-7 sm:p-8">
            <div className="space-y-5">
              <PrivacyWarning message="Withdrawal address is visible on-chain." />
              <label className="space-y-2">
                <span className="text-sm text-[#8b8b8b]">Recipient address</span>
                <InputField value={recipient} onChange={(event) => setRecipient(event.target.value)} />
              </label>

              <div className="surface-subtle rounded-[26px] p-5">
                <p className="hero-kicker font-mono text-xs uppercase text-[#666666]">
                  Note selector
                </p>
                <div className="mt-4 grid gap-3">
                  {unspentNotes.map((note) => (
                    <button key={note.id} type="button" onClick={() => setSelectedNoteId(note.id)} className="text-left">
                      <NoteCard note={note} selectable selected={selectedNote?.id === note.id} />
                    </button>
                  ))}
                </div>
              </div>

              <Button className="rounded-2xl" onClick={handleUnshield} disabled={!selectedNote} icon={<LogOut className="size-4" />}>
                Generate proof and unshield
              </Button>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="surface-panel rounded-[32px] p-7">
              <p className="hero-kicker font-mono text-xs uppercase text-[#666666]">
                Exit summary
              </p>
              <div className="surface-subtle mt-5 space-y-3 rounded-[24px] p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[#666666]">Selected note</span>
                  <span className="font-mono text-[#f2f2f2]">
                    {selectedNote ? `${formatAmount(selectedNote.amount)} ${selectedNote.token}` : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#666666]">Recipient</span>
                  <span className="font-mono text-[#f2f2f2]">{recipient.slice(0, 10)}...</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#666666]">Relayer status</span>
                  <StatusBadge status={status} />
                </div>
              </div>
            </section>
          </aside>
        </div>
      </PageShell>
    </>
  );
}
