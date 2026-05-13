"use client";

import {useEffect, useMemo} from "react";
import {shieldedScanDebug, shieldedScanDebugEnabled} from "@/lib/shielded-scan-debug";
import {notesForPoolChain} from "@/lib/utils";
import {useShieldedStore} from "@/store/use-shielded-store";

/**
 * Same note derivation as Transfer / Inbox / Unshield: raw store notes scoped to the active pool network.
 * Logs when `NEXT_PUBLIC_SHIELDED_SCAN_DEBUG` or localStorage flag is on (see shielded-scan-debug).
 */
export function usePoolScopedNotes() {
  const notesRaw = useShieldedStore((s) => s.notes);
  const shieldedRpcChainId = useShieldedStore((s) => s.shieldedRpcChainId);
  const notes = useMemo(() => notesForPoolChain(notesRaw, shieldedRpcChainId), [notesRaw, shieldedRpcChainId]);

  useEffect(() => {
    if (!shieldedScanDebugEnabled()) return;
    const missing = notesRaw.filter((n) => n.shieldedChainId == null).length;
    shieldedScanDebug("ui:poolScopedNotes", {
      chainId: shieldedRpcChainId,
      rawCount: notesRaw.length,
      scopedCount: notes.length,
      droppedMissingShieldedChainId: missing,
      sampleRaw: notesRaw[0]
        ? {token: notesRaw[0].token, shieldedChainId: notesRaw[0].shieldedChainId ?? "(missing)"}
        : null,
      sampleScoped: notes[0]
        ? {token: notes[0].token, amount: notes[0].amount, shieldedChainId: notes[0].shieldedChainId}
        : null,
    });
  }, [notesRaw, notes, shieldedRpcChainId]);

  return {notes, notesRaw, shieldedRpcChainId};
}
