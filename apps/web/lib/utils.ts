import type {Note, TransactionRecord} from "./types";

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function shortenHash(value: string, start = 6, end = 4) {
  if (!value) return "-";
  if (value.length <= start + end) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

export function formatAmount(value: string | number, decimals = 2) {
  const numeric = typeof value === "number" ? value : Number(value || 0);
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Format a number as USD for dashboard demo peg displays */
export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
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

export function isValidHexAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export function isValidViewingKey(value: string) {
  return /^0x[a-fA-F0-9]{16,130}$/.test(value.trim());
}

export function getAmountValidationMessage(value: string, max: number, decimals = 6) {
  const trimmed = value.trim();
  if (!trimmed) return "Enter an amount.";
  if (!/^\d*\.?\d*$/.test(trimmed)) return "Use numbers only.";
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric <= 0) return "Amount must be greater than zero.";
  const parts = trimmed.split(".");
  if (parts[1] && parts[1].length > decimals) {
    return `Use up to ${decimals} decimal places.`;
  }
  if (numeric > max) return "Amount exceeds available balance.";
  return null;
}
