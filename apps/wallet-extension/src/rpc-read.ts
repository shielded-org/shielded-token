import {ethers} from "ethers";
import {CHAIN_ID_BASE_SEPOLIA, type ShieldedNetwork} from "./networks";

function env(key: string): string | undefined {
  const raw = (import.meta as ImportMeta & {env: Record<string, string | undefined>}).env[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const k = u.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(u.trim());
  }
  return out;
}

/** Ordered JSON-RPC URLs for extension-side reads (balances, poseidon, scans). Sends still use the wallet JsonRpcProvider. */
export function getReadRpcUrlCandidates(net: ShieldedNetwork): string[] {
  const listEnv =
    net.id === CHAIN_ID_BASE_SEPOLIA
      ? env("VITE_BASE_SEPOLIA_RPC_URLS")
      : env("VITE_ETH_SEPOLIA_RPC_URLS");
  const fromEnv = (listEnv || "").split(",").map((s) => s.trim()).filter(Boolean);
  const fallbacks =
    net.id === CHAIN_ID_BASE_SEPOLIA
      ? [net.rpcUrl, "https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"]
      : [
          net.rpcUrl,
          "https://rpc.sepolia.org",
          "https://ethereum-sepolia.blockpi.network/v1/rpc/public",
          "https://ethereum-sepolia-rpc.publicnode.com",
        ];
  return dedupeUrls([...fromEnv, ...fallbacks]);
}

function errorBody(e: unknown): string {
  if (e instanceof Error) return `${e.message} ${"shortMessage" in e ? String((e as Error & {shortMessage?: string}).shortMessage ?? "") : ""}`;
  return String(e ?? "");
}

/** True when another JSON-RPC URL might succeed (rate limits, overloaded public nodes). */
export function isTransientRpcError(e: unknown): boolean {
  const body = errorBody(e).toLowerCase();
  if (/-32002|too many errors|rate limit|over rate|retry in|temporarily unavailable|503|502|504|timeout|econnreset|etimedout|bad gateway/.test(body)) {
    return true;
  }
  const code = typeof e === "object" && e && "code" in e ? (e as {code?: string | number}).code : undefined;
  if (code === "UNKNOWN_ERROR" || code === "SERVER_ERROR" || code === "TIMEOUT") return true;
  const nested =
    typeof e === "object" && e && "error" in e
      ? (e as {error?: {code?: number}}).error?.code
      : typeof e === "object" && e && "info" in e
        ? (e as {info?: {error?: {code?: number}}}).info?.error?.code
        : undefined;
  if (nested === -32002) return true;
  return false;
}

/** Same strategy as `apps/web/lib/rpc-read.ts`: probe URLs until `getBlockNumber` succeeds. */
export async function getWorkingReadProvider(net: ShieldedNetwork): Promise<ethers.JsonRpcProvider> {
  const urls = getReadRpcUrlCandidates(net);
  let last: unknown;
  for (const url of urls) {
    try {
      const provider = new ethers.JsonRpcProvider(url, net.id);
      await provider.getBlockNumber();
      return provider;
    } catch (e) {
      last = e;
    }
  }
  if (last instanceof Error) throw last;
  throw new Error(last ? String(last) : "No RPC URL available for this network.");
}
