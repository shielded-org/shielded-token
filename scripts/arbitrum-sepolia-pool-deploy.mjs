#!/usr/bin/env node
/**
 * Deploy the shielded ERC20 pool stack to Arbitrum Sepolia (same flow as scripts/sepolia-erc20-pool-e2e.mjs).
 *
 * Typical usage (from repo root):
 *   node --env-file=.env.arbitrum-sepolia scripts/arbitrum-sepolia-pool-deploy.mjs
 *
 * Expected env (override as needed):
 *   TESTNET_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
 *   TESTNET_CHAIN_ID=421614
 *   TESTNET_NAME=arbitrum-sepolia
 *   BLOCK_EXPLORER_BASE_URL=https://sepolia.arbiscan.io
 *   PRIVATE_KEY=0x...   (same deployer / relayer keys as other testnets)
 *   DEPLOY_MOCK_TOKEN=1   OR   TESTNET_POOL_TOKEN_ADDRESS=0x...
 *
 * Output JSON defaults to scripts/arbitrum-sepolia-pool-deployment.json (override with POOL_DEPLOYMENT_JSON).
 *
 * Relayer: set RELAYER_RPC_URL_ARBITRUM_SEPOLIA alongside RELAYER_RPC_URL_ETH_SEPOLIA / RELAYER_RPC_URL_BASE_SEPOLIA.
 */
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const e2eScript = path.join(__dirname, "sepolia-erc20-pool-e2e.mjs");

if (!process.env.POOL_DEPLOYMENT_JSON) {
  process.env.POOL_DEPLOYMENT_JSON = path.join(__dirname, "arbitrum-sepolia-pool-deployment.json");
}
if (!process.env.TESTNET_RPC_URL) {
  process.env.TESTNET_RPC_URL = "https://sepolia-rollup.arbitrum.io/rpc";
}
if (!process.env.TESTNET_CHAIN_ID) {
  process.env.TESTNET_CHAIN_ID = "421614";
}
if (!process.env.TESTNET_NAME) {
  process.env.TESTNET_NAME = "arbitrum-sepolia";
}
if (!process.env.BLOCK_EXPLORER_BASE_URL) {
  process.env.BLOCK_EXPLORER_BASE_URL = "https://sepolia.arbiscan.io";
}
if (process.env.POOL_DEPLOY_ONLY === undefined) {
  process.env.POOL_DEPLOY_ONLY = "1";
}

const result = spawnSync(process.execPath, [e2eScript], {
  cwd: root,
  stdio: "inherit",
  env: {...process.env},
});

process.exit(result.status ?? 1);
