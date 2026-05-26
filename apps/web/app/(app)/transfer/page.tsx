"use client";

import {ArrowRightLeft} from "lucide-react";
import {ethers} from "ethers";
import {useEffect, useMemo, useState} from "react";
import {NoteCard} from "@/components/notes/note-card";
import {PageShell} from "@/components/layout/page-shell";
import {ProofLoader} from "@/components/proof/proof-loader";
import {ActionOutcomeCard} from "@/components/ui/action-outcome-card";
import {AmountInput} from "@/components/ui/amount-input";
import {Button} from "@/components/ui/button";
import {InputField} from "@/components/ui/input-field";
import {SelectField} from "@/components/ui/select-field";
import {decodeShieldedAddress} from "@/lib/shielded-address";
import {usePoolScopedNotes} from "@/hooks/use-pool-scoped-notes";
import {RELAYER_URL} from "@/lib/constants";
import {tokenOptionsForShieldedPool} from "@/lib/networks";
import {mapRelayStatusMessageToProofStep, suggestedEtaForProofStep} from "@/lib/transfer-progress";
import {toast} from "@/lib/toast";
import {
  createHex,
  formatAmount,
  getAmountValidationMessage,
  isValidViewingKey,
  noteMatchesTokenOption,
  nowIso,
} from "@/lib/utils";
import {useShieldedStore} from "@/store/use-shielded-store";
import type {ProofStep, TransactionStatus} from "@/lib/types";

