/**
 * Deploy four MockERC20 instances (USDC, USDT, DAI, LINK metadata) and mint
 * the same human-readable amount to every recipient in one run.
 *
 * Requires `forge build` in packages/contracts (artifacts under out/).
 *
 * Env:
 *   TESTNET_RPC_URL or RPC_URL     — JSON-RPC endpoint (required unless in .env)
 *                                     Auto-loaded from repo-root .env.sepolia then .env if unset
 *   PRIVATE_KEY                     — deployer / minter (required)
 *   TESTNET_CHAIN_ID                — optional; inferred from RPC if omitted
 *   TESTNET_NAME                    — label for deployment JSON (default: chain-<id>)
 *   BLOCK_EXPLORER_BASE_URL         — optional explorer prefix for logs
 *   MINT_RECIPIENTS                 — comma-separated 0x addresses (optional if fallback below applies)
 *   DEFAULT_MINT_RECIPIENTS         — used when MINT_RECIPIENTS is empty (e.g. stable list in .env.sepolia)
 *                                     Mint-only: if still empty, uses deployment JSON lastMintRecipients when present
 *   MINT_AMOUNT_HUMAN               — whole-token amount per recipient per asset (default: 10000)
 *   SKIP_MINT                       — if true/1, deploy only
 *   MINT_ONLY                       — if true/1, skip deploy; load token addresses from DEPLOYMENT_JSON and mint only
 *   DEPLOYMENT_JSON                 — read/write path (default: scripts/mock-erc20-batch-deployment.json)
 *   ETHERSCAN_API_KEY              — after deploy, runs `forge verify-contract` for each MockERC20 (deploy path only)
 *   VERIFY_CONTRACTS=0 / SKIP_VERIFY=1 — skip verification even if ETHERSCAN_API_KEY is set
 */
import {execFileSync} from "node:child_process";
import {existsSync, readFileSync, writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

import {ethers} from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const contractsDir = path.join(root, "packages", "contracts");

/** Repo-root dotenv-style files; shell/env wins — only fills missing keys */
function mergeOptionalEnvFiles(paths) {
  for (const envPath of paths) {
    if (!existsSync(envPath)) continue;
    const text = readFileSync(envPath, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined || process.env[key] === "") {
        process.env[key] = val;
      }
    }
  }
}

mergeOptionalEnvFiles([path.join(root, ".env.sepolia"), path.join(root, ".env")]);

const RPC_URL = process.env.TESTNET_RPC_URL || process.env.RPC_URL || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const TESTNET_CHAIN_ID_ENV = process.env.TESTNET_CHAIN_ID;
const TESTNET_NAME = process.env.TESTNET_NAME || "";
const BLOCK_EXPLORER_BASE_URL = (process.env.BLOCK_EXPLORER_BASE_URL || "").replace(/\/$/, "");
const MINT_RECIPIENTS_RAW = process.env.MINT_RECIPIENTS || "";
const MINT_AMOUNT_HUMAN = process.env.MINT_AMOUNT_HUMAN || "10000";
const SKIP_MINT =
  String(process.env.SKIP_MINT || "").toLowerCase() === "true" || process.env.SKIP_MINT === "1";
const MINT_ONLY =
  String(process.env.MINT_ONLY || "").toLowerCase() === "true" || process.env.MINT_ONLY === "1";
const DEPLOYMENT_JSON =
  process.env.DEPLOYMENT_JSON || path.join(__dirname, "mock-erc20-batch-deployment.json");
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const VERIFY_DISABLED =
  String(process.env.VERIFY_CONTRACTS || "").toLowerCase() === "false" ||
  process.env.VERIFY_CONTRACTS === "0" ||
  String(process.env.SKIP_VERIFY || "").toLowerCase() === "true" ||
  process.env.SKIP_VERIFY === "1";
/** Deploy path: verify on explorer when API key present unless explicitly skipped */
const SHOULD_VERIFY_AFTER_DEPLOY = !VERIFY_DISABLED && ETHERSCAN_API_KEY.length > 0;

/** Named mocks with realistic decimals for local/testnets */
const TOKEN_SPECS = [
  {key: "USDC", name: "USD Coin", symbol: "USDC", decimals: 6},
  {key: "USDT", name: "Tether USD", symbol: "USDT", decimals: 6},
  {key: "DAI", name: "Dai Stablecoin", symbol: "DAI", decimals: 18},
  {key: "LINK", name: "ChainLink Token", symbol: "LINK", decimals: 18},
];

const ERC20_ABI = [
  "function mint(address to, uint256 amount) external",
  "function balanceOf(address account) external view returns (uint256)",
  "function symbol() external view returns (string)",
];

function loadForgeArtifact(relPath) {
  const p = path.join(contractsDir, "out", relPath);
  if (!existsSync(p)) {
    throw new Error(`Missing forge artifact ${p}. Run: npm run build:contracts`);
  }
  return JSON.parse(readFileSync(p, "utf8"));
}

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, {cwd, stdio: "inherit"});
}

