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
      title="Private notes"
      description="Spendable notes are listed first. Advanced cryptographic fields stay tucked behind optional expansion."
      actions={
        <div className="surface-subtle rounded-[24px] px-4 py-3 text-sm">
          <span className="inline-flex items-center gap-2 text-[#6b7280]">
            <span className="size-2 rounded-full bg-[#4f46e5] animate-pulse" />
            scanning notes...
          </span>
          <p className="mt-2 font-mono text-xs text-[#9ca3af]">
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
            title="No private notes yet"
            description="Your notes appear here after a successful private deposit or incoming private transfer."
            art={
              <pre className="overflow-hidden text-[#444444]">{String.raw`┌──────────────────────────┐
│  0x00  no private notes  │
└──────────────────────────┘`}</pre>
            }
          />
        ) : (
          <div className="surface-panel overflow-hidden rounded-[32px]">
            <div className="grid grid-cols-[1fr_1fr_120px_120px] gap-4 border-b border-[#e5e7eb] px-5 py-4 font-mono text-[11px] uppercase tracking-[0.24em] text-[#9ca3af]">
              <span>Token</span>
              <span>Amount</span>
              <span>Status</span>
              <span>Discovered</span>
            </div>
            <div>
              {filteredNotes.map((note, index) => (
                <div
                  key={note.id}
                  className="border-b border-[#f1f5f9] last:border-b-0"
                  style={{
                    animation: `page-enter 150ms ease-out ${index * 50}ms both`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === note.id ? null : note.id)}
                    className="grid w-full grid-cols-[1fr_1fr_120px_120px] gap-4 px-5 py-4 text-left transition hover:bg-[#f8fafc]"
                  >
                    <span className="text-sm text-[#111827]">{note.token}</span>
                    <span className="font-mono text-sm text-[#111827]">
                      {formatAmount(note.amount)}
                    </span>
                    <span className={note.status === "unspent" ? "text-[#1d4ed8]" : "text-[#9ca3af]"}>
                      {note.status === "unspent" ? "UNSPENT" : "SPENT"}
                    </span>
                    <span className="text-sm text-[#6b7280]">{relativeTime(note.discoveredAt)}</span>
                  </button>
                  {expanded === note.id ? (
                    <div className="bg-[#f8fafc] px-5 py-4 text-sm text-[#6b7280]">
                      <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.24em] text-[#9ca3af]">
                        Advanced details
                      </p>
                      <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#9ca3af]">
                          Commitment
                        </p>
                        <div className="mt-2">
                          <HashDisplay value={note.commitment} />
                        </div>
                      </div>
                      <div>
                        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#9ca3af]">
                          Nullifier
                        </p>
                        <div className="mt-2">
                          {note.nullifier ? <HashDisplay value={note.nullifier} /> : <span>-</span>}
                        </div>
                      </div>
                      <div>
                        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#9ca3af]">
                          Encrypted Note
                        </p>
                        <div className="mt-2">
                          <HashDisplay value={note.encryptedNote} />
                        </div>
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