export default function TransferPage() {
  const {notes, shieldedRpcChainId} = usePoolScopedNotes();
  const addNote = useShieldedStore((state) => state.addNote);
  const markNoteSpent = useShieldedStore((state) => state.markNoteSpent);
  const upsertTransaction = useShieldedStore((state) => state.upsertTransaction);
  const updateTransactionStatus = useShieldedStore((state) => state.updateTransactionStatus);
  const spendingKey = useShieldedStore((state) => state.spendingKey);
  const ownerPk = useShieldedStore((state) => state.ownerPk);
  const viewingKey = useShieldedStore((state) => state.viewingKey);
  const viewingPub = useShieldedStore((state) => state.viewingPub);
  const availableTokens = useShieldedStore((state) => state.tokens);
  const tokenOptions = useMemo(
    () => tokenOptionsForShieldedPool(shieldedRpcChainId, availableTokens),
    [shieldedRpcChainId, availableTokens]
  );

  const [recipient, setRecipient] = useState("");
  const [token, setToken] = useState(() => tokenOptions[0]?.symbol ?? "MOCK");
  const [amount, setAmount] = useState("90");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [proofStep, setProofStep] = useState<ProofStep>("witness");
  const [etaSeconds, setEtaSeconds] = useState(18);
  const [loading, setLoading] = useState(false);
  const [relayerStatus, setRelayerStatus] = useState<TransactionStatus>("pending");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [confirmedHash, setConfirmedHash] = useState<`0x${string}` | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [livePipelineStatus, setLivePipelineStatus] = useState<string | null>(null);

  const tokenListKey = useMemo(
    () => tokenOptions.map((t) => `${t.symbol}:${t.contractAddress.toLowerCase()}`).join("|"),
    [tokenOptions]
  );

  useEffect(() => {
    if (!tokenOptions.length) return;
    setToken((prev) => (tokenOptions.some((t) => t.symbol === prev) ? prev : tokenOptions[0]!.symbol));
  }, [shieldedRpcChainId, tokenListKey]);

  const tokenMeta = useMemo(
    () => tokenOptions.find((t) => t.symbol === token) ?? tokenOptions[0],
    [tokenOptions, token]
  );

  const candidateNotes = useMemo(() => {
    if (!tokenMeta) return [];
    return notes.filter(
      (note) => noteMatchesTokenOption(note, {symbol: token, contractAddress: tokenMeta.contractAddress}) && note.status === "unspent"
    );
  }, [notes, token, tokenMeta]);
  const selectedNote =
    candidateNotes.find((note) => note.id === selectedNoteId) ?? candidateNotes[0];
  const changeAmount = Math.max(0, Number(selectedNote?.amount ?? 0) - Number(amount || 0));
  const recipientError = recipient.startsWith("shd_")
    ? (() => {
        try {
          const d = decodeShieldedAddress(recipient);
          return d.chainId !== shieldedRpcChainId
            ? `This shielded address targets chain ${d.chainId}. Switch pool network in the header to match.`
            : null;
        } catch {
          return "Invalid shielded address.";
        }
      })()
    : isValidViewingKey(recipient)
      ? null
      : "Enter a valid shielded address or viewing key.";
  const amountError = getAmountValidationMessage(amount, Number(selectedNote?.amount ?? 0), tokenMeta.decimals);

  async function handleTransfer() {
    if (!selectedNote) return;
    if (!spendingKey || !ownerPk || !viewingKey || !viewingPub) return;
    setLoading(true);
    setRelayerStatus("pending");
    setTransferError(null);
    setLivePipelineStatus("Starting…");

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

    try {
      setProofStep("witness");
      setEtaSeconds(suggestedEtaForProofStep("witness"));
      const recipientKeys = recipient.startsWith("shd_")
        ? decodeShieldedAddress(recipient)
        : {ownerPk: BigInt(ownerPk), viewingPub: recipient as `0x${string}`};
      const {executePrivateTransfer} = await import("@/lib/private-transfer");
      const relayerResponse = await executePrivateTransfer({
        relayerUrl: RELAYER_URL,
        shieldedChainId: shieldedRpcChainId,
        senderSpendingKey: BigInt(spendingKey),
        senderOwnerPk: BigInt(ownerPk),
        senderViewingPriv: BigInt(viewingKey),
        senderViewingPub: viewingPub as `0x${string}`,
        recipientOwnerPk: recipientKeys.ownerPk,
        recipientViewingPub: recipientKeys.viewingPub,
        tokenAddress: tokenMeta.contractAddress,
        maxRecipientAmount: ethers.parseUnits(amount || "0", tokenMeta.decimals),
        onStatus: (msg) => {
          setLivePipelineStatus(msg);
          const next = mapRelayStatusMessageToProofStep(msg);
          if (next) {
            setProofStep(next);
            setEtaSeconds(suggestedEtaForProofStep(next));
          }
          if (msg.toLowerCase().includes("submitting")) {
            setRelayerStatus("submitted");
            updateTransactionStatus(transactionId, "submitted");
          }
        },
      });
      setProofStep("confirm");
      setEtaSeconds(suggestedEtaForProofStep("confirm"));
      setLivePipelineStatus("Relayer accepted the bundle — transaction submitted.");
      setRequestId(relayerResponse.requestId);
      setConfirmedHash(relayerResponse.txHash);
      setRelayerStatus("confirmed");
      updateTransactionStatus(transactionId, "confirmed", relayerResponse.txHash);

      const nullifier = createHex(`nullifier-${selectedNote.id}`);
      markNoteSpent(selectedNote.id, nullifier);

      addNote({
        id: crypto.randomUUID(),
        token,
        shieldedChainId: shieldedRpcChainId,
        tokenContractAddress: ethers.getAddress(tokenMeta.contractAddress) as `0x${string}`,
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
          shieldedChainId: shieldedRpcChainId,
          tokenContractAddress: ethers.getAddress(tokenMeta.contractAddress) as `0x${string}`,
          amount: changeAmount.toFixed(6),
          status: "unspent",
          commitment: createHex("change-note"),
          encryptedNote: createHex("change-encrypted"),
          discoveredAt: nowIso(),
          source: "transfer",
          txHash: relayerResponse.txHash,
        });
      }
      toast.success(
        `Private transfer submitted: ${formatAmount(amount)} ${token}. Track confirmation below or in your wallet.`
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[transfer] private transfer failed:", e);
      setTransferError(message);
      toast.error(message.length > 420 ? `${message.slice(0, 420)}…` : message);
      setRelayerStatus("failed");
      updateTransactionStatus(transactionId, "failed");
    } finally {
      setLoading(false);
      setLivePipelineStatus(null);
    }
  }

  return (
    <>
      <ProofLoader step={proofStep} etaSeconds={etaSeconds} visible={loading} liveStatus={livePipelineStatus} />
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
                    {tokenOptions.map((item) => (
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
            {transferError ? (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-red-200/80 bg-red-50/95 px-4 py-3 text-xs leading-relaxed text-red-950"
              >
                {transferError}
              </p>
            ) : null}
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
                  <span className="font-mono text-[#111827]">{formatAmount(changeAmount)} {token}</span>
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
