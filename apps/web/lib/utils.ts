import type {Note, TransactionRecord} from "./types";

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function shortenHash(value: string, start = 6, end = 4) {
  if (!value) return "-";
  if (value.length <= start + end) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

export function formatAmount(value: string | number, decimals = 6) {
  const numeric = typeof value === "number" ? value : Number(value || 0);
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function createHex(seed: string) {
  const hex = Array.from(seed)
    .map((char) => char.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 64)
    .padEnd(64, "0");
  return `0x${hex}` as `0x${string}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function getTokenTotal(notes: Note[], token: string) {
  return notes
    .filter((note) => note.token === token && note.status === "unspent")
    .reduce((sum, note) => sum + Number(note.amount), 0);
}

export function getShieldedBalance(notes: Note[]) {
  return notes
    .filter((note) => note.status === "unspent")
    .reduce((sum, note) => sum + Number(note.amount), 0);
}

export function sortTransactions(transactions: TransactionRecord[]) {
  return [...transactions].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

export function relativeTime(value: string) {
  const date = new Date(value).getTime();
  const diffSeconds = Math.max(1, Math.floor((Date.now() - date) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

export async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}
