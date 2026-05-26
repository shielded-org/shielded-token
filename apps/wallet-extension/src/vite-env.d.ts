/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RELAYER_URL?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_ETH_SEPOLIA_RPC_URLS?: string;
  readonly VITE_BASE_SEPOLIA_RPC_URL?: string;
  readonly VITE_BASE_SEPOLIA_RPC_URLS?: string;
  readonly VITE_ARBITRUM_SEPOLIA_RPC_URL?: string;
  readonly VITE_ARBITRUM_SEPOLIA_RPC_URLS?: string;
  readonly VITE_BASE_SEPOLIA_POOL_ADDRESS?: string;
  readonly VITE_ARBITRUM_SEPOLIA_POOL_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
