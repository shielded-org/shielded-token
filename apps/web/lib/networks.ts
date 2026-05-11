import {ethers} from "ethers";
import type {TokenDefinition} from "./types";

/** Ethereum Sepolia */
export const CHAIN_ID_ETH_SEPOLIA = 11155111;
/** Base Sepolia */
export const CHAIN_ID_BASE_SEPOLIA = 84532;

export type ShieldedChainId = typeof CHAIN_ID_ETH_SEPOLIA | typeof CHAIN_ID_BASE_SEPOLIA;

export type ShieldedContracts = {
  poseidon: `0x${string}`;
  poseidonHasher: `0x${string}`;
  verifier: `0x${string}`;
  merkleTree: `0x${string}`;
  pool: `0x${string}`;
  token: `0x${string}`;
};

export type ShieldedNetwork = {
  id: ShieldedChainId;
  label: string;
  rpcUrl: string;
  explorerBaseUrl: string;
  contracts: ShieldedContracts;
  poolDeployBlock: number;
  defaultPoolTokens: readonly {address: `0x${string}`; symbol: string; decimals: number}[];
};

function addr(key: string, fallback: `0x${string}`): `0x${string}` {
  const v = process.env[key];
  if (v && ethers.isAddress(v)) return ethers.getAddress(v) as `0x${string}`;
  return fallback;
}

function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parsePoolTokensJson(raw: string | undefined): ShieldedNetwork["defaultPoolTokens"] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const address = (row as {address?: string}).address;
        const symbol = (row as {symbol?: string}).symbol;
        const decimals = (row as {decimals?: number}).decimals;
        if (!address || !ethers.isAddress(address) || typeof symbol !== "string" || typeof decimals !== "number") {
          return null;
        }
        return {address: ethers.getAddress(address) as `0x${string}`, symbol, decimals};
      })
      .filter(Boolean) as ShieldedNetwork["defaultPoolTokens"];
  } catch {
    return [];
  }
}

const ETH_SEPOLIA_NETWORK: ShieldedNetwork = {
  id: CHAIN_ID_ETH_SEPOLIA,
  label: "Ethereum Sepolia",
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
  explorerBaseUrl: "https://sepolia.etherscan.io",
  contracts: {
    poseidon: addr("NEXT_PUBLIC_POSEIDON_ADDRESS", "0xa9CC305Af95542673aea1518881B6F1E7A8DE3b8"),
    poseidonHasher: addr("NEXT_PUBLIC_POSEIDON_HASHER_ADDRESS", "0xE6d12EfF9db5FDb548Aa17Ad1587623FFAe3BE96"),
    verifier: addr("NEXT_PUBLIC_VERIFIER_ADDRESS", "0xf45A783A47c68570b9D786a291e934F6A6B70950"),
    merkleTree: addr("NEXT_PUBLIC_MERKLE_TREE_ADDRESS", "0x3C4A041C4145B7FEF8C341Ca10D162A717adcc7A"),
    pool: addr("NEXT_PUBLIC_POOL_ADDRESS", "0xDd10f44Bc04451f0e1B698F5a8422f56d0d05966"),
    token: addr("NEXT_PUBLIC_TOKEN_ADDRESS", "0x9DBEd8AB4A05b5E4b6aF3bf61AA3051F6caa91b4"),
  },
  poolDeployBlock: num("NEXT_PUBLIC_POOL_DEPLOY_BLOCK", 10744004),
  defaultPoolTokens: parsePoolTokensJson(process.env.NEXT_PUBLIC_ETH_SEPOLIA_POOL_TOKENS_JSON).length
    ? parsePoolTokensJson(process.env.NEXT_PUBLIC_ETH_SEPOLIA_POOL_TOKENS_JSON)
    : [
        {address: "0x093856dc11cbEFeBb6c53E112F85E807D44ca9c2" as const, symbol: "USDC", decimals: 6},
        {address: "0x70bdC729406Ee9C547522529f43F48028FCf374A" as const, symbol: "USDT", decimals: 6},
        {address: "0xDc256389b94e511caEe10A75F1FE4246c185c288" as const, symbol: "DAI", decimals: 18},
        {address: "0xFFBeF846263Af332CF34f7AC1F54aD09745c8c05" as const, symbol: "LINK", decimals: 18},
      ],
};

