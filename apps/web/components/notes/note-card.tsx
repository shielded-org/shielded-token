import {HashDisplay} from "@/components/ui/hash-display";
import {formatAmount} from "@/lib/utils";
import {cn} from "@/lib/utils";
import type {Note} from "@/lib/types";

function formatDiscoveredDate(value: string) {
  const date = new Date(value);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

export function NoteCard({note, selectable = false, selected = false}: {
  note: Note;
  selectable?: boolean;
  selected?: boolean;
}) {
  return (
    <article
      className={cn(
        "interactive-lift rounded-[26px] border bg-white p-4 transition",
        selected
          ? "border-[#6366f1]/50 shadow-[0_0_0_1px_rgba(99,102,241,0.2),0_10px_24px_rgba(99,102,241,0.14)]"
          : "border-[#e5e7eb]",
        selectable && "hover:border-[#818cf8]"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[#6b7280]">{note.token}</p>
          <p className="mt-1 font-mono text-xl text-[#111827]">
            {formatAmount(note.amount)}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-1 text-[10px] font-semibold tracking-[0.18em]",
            note.status === "unspent"
              ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]"
              : "border-[#e5e7eb] bg-[#f9fafb] text-[#6b7280]"
          )}
        >
          {note.status.toUpperCase()}
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <HashDisplay value={note.commitment} />
        <span className="text-xs text-[#9ca3af]">
          {formatDiscoveredDate(note.discoveredAt)}
        </span>
      </div>
    </article>
  );
}
