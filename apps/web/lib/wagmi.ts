import {createConfig, http} from "wagmi";
import {arbitrumSepolia, baseSepolia, mainnet, sepolia} from "wagmi/chains";

export const wagmiConfig = createConfig({
  chains: [mainnet, sepolia, baseSepolia, arbitrumSepolia],
  connectors: [],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [baseSepolia.id]: http(),
    [arbitrumSepolia.id]: http("https://sepolia-rollup.arbitrum.io/rpc"),
  },
  ssr: true,
});