/** When `NEXT_PUBLIC_BASE_SEPOLIA_POOL_ADDRESS` matches this pool, unset contract env vars default to this public deploy. */
const BASE_SEPOLIA_CANONICAL_POOL = "0xA4421d963f0C89FaAF489FfFC0eb662Fc67C030F";

const BASE_SEPOLIA_DEPLOYED = {
  poseidon: "0xEC71805247833595B77eF444D4e9EF95FFFB0fD5",
  poseidonHasher: "0x5056ecfD57e1a5D5b9CE15383cD3655fA434f8be",
  verifier: "0x053a1257e5c69754F772e549A93752963B35D66a",
  merkleTree: "0x3AD3c6ffE9323A58bcf4ADF3E091E07eC6570976",
  token: "0x19DCe2d215C6b7EA1B247460E7FA6A9f7FFc60e8",
  poolDeployBlock: 41373731,
  defaultPoolTokens: [
    {address: "0x120d58806E33b07d1eBd6946d4691b13e259712a", symbol: "USDC", decimals: 6},
    {address: "0x6A3b629F9eB189E194B947CF84d47c60CCc6a1Df", symbol: "USDT", decimals: 6},
    {address: "0x4f57D26465D51d1Bb91Ed44ae85F2245256B7cAa", symbol: "DAI", decimals: 18},
    {address: "0x819EA63eB94992766c935B8C34D00b259cF45BF6", symbol: "LINK", decimals: 18},
  ],
} as const;

const BASE_SEPOLIA_POOL = process.env.NEXT_PUBLIC_BASE_SEPOLIA_POOL_ADDRESS?.trim() ?? "";

function baseSepoliaUsesDeployedContractSet(poolRaw: string): boolean {
  if (!poolRaw || !ethers.isAddress(poolRaw)) return false;
  return ethers.getAddress(poolRaw).toLowerCase() === BASE_SEPOLIA_CANONICAL_POOL.toLowerCase();
}

const baseSepoliaDeployedDefaults = baseSepoliaUsesDeployedContractSet(BASE_SEPOLIA_POOL);
const Z = "0x0000000000000000000000000000000000000000" as `0x${string}`;

const BASE_SEPOLIA_NETWORK: ShieldedNetwork | null =
  BASE_SEPOLIA_POOL && ethers.isAddress(BASE_SEPOLIA_POOL)
    ? {
        id: CHAIN_ID_BASE_SEPOLIA,
        label: "Base Sepolia",
        rpcUrl: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ?? "https://base-sepolia-rpc.publicnode.com",
        explorerBaseUrl: "https://sepolia.basescan.org",
        contracts: {
          poseidon: addr(
            "NEXT_PUBLIC_BASE_SEPOLIA_POSEIDON_ADDRESS",
            baseSepoliaDeployedDefaults ? (BASE_SEPOLIA_DEPLOYED.poseidon as `0x${string}`) : Z
          ),
          poseidonHasher: addr(
            "NEXT_PUBLIC_BASE_SEPOLIA_POSEIDON_HASHER_ADDRESS",
            baseSepoliaDeployedDefaults ? (BASE_SEPOLIA_DEPLOYED.poseidonHasher as `0x${string}`) : Z
          ),
          verifier: addr(
            "NEXT_PUBLIC_BASE_SEPOLIA_VERIFIER_ADDRESS",
            baseSepoliaDeployedDefaults ? (BASE_SEPOLIA_DEPLOYED.verifier as `0x${string}`) : Z
          ),
          merkleTree: addr(
            "NEXT_PUBLIC_BASE_SEPOLIA_MERKLE_TREE_ADDRESS",
            baseSepoliaDeployedDefaults ? (BASE_SEPOLIA_DEPLOYED.merkleTree as `0x${string}`) : Z
          ),
          pool: ethers.getAddress(BASE_SEPOLIA_POOL) as `0x${string}`,
          token: addr(
            "NEXT_PUBLIC_BASE_SEPOLIA_TOKEN_ADDRESS",
            baseSepoliaDeployedDefaults ? (BASE_SEPOLIA_DEPLOYED.token as `0x${string}`) : Z
          ),
        },
        poolDeployBlock: num(
          "NEXT_PUBLIC_BASE_SEPOLIA_POOL_DEPLOY_BLOCK",
          baseSepoliaDeployedDefaults ? BASE_SEPOLIA_DEPLOYED.poolDeployBlock : 0
        ),
        defaultPoolTokens: (() => {
          const parsed = parsePoolTokensJson(process.env.NEXT_PUBLIC_BASE_SEPOLIA_POOL_TOKENS_JSON);
          if (parsed.length) return parsed;
          return baseSepoliaDeployedDefaults
            ? (BASE_SEPOLIA_DEPLOYED.defaultPoolTokens.map((t) => ({
                address: ethers.getAddress(t.address) as `0x${string}`,
                symbol: t.symbol,
                decimals: t.decimals,
              })) as ShieldedNetwork["defaultPoolTokens"])
            : [];
        })(),
      }
    : null;