function encodeConstructorArgs(types, values) {
  return ethers.AbiCoder.defaultAbiCoder().encode(types, values);
}

function verifyAllMockTokensOnExplorer(chainId, deployed) {
  console.log("== Verifying MockERC20 contracts on explorer (forge verify-contract) ==");
  for (const t of deployed) {
    const args = [
      "verify-contract",
      "--chain-id",
      String(chainId),
      "--etherscan-api-key",
      ETHERSCAN_API_KEY,
      "--watch",
      t.address,
      "src/MockERC20.sol:MockERC20",
      "--constructor-args",
      encodeConstructorArgs(["string", "string", "uint8"], [t.name, t.symbol, t.decimals]),
    ];
    try {
      run("forge", args, contractsDir);
      console.log(`Verified ${t.symbol} at ${t.address}`);
    } catch (err) {
      console.warn(
        `Verification failed for ${t.symbol} (${t.address}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

function parseRecipients(raw) {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((addr) => ethers.getAddress(addr));
}

function explorerAddr(addr) {
  if (!BLOCK_EXPLORER_BASE_URL || !addr) return addr;
  return `${BLOCK_EXPLORER_BASE_URL}/address/${addr}`;
}

function loadDeploymentTokens(deploymentPath) {
  if (!existsSync(deploymentPath)) {
    throw new Error(`MINT_ONLY requires existing ${deploymentPath} from a prior deploy.`);
  }
  const raw = JSON.parse(readFileSync(deploymentPath, "utf8"));
  const tokens = raw.tokens;
  if (!Array.isArray(tokens) || tokens.length === 0) {
    throw new Error(`${deploymentPath} has no tokens[]; run without MINT_ONLY first.`);
  }
  return {existing: raw, tokens};
}

async function mintHumanAmountToRecipients({signer, provider, deployed, recipients, mintAmountHuman}) {
  console.log(
    `== Minting ${mintAmountHuman} tokens (per asset decimals) to ${recipients.length} recipient(s) in parallel sends ==`
  );

  const snapshot = new Map();
  for (const t of deployed) {
    const ro = new ethers.Contract(t.address, ERC20_ABI, provider);
    const amount = ethers.parseUnits(mintAmountHuman, t.decimals);
    for (const recipient of recipients) {
      const key = `${t.address.toLowerCase()}:${recipient.toLowerCase()}`;
      snapshot.set(key, {prev: await ro.balanceOf(recipient), amount});
    }
  }

  const jobs = [];
  for (const t of deployed) {
    const amount = ethers.parseUnits(mintAmountHuman, t.decimals);
    const contract = new ethers.Contract(t.address, ERC20_ABI, signer);
    for (const recipient of recipients) {
      jobs.push(
        (async () => {
          const tx = await contract.mint(recipient, amount);
          await tx.wait();
        })()
      );
    }
  }
  await Promise.all(jobs);
  console.log("Mint transactions confirmed.");

  for (const t of deployed) {
    const ro = new ethers.Contract(t.address, ERC20_ABI, provider);
    for (const recipient of recipients) {
      const key = `${t.address.toLowerCase()}:${recipient.toLowerCase()}`;
      const {prev, amount} = snapshot.get(key);
      const after = await ro.balanceOf(recipient);
      const expected = prev + amount;
      if (after !== expected) {
        console.warn(`Unexpected balance for ${t.symbol} ${recipient}: got ${after}, expected ${expected} (was ${prev})`);
      }
    }
  }
  console.log("Balance checks OK.");
}

async function main() {
  if (MINT_ONLY && SKIP_MINT) {
    throw new Error("Choose one of MINT_ONLY or SKIP_MINT, not both.");
  }

  if (!RPC_URL) {
    throw new Error(
      "Set TESTNET_RPC_URL or RPC_URL (e.g. in repo-root .env.sepolia), or run: node --env-file=.env.sepolia scripts/deploy-mock-erc20-batch.mjs"
    );
  }
  if (!PRIVATE_KEY) {
    throw new Error("Set PRIVATE_KEY");
  }

  const pk = PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`;
  let chainId = TESTNET_CHAIN_ID_ENV ? Number(TESTNET_CHAIN_ID_ENV) : undefined;
  const provider = chainId !== undefined ? new ethers.JsonRpcProvider(RPC_URL, chainId) : new ethers.JsonRpcProvider(RPC_URL);
  const net = await provider.getNetwork();
  if (chainId === undefined) {
    chainId = Number(net.chainId);
  } else if (Number(net.chainId) !== chainId) {
    console.warn(`Warning: RPC reports chainId ${net.chainId}, env TESTNET_CHAIN_ID is ${chainId}`);
  }

  const label = TESTNET_NAME || `chain-${chainId}`;
  const modeLabel = MINT_ONLY ? "mint-only (existing contracts)" : "deploy, verify, optional mint";
  console.log(`== Mock ERC20 batch — ${modeLabel} (${label}, chainId ${chainId}) ==`);
  console.log(`RPC: ${RPC_URL}`);

  const baseSigner = new ethers.Wallet(pk, provider);
  const signer = new ethers.NonceManager(baseSigner);
  const deployer = await signer.getAddress();
  const bal = await provider.getBalance(deployer);
  console.log(`Signer: ${deployer}`);
  console.log(`Balance: ${ethers.formatEther(bal)} ETH`);
  if (bal === 0n) throw new Error("Signer has zero native balance");

  let existingRecord = null;
  /** @type {{ key: string, name: string, symbol: string, decimals: number, address: string }[]} */
  let deployed = [];

  if (MINT_ONLY) {
    const loaded = loadDeploymentTokens(DEPLOYMENT_JSON);
    existingRecord = loaded.existing;
    if (existingRecord.chainId !== undefined && Number(existingRecord.chainId) !== chainId) {
      console.warn(
        `Warning: deployment JSON chainId ${existingRecord.chainId} differs from current ${chainId}; wrong network?`
      );
    }
    deployed = loaded.tokens.map((t) => ({
      key: t.key,
      name: t.name,
      symbol: t.symbol,
      decimals: Number(t.decimals),
      address: ethers.getAddress(t.address),
    }));
    console.log(`Loaded ${deployed.length} token address(es) from ${DEPLOYMENT_JSON}`);
    for (const t of deployed) {
      console.log(`  ${t.symbol}: ${t.address}`);
    }
  } else {
    const artifact = loadForgeArtifact("MockERC20.sol/MockERC20.json");
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, signer);

    for (const spec of TOKEN_SPECS) {
      console.log(`Deploying ${spec.symbol} (${spec.name}, ${spec.decimals} decimals)...`);
      const c = await factory.deploy(spec.name, spec.symbol, spec.decimals);
      await c.waitForDeployment();
      const address = await c.getAddress();
      console.log(`  ${spec.symbol}: ${address}${BLOCK_EXPLORER_BASE_URL ? ` (${explorerAddr(address)})` : ""}`);
      deployed.push({...spec, address});
    }

    if (SHOULD_VERIFY_AFTER_DEPLOY) {
      verifyAllMockTokensOnExplorer(chainId, deployed);
    } else if (!VERIFY_DISABLED && ETHERSCAN_API_KEY.length === 0) {
      console.warn("ETHERSCAN_API_KEY not set — skipping contract verification. Add it to .env.sepolia to verify on deploy.");
    }
  }

  let recipients = [];
  if (!SKIP_MINT) {
    recipients = parseRecipients(MINT_RECIPIENTS_RAW);
    const defaultRaw = process.env.DEFAULT_MINT_RECIPIENTS || "";
    if (recipients.length === 0 && defaultRaw) {
      recipients = parseRecipients(defaultRaw);
      console.log("Using DEFAULT_MINT_RECIPIENTS (MINT_RECIPIENTS was empty).");
    }
    if (
      recipients.length === 0 &&
      MINT_ONLY &&
      existingRecord &&
      Array.isArray(existingRecord.lastMintRecipients) &&
      existingRecord.lastMintRecipients.length > 0
    ) {
      recipients = existingRecord.lastMintRecipients.map((addr) => ethers.getAddress(addr));
      console.log(`Using ${recipients.length} address(es) from deployment JSON lastMintRecipients.`);
    }
    if (recipients.length === 0) {
      console.log(
        "No mint recipients — set MINT_RECIPIENTS or DEFAULT_MINT_RECIPIENTS (e.g. in .env.sepolia), or mint once so lastMintRecipients is saved."
      );
    }
  } else {
    console.log("SKIP_MINT set — skipping mint.");
  }

  if (!SKIP_MINT && recipients.length > 0) {
    await mintHumanAmountToRecipients({
      signer,
      provider,
      deployed,
      recipients,
      mintAmountHuman: MINT_AMOUNT_HUMAN,
    });
  }

  const now = new Date().toISOString();
  let record;
  if (MINT_ONLY && existingRecord) {
    record = {...existingRecord};
    if (!SKIP_MINT && recipients.length > 0) {
      record.lastMintAt = now;
      record.lastMintAmountHuman = MINT_AMOUNT_HUMAN;
      record.lastMintRecipients = recipients.map((a) => a);
      record.lastMintSigner = deployer;
    }
  } else {
    record = {
      network: label,
      chainId,
      rpcUrl: RPC_URL,
      blockExplorer: BLOCK_EXPLORER_BASE_URL || undefined,
      deployer,
      mintAmountHuman: MINT_AMOUNT_HUMAN,
      recipients,
      tokens: deployed.map(({key, name, symbol, decimals, address}) => ({
        key,
        name,
        symbol,
        decimals,
        address,
      })),
      deployedAt: now,
    };
  }
  writeFileSync(DEPLOYMENT_JSON, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  console.log(`Wrote ${DEPLOYMENT_JSON}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
