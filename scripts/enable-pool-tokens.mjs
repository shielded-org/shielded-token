/**
 * Call ShieldedERC20Pool.setTokenEnabled for extra ERC20s (same owner as deployer).
 *
 * Usage:
 *   node --env-file=.env.sepolia scripts/enable-pool-tokens.mjs
 *
 * Env:
 *   TESTNET_RPC_URL, TESTNET_CHAIN_ID, PRIVATE_KEY (same as deploy scripts)
 *   POOL_DEPLOYMENT_JSON — optional override (default: sepolia vs base from TESTNET_CHAIN_ID)
 *   MOCK_TOKENS_JSON — optional override (default: scripts/sepolia-mock-erc20-deployment.json on 11155111,
 *                      scripts/base-sepolia-mock-erc20-deployment.json on 84532,
 *                      scripts/arbitrum-sepolia-mock-erc20-deployment.json on 421614)
 */
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {ethers} from "ethers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const RPC = process.env.TESTNET_RPC_URL || process.env.RPC_URL || "";
const CHAIN_ID = Number(process.env.TESTNET_CHAIN_ID || 0);
const pk = (process.env.PRIVATE_KEY || "").trim();
const defaultPoolJson =
  CHAIN_ID === 84532
    ? "base-sepolia-pool-deployment.json"
    : CHAIN_ID === 421614
      ? "arbitrum-sepolia-pool-deployment.json"
      : CHAIN_ID === 11155111
        ? "sepolia-pool-deployment.json"
        : null;
const defaultMockJson =
  CHAIN_ID === 84532
    ? "base-sepolia-mock-erc20-deployment.json"
    : CHAIN_ID === 421614
      ? "arbitrum-sepolia-mock-erc20-deployment.json"
      : CHAIN_ID === 11155111
        ? "sepolia-mock-erc20-deployment.json"
        : null;
const poolJsonPath =
  process.env.POOL_DEPLOYMENT_JSON ||
  (defaultPoolJson ? path.join(__dirname, defaultPoolJson) : path.join(__dirname, "base-sepolia-pool-deployment.json"));
const mockJsonPath =
  process.env.MOCK_TOKENS_JSON ||
  (defaultMockJson ? path.join(__dirname, defaultMockJson) : path.join(__dirname, "base-sepolia-mock-erc20-deployment.json"));

const POOL_ABI = ["function setTokenEnabled(address token, bool enabled) external"];

async function main() {
  if (!RPC) throw new Error("Set TESTNET_RPC_URL");
  if (!CHAIN_ID) {
    throw new Error(
      "Set TESTNET_CHAIN_ID (11155111 = Ethereum Sepolia, 84532 = Base Sepolia, 421614 = Arbitrum Sepolia)"
    );
  }
  if (!pk) throw new Error("Set PRIVATE_KEY");
  const walletPk = pk.startsWith("0x") ? pk : `0x${pk}`;
  const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID);
  const signer = new ethers.Wallet(walletPk, provider);
  const poolAbs = path.isAbsolute(poolJsonPath) ? poolJsonPath : path.resolve(root, poolJsonPath);
  const mockAbs = path.isAbsolute(mockJsonPath) ? mockJsonPath : path.resolve(root, mockJsonPath);
  const poolDep = JSON.parse(readFileSync(poolAbs, "utf8"));
  const poolAddr = poolDep.pool;
  const primary = poolDep.token?.toLowerCase();
  const mockDep = JSON.parse(readFileSync(mockAbs, "utf8"));
  const pool = new ethers.Contract(poolAddr, POOL_ABI, signer);
  for (const t of mockDep.tokens || []) {
    const addr = t.address;
    if (!addr || typeof addr !== "string") continue;
    if (addr.toLowerCase() === primary) {
      console.log(`skip (pool primary): ${t.symbol} ${addr}`);
      continue;
    }
    console.log(`enabling ${t.symbol} ${addr}...`);
    const tx = await pool.setTokenEnabled(addr, true);
    await tx.wait();
    console.log(`  ok ${tx.hash}`);
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
