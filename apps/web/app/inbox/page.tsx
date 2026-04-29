"use client";

import {useMemo, useState} from "react";
import {EmptyState} from "@/components/ui/empty-state";
import {HashDisplay} from "@/components/ui/hash-display";
import {PageShell} from "@/components/layout/page-shell";
import {SegmentedControl} from "@/components/ui/segmented-control";
import {useShieldedStore} from "@/store/use-shielded-store";
import {formatAmount, relativeTime} from "@/lib/utils";

type Filter = "all" | "unspent" | "spent";

export default function InboxPage() {
  const notes = useShieldedStore((state) => state.notes);
  const lastSyncedBlock = useShieldedStore((state) => state.lastSyncedBlock);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filteredNotes = useMemo(() => {
    if (filter === "all") return notes;
    return notes.filter((note) => note.status === filter);
  }, [filter, notes]);

  return (
    <PageShell
      eyebrow="Note Inbox"
      title="Quietly scanning, always ready."
      description="Discovery runs in the background. The inbox emphasizes spendability first, then lets power users open each note for commitment, nullifier, and encrypted payload detail."
      actions={
        <div className="surface-subtle rounded-[24px] px-4 py-3 text-sm">
          <span className="inline-flex items-center gap-2 text-[#8b8b8b]">
            <span className="size-2 rounded-full bg-[#00ff7f] animate-pulse" />
            scanning...
          </span>
          <p className="mt-2 font-mono text-xs text-[#666666]">
            last synced: block {lastSyncedBlock.toLocaleString()}
          </p>
        </div>
      }
    >
      <div className="space-y-5">
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          options={[
            {label: "All", value: "all"},
            {label: "Unspent", value: "unspent"},
            {label: "Spent", value: "spent"},
          ]}
        />

        {filteredNotes.length === 0 ? (
          <EmptyState
            title="No notes discovered yet"
            description="Once the scanner decrypts a routed commitment for your viewing key, it will land here automatically."
            art={
              <pre className="overflow-hidden text-[#444444]">{String.raw`┌──────────────────────────┐
│  0x00  no private notes  │
└──────────────────────────┘`}</pre>
            }
          />
        ) : (
          <div className="surface-panel overflow-hidden rounded-[32px]">
            <div className="grid grid-cols-[1fr_1fr_120px_120px] gap-4 border-b border-white/8 px-5 py-4 font-mono text-[11px] uppercase tracking-[0.24em] text-[#666666]">
              <span>Token</span>
              <span>Amount</span>
              <span>Status</span>
              <span>Discovered</span>
            </div>
            <div>
              {filteredNotes.map((note, index) => (
                <div
                  key={note.id}
                  className="border-b border-white/6 last:border-b-0"
                  style={{
                    animation: `page-enter 150ms ease-out ${index * 50}ms both`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === note.id ? null : note.id)}
                    className="grid w-full grid-cols-[1fr_1fr_120px_120px] gap-4 px-5 py-4 text-left transition hover:bg-white/[0.03]"
                  >
                    <span className="text-sm text-[#f2f2f2]">{note.token}</span>
                    <span className="font-mono text-sm text-[#f2f2f2]">
                      {formatAmount(note.amount)}
                    </span>
                    <span className={note.status === "unspent" ? "text-[#00ff7f]" : "text-[#666666]"}>
                      {note.status === "unspent" ? "UNSPENT" : "SPENT"}
                    </span>
                    <span className="text-sm text-[#666666]">{relativeTime(note.discoveredAt)}</span>
                  </button>
                  {expanded === note.id ? (
                    <div className="grid gap-3 bg-black/20 px-5 py-4 text-sm text-[#8b8b8b] sm:grid-cols-3">
                      <div>
                        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#666666]">
                          Commitment
                        </p>
                        <div className="mt-2">
                          <HashDisplay value={note.commitment} />
                        </div>
                      </div>
                      <div>
                        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#666666]">
                          Nullifier
                        </p>
                        <div className="mt-2">
                          {note.nullifier ? <HashDisplay value={note.nullifier} /> : <span>-</span>}
                        </div>
                      </div>
                      <div>
                        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#666666]">
                          Encrypted Note
                        </p>
                        <div className="mt-2">
                          <HashDisplay value={note.encryptedNote} />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
