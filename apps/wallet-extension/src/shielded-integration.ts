import {ethers} from "ethers";
import {
  CHAIN_ID_ARBITRUM_SEPOLIA,
  CHAIN_ID_BASE_SEPOLIA,
  type ShieldedChainId,
  type ShieldedNetwork,
} from "./networks";
import {recommendedLogChunkSizeForRpc} from "./eth-get-logs";
import {getReadRpcUrlCandidates} from "./rpc-read";
import {runAlchemyJsonRpcSerialized} from "./premium-rpc-queue";
import {scanShieldedNotes, type DecryptedNote} from "./shielded";

const L2_CHAIN_IDS = [CHAIN_ID_BASE_SEPOLIA, CHAIN_ID_ARBITRUM_SEPOLIA] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function logChunkSizeForRpc(net: ShieldedNetwork, rpcUrl: string): number | undefined {
  return recommendedLogChunkSizeForRpc(net.id, rpcUrl, L2_CHAIN_IDS);
}

function rpcLabel(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 48);
  }
}

/**
 * Run `eth_getLogs` note scan across read RPC candidates (parity with `apps/web/lib/shielded-integration.ts`).
 */
export async function scanShieldedNotesWithRpcFallback(
  net: ShieldedNetwork,
  scanArgs: {
    poolAddress: `0x${string}`;
    fromBlock: number;
    viewingPriv: bigint;
    viewingPub: `0x${string}`;
  }
) {
  const urls = getReadRpcUrlCandidates(net);
  const mergeMultiRpc = net.id === CHAIN_ID_BASE_SEPOLIA || net.id === CHAIN_ID_ARBITRUM_SEPOLIA;

  if (!mergeMultiRpc) {
    let lastErr: unknown;
    for (const url of urls) {
      try {
        return await runAlchemyJsonRpcSerialized(url, async () => {
          const provider = new ethers.JsonRpcProvider(url, net.id);
          await provider.getBlockNumber();
          return scanShieldedNotes({
            provider,
            ...scanArgs,
            logChunkSize: logChunkSizeForRpc(net, url),
            debugRpcLabel: rpcLabel(url),
          });
        });
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr instanceof Error) throw lastErr;
    throw new Error(lastErr ? String(lastErr) : "No RPC could complete shielded note scan (eth_getLogs).");
  }

  let lastErr: unknown;
  const merged = new Map<string, DecryptedNote>();
  let minLatestBlock = Number.POSITIVE_INFINITY;
  let maxTotalLogs = 0;
  let channel: `0x${string}` = ethers.ZeroHash as `0x${string}`;
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]!;
    if (i > 0) await sleep(90);
    try {
      const res = await runAlchemyJsonRpcSerialized(url, async () => {
        const provider = new ethers.JsonRpcProvider(url, net.id);
        await provider.getBlockNumber();
        return scanShieldedNotes({
          provider,
          ...scanArgs,
          logChunkSize: logChunkSizeForRpc(net, url),
          debugRpcLabel: rpcLabel(url),
        });
      });
      minLatestBlock = Math.min(minLatestBlock, res.stats.latestBlock);
      maxTotalLogs = Math.max(maxTotalLogs, res.stats.totalLogs);
      channel = res.stats.channel;
      for (const n of res.notes) {
        merged.set(`${n.commitment}:${n.txHash}`, n);
      }
      const fullDecrypt = res.stats.totalLogs > 0 && res.stats.decryptSuccess === res.stats.totalLogs;
      if (fullDecrypt || res.notes.length > 0) break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!Number.isFinite(minLatestBlock)) {
    if (lastErr instanceof Error) throw lastErr;
    throw new Error(lastErr ? String(lastErr) : "No RPC could complete shielded note scan (eth_getLogs).");
  }
  const notes = Array.from(merged.values());
  return {
    notes,
    stats: {
      channel,
      latestBlock: minLatestBlock,
      totalLogs: maxTotalLogs,
      decryptSuccess: notes.length,
    },
  };
}
