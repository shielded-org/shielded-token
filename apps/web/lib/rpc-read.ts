import {ethers} from "ethers";
import {CHAIN_ID_ARBITRUM_SEPOLIA, CHAIN_ID_BASE_SEPOLIA, type ShieldedNetwork} from "./networks";
import {runAlchemyJsonRpcSerialized} from "./premium-rpc-queue";
import {ERC20_ABI} from "./shielded-config";

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

/** Try public mirrors before Alchemy/Infura so `getWorkingReadProvider` and log-merge scans do not burn paid quotas first. */
export function reorderPremiumRpcsLast(urls: string[]): string[] {
  const premium = /\.g\.alchemy\.com\b|\.infura\.io\b|\.quicknode\.pro\b/i;
  const head: string[] = [];
  const tail: string[] = [];
  for (const u of urls) {
    if (premium.test(u)) tail.push(u);
    else head.push(u);
  }
  return [...head, ...tail];
}

/**
 * Curated for `eth_getLogs` + reads; some mirrors return empty logs for the same filter.
 * Premium URLs (Alchemy) are moved last — free tier caps log ranges to ~10 blocks; scans use that window per URL.
 */
const BASE_SEPOLIA_READ_RPC_FALLBACKS: readonly string[] = [
  "https://sepolia.base.org",
  // PublicNode before Tenderly: Tenderly’s public gateway often returns HTTP 429 under scan load.
  "https://base-sepolia-rpc.publicnode.com",
  "https://base-sepolia.gateway.tenderly.co",
];

const ARBITRUM_SEPOLIA_READ_RPC_FALLBACKS: readonly string[] = [
  "https://sepolia-rollup.arbitrum.io/rpc",
  "https://arbitrum-sepolia-rpc.publicnode.com",
  "https://arbitrum-sepolia.gateway.tenderly.co",
];

/** Ordered JSON-RPC URLs for app-side reads (balances, poseidon, scans). Wallet sends still use the wallet's RPC. */
export function getReadRpcUrlCandidates(net: ShieldedNetwork): string[] {
  let listEnv: string | undefined;
  let fallbacks: readonly string[];
  if (net.id === CHAIN_ID_BASE_SEPOLIA) {
    listEnv = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URLS;
    fallbacks = BASE_SEPOLIA_READ_RPC_FALLBACKS;
  } else if (net.id === CHAIN_ID_ARBITRUM_SEPOLIA) {
    listEnv = process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URLS;
    fallbacks = ARBITRUM_SEPOLIA_READ_RPC_FALLBACKS;
  } else {
    listEnv = process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URLS;
    fallbacks = [
      net.rpcUrl,
      "https://rpc.sepolia.org",
      "https://ethereum-sepolia.blockpi.network/v1/rpc/public",
      "https://ethereum-sepolia-rpc.publicnode.com",
    ];
  }
  const fromEnv = (listEnv || "").split(",").map((s) => s.trim()).filter(Boolean);
  // Multi-URL env first; then known-good endpoints; `net.rpcUrl` last so a single `NEXT_PUBLIC_*_RPC_URL`
  // cannot override ahead of curated fallbacks unless it also appears in `*_RPC_URLS`.
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
      // Try every candidate: first URL may be misconfigured or return a non-retryable
      // JSON-RPC error while a later public endpoint still works (matches extension intent).
    }
  }
  if (last instanceof Error) throw last;
  throw new Error(last ? String(last) : "No RPC URL available for this network.");
}

/**
 * Read ERC-20 `balanceOf` on the shielded pool network: `getWorkingReadProvider(net)` then
 * `new Contract(..., ERC20_ABI, provider).balanceOf(holder)` with balance failures treated as `0n`
 * (same pattern as `refreshPublicLedger` in `apps/wallet-extension/src/App.tsx`).
 */
export async function fetchShieldedNetworkErc20BalanceRaw(
  net: ShieldedNetwork,
  holder: `0x${string}`,
  tokenAddress: `0x${string}`
): Promise<bigint> {
  const holderAddr = ethers.getAddress(holder);
  const tokenAddr = ethers.getAddress(tokenAddress);
  const provider = await getWorkingReadProvider(net);
  const token = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
  try {
    return await token.balanceOf(holderAddr);
  } catch {
    return 0n;
  }
}

/** Human text for failed wallet sends and common RPC failures. */
export function formatWalletBroadcastError(e: unknown, net: ShieldedNetwork): string {
  const body = errorBody(e);
  const lower = body.toLowerCase();
  if (/-32002|too many errors|retry in/.test(lower)) {
    return [
      `Your wallet's RPC for ${net.label} rejected the transaction (often rate limits on free public endpoints).`,
      `Fix: in MetaMask (or your wallet) open Settings → Networks → ${net.label} and set a dedicated RPC URL (e.g. Alchemy, Infura, Ankr, or a public endpoint from the chain documentation).`,
      `Note: NEXT_PUBLIC_RPC_URL only affects in-app reads, not the RPC your wallet uses to broadcast deposits.`,
    ].join(" ");
  }
  if (/user rejected|user denied|4001/.test(lower)) {
    return "Transaction was rejected in the wallet.";
  }
  if (/insufficient funds/.test(lower)) {
    return "Insufficient native token for gas on this network.";
  }
  return body.length > 400 ? `${body.slice(0, 400)}…` : body;
}
