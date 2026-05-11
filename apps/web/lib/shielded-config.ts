import {CHAIN_ID_ETH_SEPOLIA, getShieldedNetwork} from "./networks";

const eth = getShieldedNetwork(CHAIN_ID_ETH_SEPOLIA)!;

/** @deprecated Prefer getShieldedNetwork(chainId) for multi-chain */
export const SEPOLIA = {
  chainId: eth.id,
  rpcUrl: eth.rpcUrl,
  explorerBaseUrl: eth.explorerBaseUrl,
};

/** @deprecated Prefer getShieldedNetwork(chainId).contracts */
export const CONTRACTS = eth.contracts;

/** @deprecated Prefer getShieldedNetwork(chainId).poolDeployBlock */
export const POOL_DEPLOY_BLOCK = eth.poolDeployBlock;

export const POOL_ABI = [
  "event RoutedCommitment(bytes32 indexed channel, bytes32 indexed subchannel, bytes encryptedNote)",
  "function nullifierSet(bytes32) view returns (bool)",
  "function shieldRouted(address token, uint256 amount, bytes32 commitment, bytes encryptedNote, bytes32 channel, bytes32 subchannel) external",
  "function unshield(bytes proof, bytes32 nullifier, address token, address recipient, uint256 amount, bytes32 merkleRoot, bytes32 newCommitment, bytes encryptedNote, bytes32 channel, bytes32 subchannel) external",
];

export const MERKLE_ABI = [
  "event LeafInserted(uint256 indexed index, bytes32 indexed leaf, bytes32 indexed newRoot)",
  "function getLastRoot() external view returns (bytes32)",
  "function isKnownRoot(bytes32 root) external view returns (bool)",
];

export const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export const POSEIDON_ABI = [
  "function hash_2(uint256 x, uint256 y) external pure returns (uint256)",
  "function hash(uint256[] input) external pure returns (uint256)",
];
