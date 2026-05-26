import {ethers} from "ethers";
import {CHAIN_ID_ARBITRUM_SEPOLIA, CHAIN_ID_BASE_SEPOLIA, type ShieldedNetwork} from "./networks";
import {runAlchemyJsonRpcSerialized} from "./premium-rpc-queue";

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

function reorderPremiumRpcsLast(urls: string[]): string[] {
  const premium = /\.g\.alchemy\.com\b|\.infura\.io\b|\.quicknode\.pro\b/i;
  const head: string[] = [];
  const tail: string[] = [];
  for (const u of urls) {
    if (premium.test(u)) tail.push(u);
    else head.push(u);
  }
  return [...head, ...tail];
}

/** Same ordering as `apps/web/lib/rpc-read.ts` (PublicNode before Tenderly to reduce HTTP 429 during scans). */
const BASE_SEPOLIA_READ_RPC_FALLBACKS: readonly string[] = [
  "https://sepolia.base.org",
  "https://base-sepolia-rpc.publicnode.com",
  "https://base-sepolia.gateway.tenderly.co",
];

const ARBITRUM_SEPOLIA_READ_RPC_FALLBACKS: readonly string[] = [
  "https://sepolia-rollup.arbitrum.io/rpc",
  "https://arbitrum-sepolia-rpc.publicnode.com",
  "https://arbitrum-sepolia.gateway.tenderly.co",
];

/** Ordered JSON-RPC URLs for extension-side reads (balances, poseidon, scans). Sends still use the wallet JsonRpcProvider. */
export function getReadRpcUrlCandidates(net: ShieldedNetwork): string[] {
  let listEnv: string | undefined;
  let fallbacks: readonly string[];
  if (net.id === CHAIN_ID_BASE_SEPOLIA) {
    listEnv = env("VITE_BASE_SEPOLIA_RPC_URLS");
    fallbacks = BASE_SEPOLIA_READ_RPC_FALLBACKS;
  } else if (net.id === CHAIN_ID_ARBITRUM_SEPOLIA) {
    listEnv = env("VITE_ARBITRUM_SEPOLIA_RPC_URLS");
    fallbacks = ARBITRUM_SEPOLIA_READ_RPC_FALLBACKS;
  } else {
    listEnv = env("VITE_ETH_SEPOLIA_RPC_URLS");
    fallbacks = [
      net.rpcUrl,
      "https://rpc.sepolia.org",
      "https://ethereum-sepolia.blockpi.network/v1/rpc/public",
      "https://ethereum-sepolia-rpc.publicnode.com",
    ];
  }
  const fromEnv = (listEnv || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (net.id === CHAIN_ID_BASE_SEPOLIA || net.id === CHAIN_ID_ARBITRUM_SEPOLIA) {
    return reorderPremiumRpcsLast(dedupeUrls([...fromEnv, ...fallbacks, net.rpcUrl]));
  }
  return dedupeUrls([...fromEnv, ...fallbacks]);
}

function errorBody(e: unknown): string {
  if (e instanceof Error) return `${e.message} ${"shortMessage" in e ? String((e as Error & {shortMessage?: string}).shortMessage ?? "") : ""}`;
  return String(e ?? "");
}

/** True when another JSON-RPC URL might succeed (rate limits, overloaded public nodes). */
export function isTransientRpcError(e: unknown): boolean {
  const body = errorBody(e).toLowerCase();
  if (
    /-32002|too many errors|rate limit|over rate|retry in|temporarily unavailable|503|502|504|429|timeout|econnreset|etimedout|bad gateway|could not coalesce/.test(
      body
    )
  ) {
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

/** Same strategy as `apps/web/lib/rpc-read.ts`: probe URLs until reads succeed on the expected chain. */
export async function getWorkingReadProvider(net: ShieldedNetwork): Promise<ethers.JsonRpcProvider> {
  const urls = getReadRpcUrlCandidates(net);
  let last: unknown;
  for (const url of urls) {
    try {
      return await runAlchemyJsonRpcSerialized(url, async () => {
        const provider = new ethers.JsonRpcProvider(url, net.id);
        await provider.getBlockNumber();
        const nw = await provider.getNetwork();
        if (Number(nw.chainId) !== net.id) {
          throw new Error(`RPC ${url} reports chainId ${nw.chainId}, expected ${net.id}`);
        }
        const poseidonAddr = net.contracts.poseidon;
        if (poseidonAddr && poseidonAddr !== ethers.ZeroAddress) {
          const code = await provider.getCode(poseidonAddr);
          if (!code || code === "0x") {
            throw new Error(`no contract code at Poseidon ${poseidonAddr} via ${url}`);
          }
        }
        return provider;
      });
    } catch (e) {
      last = e;
    }
  }
  if (last instanceof Error) throw last;
  throw new Error(last ? String(last) : "No RPC URL available for this network.");
}
