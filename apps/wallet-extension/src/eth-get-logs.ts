import {ethers} from "ethers";

/** Alchemy free tier and some gateways cap inclusive `eth_getLogs` span (to − from + 1). */
export const ALCHEMY_FREE_MAX_LOG_BLOCK_SPAN = 10;

/** Arbitrum Sepolia public RPCs (rollup + PublicNode) accept ~50k-block log windows. */
export const ARBITRUM_SEPOLIA_PUBLIC_LOG_CHUNK = 50_000;

/** Base Sepolia public RPCs typically cap near ~2k blocks (-32602). */
export const BASE_SEPOLIA_PUBLIC_LOG_CHUNK = 2000;

const DEFAULT_LOG_CHUNK_SIZES_DESC = [50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500] as const;

export function isAlchemyRpcUrl(url: string): boolean {
  return /\.g\.alchemy\.com\b/i.test(url);
}

export function parseRpcMaxLogBlockSpan(error: unknown): number | null {
  const body =
    error instanceof Error
      ? `${error.message} ${"shortMessage" in error ? String((error as Error & {shortMessage?: string}).shortMessage ?? "") : ""}`
      : String(error ?? "");
  const m =
    body.match(/up to a (\d+) block range/i) ??
    body.match(/(\d+) block range/i) ??
    body.match(/block range.*?(\d+)\s*block/i);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

export function isLogBlockRangeRpcError(error: unknown): boolean {
  const body = String(error instanceof Error ? error.message : error).toLowerCase();
  return (
    parseRpcMaxLogBlockSpan(error) != null ||
    /block range|query returned more than|maximum.*block|eth_getlogs/i.test(body)
  );
}

export function buildLogChunkTrySizes(explicitMax?: number): number[] {
  if (explicitMax == null || !Number.isFinite(explicitMax) || explicitMax < 1) {
    return [...new Set(DEFAULT_LOG_CHUNK_SIZES_DESC)].sort((a, b) => b - a);
  }
  const cap = Math.min(Math.floor(explicitMax), 500_000);
  const out: number[] = [];
  let c = cap;
  while (c >= 1) {
    if (!out.includes(c)) out.push(c);
    c = c <= 1 ? 0 : Math.max(1, Math.floor(c / 2));
  }
  return out;
}

export function recommendedLogChunkSizeForRpc(
  netChainId: number,
  rpcUrl: string,
  l2ChainIds: readonly number[]
): number | undefined {
  const isL2 = l2ChainIds.includes(netChainId);
  if (!isL2) return undefined;
  if (isAlchemyRpcUrl(rpcUrl)) return ALCHEMY_FREE_MAX_LOG_BLOCK_SPAN;
  if (netChainId === 421614) return ARBITRUM_SEPOLIA_PUBLIC_LOG_CHUNK;
  return BASE_SEPOLIA_PUBLIC_LOG_CHUNK;
}

export async function ethGetLogsRange(
  provider: ethers.JsonRpcProvider,
  address: `0x${string}`,
  topics: (string | string[] | null)[],
  fromBlock: number,
  toBlock: number
): Promise<ethers.Log[]> {
  if (fromBlock > toBlock) return [];
  try {
    return await provider.getLogs({address, fromBlock, toBlock, topics});
  } catch (e) {
    if (fromBlock === toBlock) throw e;
    const limit = parseRpcMaxLogBlockSpan(e);
    if (limit != null && toBlock - fromBlock + 1 > limit) {
      const end = Math.min(fromBlock + limit - 1, toBlock);
      const head = await ethGetLogsRange(provider, address, topics, fromBlock, end);
      const tail = end < toBlock ? await ethGetLogsRange(provider, address, topics, end + 1, toBlock) : [];
      return [...head, ...tail];
    }
    const mid = Math.floor((fromBlock + toBlock) / 2);
    const left = await ethGetLogsRange(provider, address, topics, fromBlock, mid);
    const right = await ethGetLogsRange(provider, address, topics, mid + 1, toBlock);
    return [...left, ...right];
  }
}

export async function getLogsChunked(params: {
  provider: ethers.JsonRpcProvider;
  address: `0x${string}`;
  fromBlock: number;
  toBlock: number;
  topics: (string | string[] | null)[];
  chunkSize?: number;
}): Promise<ethers.Log[]> {
  let adaptiveMax = params.chunkSize;
  const out: ethers.Log[] = [];
  let start = params.fromBlock;
  while (start <= params.toBlock) {
    const trySizes = buildLogChunkTrySizes(adaptiveMax);
    let stepped = false;
    for (const chunkSize of trySizes) {
      const end = Math.min(start + chunkSize - 1, params.toBlock);
      try {
        const part = await params.provider.getLogs({
          address: params.address,
          fromBlock: start,
          toBlock: end,
          topics: params.topics,
        });
        out.push(...part);
        start = end + 1;
        stepped = true;
        break;
      } catch (e) {
        const limit = parseRpcMaxLogBlockSpan(e);
        if (limit != null && (adaptiveMax == null || limit < adaptiveMax)) {
          adaptiveMax = limit;
        }
      }
    }
    if (!stepped) {
      const fallbackSpan = Math.min(adaptiveMax ?? 500, params.toBlock - start + 1);
      const end = Math.min(start + fallbackSpan - 1, params.toBlock);
      const part = await ethGetLogsRange(params.provider, params.address, params.topics, start, end);
      out.push(...part);
      start = end + 1;
    }
  }
  return out;
}
