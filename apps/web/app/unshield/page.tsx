"use client";

import {LogOut} from "lucide-react";
import {ethers} from "ethers";
import {useMemo, useState} from "react";
import {NoteCard} from "@/components/notes/note-card";
import {PageShell} from "@/components/layout/page-shell";
import {ProofLoader} from "@/components/proof/proof-loader";
import {ActionOutcomeCard} from "@/components/ui/action-outcome-card";
import {Button} from "@/components/ui/button";
import {InputField} from "@/components/ui/input-field";
import {PrivacyWarning} from "@/components/ui/privacy-warning";
import {StatusBadge} from "@/components/ui/status-badge";
import {createHex, formatAmount, isValidHexAddress, nowIso} from "@/lib/utils";
import {useShieldedStore} from "@/store/use-shielded-store";
import type {ProofStep, TransactionStatus} from "@/lib/types";

export default function UnshieldPage() {
  const notes = useShieldedStore((state) => state.notes);
  const markNoteSpent = useShieldedStore((state) => state.markNoteSpent);
  const upsertTransaction = useShieldedStore((state) => state.upsertTransaction);
  const updateTransactionStatus = useShieldedStore((state) => state.updateTransactionStatus);
  const spendingKey = useShieldedStore((state) => state.spendingKey);
  const ownerPk = useShieldedStore((state) => state.ownerPk);
  const viewingKey = useShieldedStore((state) => state.viewingKey);
  const viewingPub = useShieldedStore((state) => state.viewingPub);

  const [recipient, setRecipient] = useState("0x8f3CF7ad23Cd3CaDbD9735AFf958023239c6A063");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [proofStep, setProofStep] = useState<ProofStep>("witness");
  const [etaSeconds, setEtaSeconds] = useState(18);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<TransactionStatus>("pending");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [confirmedHash, setConfirmedHash] = useState<`0x${string}` | null>(null);

  const unspentNotes = useMemo(
    () => notes.filter((note) => note.status === "unspent"),
    [notes]
  );
  const selectedNote = unspentNotes.find((note) => note.id === selectedNoteId) ?? unspentNotes[0];
  const recipientError = isValidHexAddress(recipient) ? null : "Enter a valid 0x recipient address.";

  async function handleUnshield() {
    if (!selectedNote) return;
    if (!spendingKey || !ownerPk || !viewingKey || !viewingPub) return;
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

    setProofStep("proof");
    setEtaSeconds(12);
    const {executeUnshield} = await import("@/lib/private-transfer");
    const response = await executeUnshield({
      relayerUrl: process.env.NEXT_PUBLIC_RELAYER_URL ?? "http://127.0.0.1:8787",
      senderSpendingKey: BigInt(spendingKey),
      senderViewingPriv: BigInt(viewingKey),
      senderViewingPub: viewingPub as `0x${string}`,
      senderOwnerPk: BigInt(ownerPk),
      recipientAddress: recipient as `0x${string}`,
      amount: ethers.parseUnits(selectedNote.amount, 18),
      onStatus: (msg) => {
        if (msg.toLowerCase().includes("generating")) setProofStep("proof");
        if (msg.toLowerCase().includes("relayer")) {
          setProofStep("submit");
          setStatus("submitted");
          updateTransactionStatus(transactionId, "submitted");
        }
      },
    });
    setRequestId(response.requestId);
    setConfirmedHash(response.txHash);
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
        title="Withdraw from private pool."
        description="Choose a note and recipient wallet. This action exits private state and makes destination details public on-chain."
      >
        <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <section className="surface-panel rounded-[32px] p-7 sm:p-8">
            <div className="space-y-5">
              <PrivacyWarning message="Withdrawal address and amount become visible on-chain." variant="critical" />
              <label className="space-y-2">
                <span className="text-sm text-[#6b7280]">Recipient address</span>
                <InputField value={recipient} onChange={(event) => setRecipient(event.target.value)} />
                {recipientError ? <p className="text-xs text-amber-300">{recipientError}</p> : null}
              </label>

              <div className="surface-subtle rounded-[26px] p-5">
                <p className="hero-kicker font-mono text-xs uppercase text-[#9ca3af]">
                  Note selector
                </p>
                <div className="mt-4 grid gap-3">
                  {unspentNotes.map((note) => (
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

              <Button className="rounded-2xl" onClick={handleUnshield} disabled={!selectedNote || Boolean(recipientError)} icon={<LogOut className="size-4" />}>
                Generate proof and unshield
              </Button>
              {recipientError ? <p className="text-xs text-[#6b7280]">Fix recipient address to continue.</p> : null}
              {confirmedHash ? (
                <ActionOutcomeCard
                  title="Withdrawal confirmed"
                  summary={`Spent 1 ${selectedNote?.token ?? ""} note and released funds to public wallet ${recipient.slice(0, 10)}...`}
                  visibilityNote="Public footprint: destination and amount are visible."
                  txHash={confirmedHash}
                  requestId={requestId}
                  status="warning"
                />
              ) : null}
            </div>
          </section>

          <aside className="space-y-5">
            <section className="surface-panel rounded-[32px] p-7">
              <p className="hero-kicker font-mono text-xs uppercase text-[#9ca3af]">
                Exit summary
              </p>
              <div className="surface-subtle mt-5 space-y-3 rounded-[24px] p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[#9ca3af]">Selected note</span>
                  <span className="font-mono text-[#111827]">
                    {selectedNote ? `${formatAmount(selectedNote.amount)} ${selectedNote.token}` : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#9ca3af]">Recipient</span>
                  <span className="font-mono text-[#111827]">{recipient.slice(0, 10)}...</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#9ca3af]">Relayer status</span>
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
