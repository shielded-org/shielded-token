export const SEPOLIA = {
  chainId: 11155111,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
  explorerBaseUrl: "https://sepolia.etherscan.io",
};

export const CONTRACTS = {
  poseidon: (process.env.NEXT_PUBLIC_POSEIDON_ADDRESS ?? "0xa9CC305Af95542673aea1518881B6F1E7A8DE3b8") as `0x${string}`,
  poseidonHasher: (process.env.NEXT_PUBLIC_POSEIDON_HASHER_ADDRESS ?? "0xE6d12EfF9db5FDb548Aa17Ad1587623FFAe3BE96") as `0x${string}`,
  verifier: (process.env.NEXT_PUBLIC_VERIFIER_ADDRESS ?? "0xf45A783A47c68570b9D786a291e934F6A6B70950") as `0x${string}`,
  merkleTree: (process.env.NEXT_PUBLIC_MERKLE_TREE_ADDRESS ?? "0x3C4A041C4145B7FEF8C341Ca10D162A717adcc7A") as `0x${string}`,
  pool: (process.env.NEXT_PUBLIC_POOL_ADDRESS ?? "0xDd10f44Bc04451f0e1B698F5a8422f56d0d05966") as `0x${string}`,
  token: (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? "0x9DBEd8AB4A05b5E4b6aF3bf61AA3051F6caa91b4") as `0x${string}`,
};

export const POOL_DEPLOY_BLOCK = Number(process.env.NEXT_PUBLIC_POOL_DEPLOY_BLOCK ?? 10744004);

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
