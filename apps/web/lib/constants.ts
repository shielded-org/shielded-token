import type {TokenDefinition} from "./types";

export const RELAYER_URL =
  process.env.NEXT_PUBLIC_RELAYER_URL ?? "http://127.0.0.1:8787";

export const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "demo-project-id";

export const TOKENS: TokenDefinition[] = [
  {
    symbol: "sUSD",
    name: "Shielded USD",
    decimals: 6,
    accent: "from-[#0047ab]/30 to-[#7df9ff]/12",
    icon: "S",
    contractAddress: "0x0000000000000000000000000000000000000000", // TODO: fill in deployed address
  },
  {
    symbol: "stETH",
    name: "Shielded Ether",
    decimals: 6,
    accent: "from-[#7df9ff]/30 to-[#f2f2f2]/10",
    icon: "E",
    contractAddress: "0x0000000000000000000000000000000000000000", // TODO: fill in deployed address
  },
  {
    symbol: "sDAI",
    name: "Shielded Dai",
    decimals: 6,
    accent: "from-[#f2f2f2]/16 to-[#0047ab]/12",
    icon: "D",
    contractAddress: "0x0000000000000000000000000000000000000000", // TODO: fill in deployed address
  },
];

export const CONTRACTS = {
  shieldedToken: "0x0000000000000000000000000000000000000000", // TODO: fill in deployed address
  shieldedPool: "0x0000000000000000000000000000000000000000", // TODO: fill in deployed address
  relayerTarget: "0x0000000000000000000000000000000000000000", // TODO: fill in deployed address
} as const;

export const PROOF_STEP_LABELS = {
  witness: "Generating witness...",
  proof: "Building proof...",
  submit: "Submitting to relayer...",
  confirm: "Waiting for confirmation...",
} as const;

export const NAV_ITEMS = [
  {href: "/", label: "Overview"},
  {href: "/shield", label: "Shield"},
  {href: "/transfer", label: "Transfer"},
  {href: "/unshield", label: "Unshield"},
  {href: "/inbox", label: "Inbox"},
] as const;
