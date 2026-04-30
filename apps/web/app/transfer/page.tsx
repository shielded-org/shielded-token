"use client";

import {ArrowRightLeft} from "lucide-react";
import {useMemo, useState} from "react";
import {NoteCard} from "@/components/notes/note-card";
import {PageShell} from "@/components/layout/page-shell";
import {ProofLoader} from "@/components/proof/proof-loader";
import {ActionOutcomeCard} from "@/components/ui/action-outcome-card";
import {AmountInput} from "@/components/ui/amount-input";
import {Button} from "@/components/ui/button";
import {InputField} from "@/components/ui/input-field";
import {SelectField} from "@/components/ui/select-field";
import {simulateProofFlow, submitRelayerPayload} from "@/lib/protocol";
import {TOKENS} from "@/lib/constants";
import {createHex, formatAmount, getAmountValidationMessage, isValidViewingKey, nowIso} from "@/lib/utils";
import {useShieldedStore} from "@/store/use-shielded-store";
import type {ProofStep, TransactionStatus} from "@/lib/types";

export default function TransferPage() {
  const notes = useShieldedStore((state) => state.notes);
  const addNote = useShieldedStore((state) => state.addNote);
  const markNoteSpent = useShieldedStore((state) => state.markNoteSpent);
  const upsertTransaction = useShieldedStore((state) => state.upsertTransaction);
  const updateTransactionStatus = useShieldedStore((state) => state.updateTransactionStatus);

  const [recipient, setRecipient] = useState("0xRecipientViewingPublicKey");
  const [token, setToken] = useState("sUSD");
  const [amount, setAmount] = useState("90.000000");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [proofStep, setProofStep] = useState<ProofStep>("witness");
  const [etaSeconds, setEtaSeconds] = useState(18);
  const [loading, setLoading] = useState(false);
  const [relayerStatus, setRelayerStatus] = useState<TransactionStatus>("pending");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [confirmedHash, setConfirmedHash] = useState<`0x${string}` | null>(null);

  const candidateNotes = useMemo(
    () => notes.filter((note) => note.token === token && note.status === "unspent"),
    [notes, token]
  );
  const selectedNote =
    candidateNotes.find((note) => note.id === selectedNoteId) ?? candidateNotes[0];
  const changeAmount = Math.max(0, Number(selectedNote?.amount ?? 0) - Number(amount || 0));
  const recipientError = isValidViewingKey(recipient) ? null : "Enter a valid recipient viewing key (hex format).";
  const amountError = getAmountValidationMessage(amount, Number(selectedNote?.amount ?? 0), 6);

  async function handleTransfer() {
    if (!selectedNote) return;
    setLoading(true);
    setRelayerStatus("pending");

    const transactionId = crypto.randomUUID();
    upsertTransaction({
      id: transactionId,
      kind: "transfer",
      token,
      amount: Number(amount || 0).toFixed(6),
      createdAt: nowIso(),
      status: "pending",
      counterparty: recipient as `0x${string}`,
    });

    await simulateProofFlow((step, eta) => {
      setProofStep(step);
      setEtaSeconds(eta);
      if (step === "submit") {
        setRelayerStatus("submitted");
        updateTransactionStatus(transactionId, "submitted");
      }
    });

    const relayerResponse = await submitRelayerPayload("transfer");
    setRequestId(relayerResponse.requestId);
    setConfirmedHash(relayerResponse.txHash);
    setRelayerStatus("confirmed");
    updateTransactionStatus(transactionId, "confirmed", relayerResponse.txHash);

    const nullifier = createHex(`nullifier-${selectedNote.id}`);
    markNoteSpent(selectedNote.id, nullifier);

    addNote({
      id: crypto.randomUUID(),
      token,
      amount: Number(amount || 0).toFixed(6),
      status: "unspent",
      commitment: createHex("recipient-commitment"),
      encryptedNote: createHex("recipient-encrypted"),
      discoveredAt: nowIso(),
      source: "transfer",
      txHash: relayerResponse.txHash,
    });

    if (changeAmount > 0) {
      addNote({
        id: crypto.randomUUID(),
        token,
        amount: changeAmount.toFixed(6),
        status: "unspent",
        commitment: createHex("change-note"),
        encryptedNote: createHex("change-encrypted"),
        discoveredAt: nowIso(),
        source: "transfer",
        txHash: relayerResponse.txHash,
      });
    }

    setLoading(false);
  }

  return (
    <>
      <ProofLoader step={proofStep} etaSeconds={etaSeconds} visible={loading} />
      <PageShell
        eyebrow="Private Transfer"
        title="Send without exposing amount or recipient."
      description="Select an unspent note, set recipient and amount, then generate proof and send privately."
      >
        <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <section className="surface-panel rounded-[32px] p-7 sm:p-8">
            <div className="grid gap-5">
              <label className="space-y-2">
                <span className="text-sm text-[#6b7280]">Recipient viewing public key</span>
                <InputField value={recipient} onChange={(event) => setRecipient(event.target.value)} />
                {recipientError ? <p className="text-xs text-amber-300">{recipientError}</p> : null}
              </label>
              <div className="grid gap-4 md:grid-cols-2">
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
              </div>

              <div className="surface-subtle rounded-[26px] p-5">
                <div className="flex items-center justify-between">
                  <p className="hero-kicker font-mono text-xs uppercase text-[#9ca3af]">
                    Note selector
                  </p>
                  <span className="text-xs text-[#9ca3af]">{candidateNotes.length} eligible notes</span>
                </div>
                <div className="mt-4 grid gap-3">
                  {candidateNotes.map((note) => (
                    <div
                      key={note.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedNoteId(note.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedNoteId(note.id);
                        }
                      }}
                      className="cursor-pointer text-left"
                    >
                      <NoteCard note={note} selectable selected={selectedNote?.id === note.id} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                className="rounded-2xl"
                onClick={handleTransfer}
                disabled={!selectedNote || Boolean(amountError) || Boolean(recipientError)}
                icon={<ArrowRightLeft className="size-4" />}
              >
                Generate proof and send
              </Button>
              {!selectedNote ? <p className="text-xs text-[#6b7280]">No eligible note for selected token.</p> : null}
              {selectedNote && (amountError || recipientError) ? (
                <p className="text-xs text-[#6b7280]">Fix highlighted fields to continue.</p>
              ) : null}
            </div>
            {confirmedHash ? (
              <div className="mt-4">
                <ActionOutcomeCard
                  title="Private transfer confirmed"
                  summary={`Spent 1 note and created ${changeAmount > 0 ? "2 notes (recipient + change)." : "1 recipient note."}`}
                  visibilityNote="Transfer amount and recipient stay shielded."
                  txHash={confirmedHash}
                  requestId={requestId}
                />
              </div>
            ) : null}
          </section>

          <aside className="space-y-5">
            <section className="surface-panel rounded-[32px] p-7">
              <p className="hero-kicker font-mono text-xs uppercase text-[#9ca3af]">
                Transfer summary
              </p>
              <div className="surface-subtle mt-5 space-y-3 rounded-[24px] p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[#9ca3af]">Input note</span>
                  <span className="font-mono text-[#111827]">
                    {selectedNote ? `${formatAmount(selectedNote.amount)} ${selectedNote.token}` : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#9ca3af]">Amount</span>
                  <span className="font-mono text-[#111827]">{formatAmount(amount)} {token}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#9ca3af]">Change</span>
                  <span className="font-mono text-[#111827]">{changeAmount.toFixed(6)} {token}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#9ca3af]">Status</span>
                  <span className="font-mono text-[#111827] capitalize">{relayerStatus}</span>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </PageShell>
    </>
  );
}
