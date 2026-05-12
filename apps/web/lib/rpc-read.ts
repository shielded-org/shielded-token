import {ethers} from "ethers";
import {CHAIN_ID_BASE_SEPOLIA, type ShieldedNetwork} from "./networks";
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

/** Ordered JSON-RPC URLs for app-side reads (balances, poseidon, scans). Wallet sends still use the wallet's RPC. */
export function getReadRpcUrlCandidates(net: ShieldedNetwork): string[] {
  const listEnv =
    net.id === CHAIN_ID_BASE_SEPOLIA
      ? process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URLS
      : process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URLS;
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
      `Fix: in MetaMask (or your wallet) open Settings → Networks → ${net.label} and set a dedicated RPC URL (e.g. Alchemy, Infura, Ankr, or for Sepolia try https://rpc.sepolia.org).`,
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
