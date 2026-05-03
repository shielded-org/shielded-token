import type {TokenDefinition} from "./types";

export const RELAYER_URL =
  process.env.NEXT_PUBLIC_RELAYER_URL ?? "http://127.0.0.1:8787";

export const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "demo-project-id";

export const TOKENS: TokenDefinition[] = [
  {
    symbol: "MOCK",
    name: "Mock Token",
    decimals: 18,
    accent: "from-[#0047ab]/30 to-[#7df9ff]/12",
    icon: "S",
    contractAddress: "0x9DBEd8AB4A05b5E4b6aF3bf61AA3051F6caa91b4",
  },
  {
    symbol: "USDC",
    name: "USD Coin (mock)",
    decimals: 6,
    accent: "from-[#2775ca]/35 to-[#5d9cf5]/15",
    icon: "U",
    contractAddress: "0x093856dc11cbEFeBb6c53E112F85E807D44ca9c2",
  },
  {
    symbol: "USDT",
    name: "Tether USD (mock)",
    decimals: 6,
    accent: "from-[#26a17b]/35 to-[#50af95]/15",
    icon: "T",
    contractAddress: "0x70bdC729406Ee9C547522529f43F48028FCf374A",
  },
  {
    symbol: "DAI",
    name: "Dai Stablecoin (mock)",
    decimals: 18,
    accent: "from-[#f4b731]/35 to-[#ffce4a]/15",
    icon: "D",
    contractAddress: "0xDc256389b94e511caEe10A75F1FE4246c185c288",
  },
  {
    symbol: "LINK",
    name: "Chainlink (mock)",
    decimals: 18,
    accent: "from-[#375bd2]/35 to-[#2a5bd7]/15",
    icon: "L",
    contractAddress: "0xFFBeF846263Af332CF34f7AC1F54aD09745c8c05",
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
