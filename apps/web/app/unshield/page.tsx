"use client";

import {LogOut} from "lucide-react";
import {ethers} from "ethers";
import {useMemo, useState} from "react";
import {NoteCard} from "@/components/notes/note-card";
import {PageShell} from "@/components/layout/page-shell";
import {ProofLoader} from "@/components/proof/proof-loader";
import {ActionOutcomeCard} from "@/components/ui/action-outcome-card";
import {AmountInput} from "@/components/ui/amount-input";
import {Button} from "@/components/ui/button";
import {InputField} from "@/components/ui/input-field";
import {PrivacyWarning} from "@/components/ui/privacy-warning";
import {SegmentedControl} from "@/components/ui/segmented-control";
import {StatusBadge} from "@/components/ui/status-badge";
import {TOKENS} from "@/lib/constants";
import {createHex, formatAmount, getAmountValidationMessage, isValidHexAddress, nowIso} from "@/lib/utils";
import {useShieldedStore} from "@/store/use-shielded-store";
import type {ProofStep, TransactionStatus} from "@/lib/types";

type RecipientMode = "self" | "external";

export default function UnshieldPage() {
  const notes = useShieldedStore((state) => state.notes);
  const addNote = useShieldedStore((state) => state.addNote);
  const markNoteSpent = useShieldedStore((state) => state.markNoteSpent);
  const upsertTransaction = useShieldedStore((state) => state.upsertTransaction);
  const updateTransactionStatus = useShieldedStore((state) => state.updateTransactionStatus);
  const spendingKey = useShieldedStore((state) => state.spendingKey);
  const ownerPk = useShieldedStore((state) => state.ownerPk);
  const viewingKey = useShieldedStore((state) => state.viewingKey);
  const viewingPub = useShieldedStore((state) => state.viewingPub);
  const walletAddress = useShieldedStore((state) => state.walletAddress);
  const availableTokens = useShieldedStore((state) => state.tokens);
  const tokenOptions = availableTokens.length > 0 ? availableTokens : TOKENS;

  const [recipientMode, setRecipientMode] = useState<RecipientMode>("self");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
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
  const selectedNoteMeta = useMemo(() => {
    const sym = selectedNote?.token;
    if (!sym) return tokenOptions[0];
    return tokenOptions.find((t) => t.symbol === sym) ?? tokenOptions[0];
  }, [selectedNote?.token, tokenOptions]);
  const resolvedRecipient = recipientMode === "self" ? walletAddress ?? "" : recipient.trim();
  const recipientError =
    recipientMode === "self"
      ? walletAddress
        ? null
        : "Connect wallet to withdraw to your own address."
      : isValidHexAddress(resolvedRecipient)
        ? null
        : "Enter a valid 0x recipient address.";
  const amountError = getAmountValidationMessage(amount, Number(selectedNote?.amount ?? 0), selectedNoteMeta.decimals);
  const changeAmount = Math.max(0, Number(selectedNote?.amount ?? 0) - Number(amount || 0));

  async function handleUnshield() {
    if (!selectedNote) return;
    if (!spendingKey || !ownerPk || !viewingKey || !viewingPub) return;
    if (!resolvedRecipient || recipientError || amountError) return;
    setLoading(true);
    setStatus("pending");
    const transactionId = crypto.randomUUID();
    upsertTransaction({
      id: transactionId,
      kind: "unshield",
      token: selectedNote.token,
      amount: Number(amount || 0).toFixed(6),
      createdAt: nowIso(),
      status: "pending",
      counterparty: resolvedRecipient as `0x${string}`,
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
      recipientAddress: resolvedRecipient as `0x${string}`,
      tokenAddress: selectedNoteMeta.contractAddress,
      amount: ethers.parseUnits(amount || "0", selectedNoteMeta.decimals),
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
    if (changeAmount > 0) {
      addNote({
        id: crypto.randomUUID(),
        token: selectedNote.token,
        amount: changeAmount.toFixed(6),
        status: "unspent",
        commitment: createHex(`unshield-change-${selectedNote.id}`),
        encryptedNote: createHex(`unshield-change-encrypted-${selectedNote.id}`),
        discoveredAt: nowIso(),
        source: "unshield",
        txHash: response.txHash,
      });
    }
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
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-1">
                <span className="text-sm text-[#6b7280]">Withdraw to</span>
                <SegmentedControl
                  value={recipientMode}
                  onChange={setRecipientMode}
                  options={[
                    {label: "My address", value: "self"},
                    {label: "External", value: "external"},
                  ]}
                />
              </div>
              {recipientMode === "self" ? (
                <div className="rounded-[24px] border border-[#e5e7eb] bg-[#f8fafc] px-5 py-4 text-sm text-[#4b5563]">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#9ca3af]">Connected recipient</p>
                  <p className="mt-2 font-mono text-sm text-[#111827]">{walletAddress ?? "Connect wallet to use your own address."}</p>
                </div>
              ) : (
                <label className="space-y-2">
                  <span className="text-sm text-[#6b7280]">Recipient address</span>
                  <InputField
                    value={recipient}
                    onChange={(event) => setRecipient(event.target.value)}
                    placeholder="0x..."
                  />
                </label>
              )}
              {recipientError ? <p className="text-xs text-amber-300">{recipientError}</p> : null}
              <label className="space-y-2">
                <span className="text-sm text-[#6b7280]">Amount</span>
                <AmountInput value={amount} onChange={setAmount} />
                {amountError ? <p className="text-xs text-amber-300">{amountError}</p> : null}
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

              <Button
                className="rounded-2xl"
                onClick={handleUnshield}
                disabled={!selectedNote || Boolean(recipientError) || Boolean(amountError)}
                icon={<LogOut className="size-4" />}
              >
                Generate proof and unshield
              </Button>
              {recipientError || amountError ? <p className="text-xs text-[#6b7280]">Fix highlighted fields to continue.</p> : null}
              {confirmedHash ? (
                <ActionOutcomeCard
                  title="Withdrawal confirmed"
                  summary={`Released ${formatAmount(amount)} ${selectedNote?.token ?? ""} to ${resolvedRecipient.slice(0, 10)}...${changeAmount > 0 ? ` and returned ${formatAmount(changeAmount)} as a private change note.` : ""}`}
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
                  <span className="text-[#9ca3af]">Withdrawal amount</span>
                  <span className="font-mono text-[#111827]">
                    {amount ? `${formatAmount(amount)} ${selectedNote?.token ?? ""}` : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#9ca3af]">Private change</span>
                  <span className="font-mono text-[#111827]">
                    {selectedNote ? `${formatAmount(changeAmount)} ${selectedNote.token}` : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#9ca3af]">Recipient</span>
                  <span className="font-mono text-[#111827]">
                    {resolvedRecipient ? `${resolvedRecipient.slice(0, 10)}...` : "-"}
                  </span>
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
