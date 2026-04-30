import type {TokenDefinition} from "./types";

export const RELAYER_URL =
  process.env.NEXT_PUBLIC_RELAYER_URL ?? "http://127.0.0.1:8787";

export const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "demo-project-id";

export const TOKENS: TokenDefinition[] = [
  {
    symbol: "TOKEN",
    name: "Token",
    decimals: 18,
    accent: "from-[#0047ab]/30 to-[#7df9ff]/12",
    icon: "S",
    contractAddress: "0x9DBEd8AB4A05b5E4b6aF3bf61AA3051F6caa91b4",
  },
];

export const CONTRACTS = {
  shieldedToken: "0x9DBEd8AB4A05b5E4b6aF3bf61AA3051F6caa91b4",
  shieldedPool: "0xDd10f44Bc04451f0e1B698F5a8422f56d0d05966",
  relayerTarget: "0xDd10f44Bc04451f0e1B698F5a8422f56d0d05966",
} as const;

export const PROOF_STEP_LABELS = {
  witness: "Generating witness...",
  proof: "Building proof...",
  submit: "Submitting to relayer...",
  confirm: "Waiting for confirmation...",
} as const;

export const NAV_ITEMS = [
  {href: "/", label: "Dashboard"},
  {href: "/shield", label: "Deposit"},
  {href: "/transfer", label: "Transfer Privately"},
  {href: "/unshield", label: "Withdraw"},
  {href: "/inbox", label: "Private Notes"},
] as const;
