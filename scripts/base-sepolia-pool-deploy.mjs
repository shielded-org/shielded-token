#!/usr/bin/env node
/**
 * Deploy the shielded ERC20 pool stack to Base Sepolia (same flow as scripts/sepolia-erc20-pool-e2e.mjs).
 *
 * Prerequisites: Node 20+, forge, nargo, bb — same as Sepolia pool E2E.
 *
 * Typical usage (from repo root):
 *   node --env-file=.env.base-sepolia scripts/base-sepolia-pool-deploy.mjs
 *
 * Expected env (override as needed):
 *   TESTNET_RPC_URL=https://base-sepolia-rpc.publicnode.com
 *   TESTNET_CHAIN_ID=84532
 *   TESTNET_NAME=base-sepolia
 *   BLOCK_EXPLORER_BASE_URL=https://sepolia.basescan.org
 *   PRIVATE_KEY=0x...
 *   DEPLOY_MOCK_TOKEN=1   OR   TESTNET_POOL_TOKEN_ADDRESS=0x...
 *
 * Output JSON defaults to scripts/base-sepolia-pool-deployment.json (override with POOL_DEPLOYMENT_JSON).
 *
 * Relayer (same keys as Sepolia): set in relayer env
 *   RELAYER_RPC_URL_BASE_SEPOLIA=https://base-sepolia-rpc.publicnode.com
 * alongside existing RELAYER_RPC_URL / RELAYER_RPC_URL_ETH_SEPOLIA for Ethereum Sepolia.
 */
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const e2eScript = path.join(__dirname, "sepolia-erc20-pool-e2e.mjs");

if (!process.env.POOL_DEPLOYMENT_JSON) {
  process.env.POOL_DEPLOYMENT_JSON = path.join(__dirname, "base-sepolia-pool-deployment.json");
}
if (!process.env.TESTNET_RPC_URL) {
  process.env.TESTNET_RPC_URL = "https://base-sepolia-rpc.publicnode.com";
}
if (!process.env.TESTNET_CHAIN_ID) {
  process.env.TESTNET_CHAIN_ID = "84532";
}
if (!process.env.TESTNET_NAME) {
  process.env.TESTNET_NAME = "base-sepolia";
}
if (!process.env.BLOCK_EXPLORER_BASE_URL) {
  process.env.BLOCK_EXPLORER_BASE_URL = "https://sepolia.basescan.org";
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
