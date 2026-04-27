export const SEPOLIA = {
  chainId: 11155111,
  rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  explorerBaseUrl: "https://sepolia.etherscan.io",
};

export const CONTRACTS = {
  poseidon: "0x9326A6EF88A986286D4B557A9951602182a397Ba",
  poseidonHasher: "0x81E5BDC2167BAD2675792D5B87ec6D70f4bdc268",
  verifier: "0x8Fde56DB65E28853d3e8eecB1033ccAdB34540E7",
  merkleTree: "0x73C03CB432823F3c0B70a8d5a097738260Fb7aae",
  pool: "0x23228B4c59CA11597346802D6625C834D44c4922",
  token: "0x2F3dAD877Fc7394c08Be9e323B0CBc6D5BEcFA4A",
};

export const POOL_DEPLOY_BLOCK = 10743513;

export const POOL_ABI = [
  "event RoutedCommitment(bytes32 indexed channel, bytes32 indexed subchannel, bytes encryptedNote)",
  "function nullifierSet(bytes32) view returns (bool)",
  "function shieldRouted(address token, uint256 amount, bytes32 commitment, bytes encryptedNote, bytes32 channel, bytes32 subchannel) external",
  "function unshield(bytes proof, bytes32 nullifier, address token, address recipient, uint256 amount, bytes32 merkleRoot) external",
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
