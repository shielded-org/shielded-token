#!/usr/bin/env node
/**
 * Probe Arbitrum Sepolia JSON-RPC endpoints: network chainId, head block, and a small eth_getLogs on the canonical pool.
 *
 * Usage (from repo root):
 *   node scripts/probe-arbitrum-sepolia-rpc.mjs
 *   ARBITRUM_PROBE_URLS="https://a,https://b" node scripts/probe-arbitrum-sepolia-rpc.mjs
 *
 * Reuses the same default mirror list as apps/web/lib/rpc-read.ts (env lists optional).
 */
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { ethers } = require("ethers");

const EXPECT_CHAIN = 421614;
const POOL = process.env.ARBITRUM_PROBE_POOL ?? "0x3AD3c6ffE9323A58bcf4ADF3E091E07eC6570976";

const DEFAULT_URLS = [
  "https://sepolia-rollup.arbitrum.io/rpc",
  "https://arbitrum-sepolia-rpc.publicnode.com",
  "https://arbitrum-sepolia.gateway.tenderly.co",
];

const rawList =
  process.env.ARBITRUM_PROBE_URLS?.trim() ||
  process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URLS?.trim() ||
  DEFAULT_URLS.join(",");

const urls = rawList
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function probe(url) {
  const row = { url, ok: false, chainId: null, block: null, logSample: null, error: null, ms: 0 };
  const t0 = Date.now();
  try {
    const p = new ethers.JsonRpcProvider(url, EXPECT_CHAIN);
    const net = await p.getNetwork();
    row.chainId = Number(net.chainId);
    row.block = await p.getBlockNumber();
    const from = Math.max(1, row.block - 500);
    const to = Math.min(row.block, from + 200);
    const logs = await p.getLogs({
      address: POOL,
      fromBlock: from,
      toBlock: to,
    });
    row.logSample = logs.length;
    row.ok = row.chainId === EXPECT_CHAIN;
  } catch (e) {
    row.error = e instanceof Error ? e.message : String(e);
  }
  row.ms = Date.now() - t0;
  return row;
}

console.log(`Arbitrum Sepolia RPC probe (expect chainId ${EXPECT_CHAIN}, pool ${POOL})`);
for (const url of urls) {
  process.stdout.write(`${url} … `);
  const r = await probe(url);
  console.log(
    r.ok
      ? `OK chain=${r.chainId} head=${r.block} logsWindow=${r.logSample} (${r.ms}ms)`
      : `FAIL chain=${r.chainId} head=${r.block} err=${r.error ?? "chainId mismatch"} (${r.ms}ms)`
  );
}
