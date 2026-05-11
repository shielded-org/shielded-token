import {createConfig, http} from "wagmi";
import {baseSepolia, mainnet, sepolia} from "wagmi/chains";

export const wagmiConfig = createConfig({
  chains: [mainnet, sepolia, baseSepolia],
  connectors: [],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [baseSepolia.id]: http(),
  },
  ssr: true,
});
