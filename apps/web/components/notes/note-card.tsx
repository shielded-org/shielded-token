import {HashDisplay} from "@/components/ui/hash-display";
import {formatAmount} from "@/lib/utils";
import {cn} from "@/lib/utils";
import type {Note} from "@/lib/types";

export function NoteCard({note, selectable = false, selected = false}: {
  note: Note;
  selectable?: boolean;
  selected?: boolean;
}) {
  return (
    <article
      className={cn(
        "interactive-lift rounded-[26px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.024),rgba(255,255,255,0.01))] p-4 transition",
        selected
          ? "border-[#00ff7f]/40 shadow-[0_0_0_1px_rgba(0,255,127,0.12),0_20px_50px_rgba(0,0,0,0.28)]"
          : "border-white/8",
        selectable && "hover:border-[#00ff7f]/35"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[#666666]">{note.token}</p>
          <p className="mt-1 font-mono text-xl text-[#f2f2f2]">
            {formatAmount(note.amount)}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-1 text-[10px] font-semibold tracking-[0.18em]",
            note.status === "unspent"
              ? "border-[#00ff7f]/25 bg-[#00ff7f]/10 text-[#00ff7f]"
              : "border-[#2d2d2d] bg-[#181818] text-[#777777]"
          )}
        >
          {note.status.toUpperCase()}
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <HashDisplay value={note.commitment} />
        <span className="text-xs text-[#666666]">
          {new Date(note.discoveredAt).toLocaleDateString()}
        </span>
      </div>
    </article>
  );
}