export function getShieldedNetworks(): ShieldedNetwork[] {
  const out: ShieldedNetwork[] = [ETH_SEPOLIA_NETWORK];
  if (BASE_SEPOLIA_NETWORK && BASE_SEPOLIA_NETWORK.contracts.pool !== ethers.ZeroAddress) {
    const c = BASE_SEPOLIA_NETWORK.contracts;
    const configured =
      c.poseidon !== ethers.ZeroAddress &&
      c.merkleTree !== ethers.ZeroAddress &&
      c.verifier !== ethers.ZeroAddress;
    if (configured) {
      out.push(BASE_SEPOLIA_NETWORK);
    }
  }
  return out;
}

export function getShieldedNetwork(chainId: number): ShieldedNetwork | undefined {
  return getShieldedNetworks().find((n) => n.id === chainId);
}

export function defaultShieldedChainId(): ShieldedChainId {
  const fromEnv = Number(process.env.NEXT_PUBLIC_DEFAULT_SHIELDED_CHAIN_ID);
  if (fromEnv === CHAIN_ID_BASE_SEPOLIA && BASE_SEPOLIA_NETWORK) {
    const ok = getShieldedNetworks().some((n) => n.id === CHAIN_ID_BASE_SEPOLIA);
    if (ok) return CHAIN_ID_BASE_SEPOLIA;
  }
  return CHAIN_ID_ETH_SEPOLIA;
}

export function normalizeStoredShieldedChainId(stored: number | null | undefined): ShieldedChainId {
  const allowed = new Set(getShieldedNetworks().map((n) => n.id));
  if (stored != null && allowed.has(stored as ShieldedChainId)) return stored as ShieldedChainId;
  return defaultShieldedChainId();
}

const ACCENTS = [
  "from-[#0047ab]/30 to-[#7df9ff]/12",
  "from-[#2775ca]/35 to-[#5d9cf5]/15",
  "from-[#26a17b]/35 to-[#50af95]/15",
  "from-[#f4b731]/35 to-[#ffce4a]/15",
  "from-[#375bd2]/35 to-[#2a5bd7]/15",
];

export function buildTokenDefinitionsForShieldedNetwork(net: ShieldedNetwork): TokenDefinition[] {
  const primary = net.contracts.token;
  const rows: {address: `0x${string}`; symbol: string; decimals: number; name?: string}[] = [];
  if (primary && primary !== ethers.ZeroAddress) {
    rows.push({address: primary, symbol: "MOCK", decimals: 18, name: "Pool primary token"});
  }
  for (const t of net.defaultPoolTokens) {
    if (primary && t.address.toLowerCase() === primary.toLowerCase()) continue;
    rows.push({address: t.address, symbol: t.symbol, decimals: t.decimals, name: `${t.symbol} (test)`});
  }
  return rows.map((t, i) => ({
    symbol: t.symbol,
    name: t.name ?? t.symbol,
    decimals: t.decimals,
    accent: ACCENTS[i % ACCENTS.length],
    icon: t.symbol.slice(0, 1).toUpperCase(),
    contractAddress: t.address,
  }));
}
