"use client";

import {ArrowRightLeft, CircleCheckBig} from "lucide-react";
import {useMemo, useState} from "react";
import {NoteCard} from "@/components/notes/note-card";
import {PageShell} from "@/components/layout/page-shell";
import {ProofLoader} from "@/components/proof/proof-loader";
import {AmountInput} from "@/components/ui/amount-input";
import {Button} from "@/components/ui/button";
import {HashDisplay} from "@/components/ui/hash-display";
import {InputField} from "@/components/ui/input-field";
import {SelectField} from "@/components/ui/select-field";
import {StatusBadge} from "@/components/ui/status-badge";
import {simulateProofFlow, submitRelayerPayload} from "@/lib/protocol";
import {TOKENS} from "@/lib/constants";
import {createHex, formatAmount, nowIso} from "@/lib/utils";
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
        description="Select an unspent note, derive a proof locally, then hand the encrypted transfer to the relayer. Change routes back to your own note store automatically."
      >
        <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <section className="surface-panel rounded-[32px] p-7 sm:p-8">
            <div className="grid gap-5">
              <label className="space-y-2">
                <span className="text-sm text-[#8b8b8b]">Recipient viewing public key</span>
                <InputField value={recipient} onChange={(event) => setRecipient(event.target.value)} />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
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
              </div>

              <div className="surface-subtle rounded-[26px] p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="hero-kicker font-mono text-xs uppercase text-[#666666]">
                      Note selector
                    </p>
                    <p className="mt-2 text-sm text-[#8b8b8b]">
                      Choose the note you want to spend from, UTXO-style.
                    </p>
                  </div>
                  <span className="text-xs text-[#666666]">{candidateNotes.length} eligible notes</span>
                </div>
                <div className="mt-4 grid gap-3">
                  {candidateNotes.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => setSelectedNoteId(note.id)}
                      className="text-left"
                    >
                      <NoteCard note={note} selectable selected={selectedNote?.id === note.id} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                className="rounded-2xl"
                onClick={handleTransfer}
                disabled={!selectedNote || Number(amount) <= 0 || Number(selectedNote?.amount ?? 0) < Number(amount)}
                icon={<ArrowRightLeft className="size-4" />}
              >
                Generate proof and send
              </Button>
              {confirmedHash ? <HashDisplay value={confirmedHash} /> : null}
              {requestId ? <span className="font-mono text-xs text-[#666666]">{requestId}</span> : null}
            </div>
          </section>

          <aside className="space-y-5">
            <section className="surface-panel rounded-[32px] p-7">
              <p className="hero-kicker font-mono text-xs uppercase text-[#666666]">
                Transfer path
              </p>
              <div className="surface-subtle mt-5 flex items-center justify-between rounded-[24px] p-4">
                <div>
                  <p className="text-sm text-[#666666]">Relayer status</p>
                  <p className="mt-2 text-lg text-[#f2f2f2]">Live submission state</p>
                </div>
                <StatusBadge status={relayerStatus} />
              </div>
              <div className="surface-subtle mt-4 space-y-3 rounded-[24px] p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[#666666]">Input note</span>
                  <span className="font-mono text-[#f2f2f2]">
                    {selectedNote ? `${formatAmount(selectedNote.amount)} ${selectedNote.token}` : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#666666]">Recipient amount</span>
                  <span className="font-mono text-[#f2f2f2]">{formatAmount(amount)} {token}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#666666]">Change note</span>
                  <span className="font-mono text-[#f2f2f2]">{changeAmount.toFixed(6)} {token}</span>
                </div>
              </div>
            </section>

            <section className="surface-panel rounded-[32px] p-7">
              <p className="hero-kicker font-mono text-xs uppercase text-[#666666]">
                Design note
              </p>
              <p className="mt-5 text-sm leading-7 text-[#8b8b8b]">
                Proof generation can take 10 to 60 seconds in production, so the loading takeover is non-dismissable and step-based. It keeps users confident that the browser is doing real work, not hanging.
              </p>
              {confirmedHash ? (
                <div className="mt-5 rounded-[24px] border border-[#00ff7f]/20 bg-[#00ff7f]/8 p-4 shadow-[0_18px_44px_rgba(0,255,127,0.08)]">
                  <div className="flex items-center gap-3 text-[#00ff7f]">
                    <CircleCheckBig className="size-4" />
                    <span className="text-sm">Transfer confirmed</span>
                  </div>
                  <div className="mt-3">
                    <HashDisplay value={confirmedHash} />
                  </div>
                </div>
              ) : null}
            </section>
          </aside>
        </div>
      </PageShell>
    </>
  );
}
