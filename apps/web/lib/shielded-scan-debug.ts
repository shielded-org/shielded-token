/**
 * Diagnostics (browser console, prefix `[shielded-scan]`):
 *
 * 1. **No restart:** DevTools → Application → Local Storage → set key `zkproject:shieldedScanDebug` = `1`, reload.
 * 2. **Or** `NEXT_PUBLIC_SHIELDED_SCAN_DEBUG=true` in `apps/web/.env.local` (must restart `next dev`; value is inlined at compile time).
 *
 * Includes `deriveShieldedKeysFromWallet` (signature shape only, never the signature text) and
 * `syncNotes:keyConsistency` (wallet vs keyMaterial address, viewingKey↔viewingPub self-check).
 */

function readLocalDebugFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ls = window.localStorage?.getItem("zkproject:shieldedScanDebug");
    return ls === "1" || String(ls).toLowerCase() === "true";
  } catch {
    return false;
  }
}

function enabled(): boolean {
  if (readLocalDebugFlag()) return true;
  const v = process.env.NEXT_PUBLIC_SHIELDED_SCAN_DEBUG;
  return v === "1" || String(v).toLowerCase() === "true";
}

export function shieldedScanDebugEnabled(): boolean {
  return enabled();
}

export function shieldedScanDebug(phase: string, data: Record<string, unknown>): void {
  if (!enabled()) return;
  console.info(`[shielded-scan] ${phase}`, data);
}

/** Safe RPC label for logs (host only; drops path/query). */
export function shieldedScanRpcLabel(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url.length > 64 ? `${url.slice(0, 64)}…` : url;
  }
}
