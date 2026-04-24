"use client";

import {useMemo, useState} from "react";

type RelayResult = {
  accepted: boolean;
  requestId?: string;
  txHash?: string;
  error?: string;
};

const RELAYER_URL =
  process.env.NEXT_PUBLIC_RELAYER_URL || "http://localhost:8787";

function fakeHex(seed: string) {
  let value = 0;
  for (let i = 0; i < seed.length; i += 1) value = (value * 31 + seed.charCodeAt(i)) >>> 0;
  return `0x${value.toString(16).padStart(64, "0")}`;
}

export default function Home() {
  const [recipient, setRecipient] = useState("0xRecipientPublicKey");
  const [amount, setAmount] = useState("10");
  const [fee, setFee] = useState("1");
  const [relayResult, setRelayResult] = useState<RelayResult | null>(null);
  const [loading, setLoading] = useState(false);

  const [events, setEvents] = useState<Array<{commitment: string; txHash: string; ciphertext: string; senderHint: string}>>([]);
  const [incomingKey, setIncomingKey] = useState("42");
  const discovered = useMemo(() => {
    const view = Number(incomingKey || "0");
    return events
      .map((event, index) => ({...event, index, amount: (Number.parseInt(event.ciphertext.slice(-4), 16) ^ view) % 10_000}))
      .filter((event) => event.amount >= 0);
  }, [events, incomingKey]);

  async function onPrivateTransfer() {
    setLoading(true);
    setRelayResult(null);
    try {
      const now = Date.now().toString();
      const bundle = {
        proof: fakeHex(`proof:${recipient}:${amount}:${fee}:${now}`),
        nullifiers: [fakeHex(`nf0:${now}`), fakeHex(`nf1:${now}`)],
        newCommitments: [fakeHex(`out0:${recipient}:${amount}`), fakeHex(`out1:change:${fee}`)],
        merkleRoot: fakeHex("known-root"),
        token: fakeHex("token"),
        fee,
      };

      const response = await fetch(`${RELAYER_URL}/relay/shielded-transfer`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify(bundle),
      });
      const payload = (await response.json()) as RelayResult;
      setRelayResult(payload);

      if (payload.accepted && payload.txHash) {
        setEvents((prev) => [
          {
            commitment: bundle.newCommitments[0],
            txHash: payload.txHash!,
            ciphertext: fakeHex(`cipher:${amount}:${incomingKey}`),
            senderHint: fakeHex("sender"),
          },
          ...prev,
        ]);
      }
    } catch (error) {
      setRelayResult({accepted: false, error: String(error)});
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <main className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-2xl font-semibold">Shielded Token Console</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Phase 6-10 product baseline: proof bundle creation, relayer submit,
            recipient note discovery, and launch runbook-ready flows.
          </p>

          <div className="mt-5 space-y-3">
            <label className="block text-sm">
              Recipient public key
              <input className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
            </label>
            <label className="block text-sm">
              Amount
              <input className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="block text-sm">
              Relayer fee
              <input className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" value={fee} onChange={(e) => setFee(e.target.value)} />
            </label>
            <button
              type="button"
              disabled={loading}
              onClick={onPrivateTransfer}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? "Submitting..." : "Submit shielded transfer via relayer"}
            </button>
          </div>

          {relayResult && (
            <div className="mt-4 rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-700">
              <p>accepted: {String(relayResult.accepted)}</p>
              <p>requestId: {relayResult.requestId || "-"}</p>
              <p>txHash: {relayResult.txHash || "-"}</p>
              <p>error: {relayResult.error || "-"}</p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-xl font-semibold">Recipient Discovery</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Scan NewCommitment-style events and locally try incoming-view-key
            note discovery.
          </p>

          <label className="mt-4 block text-sm">
            Incoming viewing key (demo)
            <input className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" value={incomingKey} onChange={(e) => setIncomingKey(e.target.value)} />
          </label>

          <div className="mt-4 space-y-2">
            {discovered.length === 0 && <p className="text-xs text-zinc-500">No notes discovered yet.</p>}
            {discovered.map((note) => (
              <article key={`${note.txHash}-${note.index}`} className="rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-700">
                <p>txHash: {note.txHash}</p>
                <p>commitment: {note.commitment}</p>
                <p>decoded amount: {note.amount}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
