import {ethers} from "ethers";

import {MERKLE_ABI, POOL_DEPLOY_BLOCK, POSEIDON_ABI} from "./config";

function toHex32(v: bigint): `0x${string}` {
  return ethers.zeroPadValue(ethers.toBeHex(v), 32) as `0x${string}`;
}

function parseHexToBigInt(hex: string) {
  return BigInt(hex);
}

async function poseidonHash2(poseidon: ethers.Contract, a: bigint, b: bigint): Promise<`0x${string}`> {
  const out = await poseidon.hash_2(a, b);
  return toHex32(BigInt(out.toString()));
}

async function buildZeroes(poseidon: ethers.Contract, depth: number) {
  const zeroes: bigint[] = [];
  let cur = 0n;
  for (let i = 0; i < depth; i += 1) {
    zeroes.push(cur);
    cur = parseHexToBigInt(await poseidonHash2(poseidon, cur, cur));
  }
  return zeroes;
}

async function buildLevelMaps(poseidon: ethers.Contract, leaves: `0x${string}`[], depth = 20) {
  const zeroes = await buildZeroes(poseidon, depth);
  const levels: Map<number, bigint>[] = [];
  let current = new Map<number, bigint>();
  for (let i = 0; i < leaves.length; i += 1) current.set(i, parseHexToBigInt(leaves[i]));
  levels.push(current);
  for (let level = 0; level < depth; level += 1) {
    const next = new Map<number, bigint>();
    const parentIndices = new Set<number>();
    for (const idx of current.keys()) parentIndices.add(idx >> 1);
    for (const pIdx of parentIndices) {
      const left = current.get(pIdx * 2) ?? zeroes[level];
      const right = current.get(pIdx * 2 + 1) ?? zeroes[level];
      const h = parseHexToBigInt(await poseidonHash2(poseidon, left, right));
      next.set(pIdx, h);
    }
    current = next;
    levels.push(current);
  }
  return {levels, zeroes};
}

function extractPath(levelMaps: Map<number, bigint>[], zeroes: bigint[], targetIndex: number, depth = 20) {
  const siblings: `0x${string}`[] = [];
  const directions: boolean[] = [];
  let idx = targetIndex;
  for (let level = 0; level < depth; level += 1) {
    const map = levelMaps[level];
    const siblingIdx = idx ^ 1;
    siblings.push(toHex32(map.get(siblingIdx) ?? zeroes[level]));
    directions.push((idx & 1) === 1);
    idx >>= 1;
  }
  const rootMap = levelMaps[depth];
  const root = toHex32(rootMap.get(0) ?? zeroes[depth - 1]);
  return {root, siblings, directions};
}

export async function loadAllLeaves(provider: ethers.JsonRpcProvider, merkleTreeAddress: `0x${string}`): Promise<`0x${string}`[]> {
  const iface = new ethers.Interface(MERKLE_ABI);
  const event = iface.getEvent("LeafInserted");
  if (!event) return [];
  const topic = event.topicHash;
  const latest = await provider.getBlockNumber();
  const logs: ethers.Log[] = [];
  const chunkSize = 50_000;
  let start = POOL_DEPLOY_BLOCK;
  while (start <= latest) {
    const end = Math.min(start + chunkSize - 1, latest);
    const part = await provider.getLogs({
      address: merkleTreeAddress,
      fromBlock: start,
      toBlock: end,
      topics: [topic],
    });
    logs.push(...part);
    start = end + 1;
  }
  const leaves: `0x${string}`[] = [];
  for (const log of logs) {
    const parsed = iface.parseLog(log);
    if (!parsed) continue;
    leaves[Number(parsed.args.index)] = parsed.args.leaf as `0x${string}`;
  }
  return leaves.filter(Boolean);
}

export async function buildInputMerklePaths(params: {
  provider: ethers.JsonRpcProvider;
  poseidonAddress: `0x${string}`;
  merkleTreeAddress: `0x${string}`;
  targetCommitments: [`0x${string}`, `0x${string}`];
}) {
  const poseidon = new ethers.Contract(params.poseidonAddress, POSEIDON_ABI, params.provider);
  const leaves = await loadAllLeaves(params.provider, params.merkleTreeAddress);
  const index0 = leaves.findIndex((x) => x.toLowerCase() === params.targetCommitments[0].toLowerCase());
  const index1 = leaves.findIndex((x) => x.toLowerCase() === params.targetCommitments[1].toLowerCase());
  if (index0 < 0 || index1 < 0) {
    throw new Error("Could not find commitment in Merkle leaves");
  }
  const {levels, zeroes} = await buildLevelMaps(poseidon, leaves, 20);
  const path0 = extractPath(levels, zeroes, index0, 20);
  const path1 = extractPath(levels, zeroes, index1, 20);
  return {
    allLeaves: leaves,
    root: path0.root,
    index0,
    index1,
    siblings: [path0.siblings, path1.siblings] as [`0x${string}`[], `0x${string}`[]],
    directions: [path0.directions, path1.directions] as [boolean[], boolean[]],
  };
}

export async function buildMerklePathForCommitment(params: {
  provider: ethers.JsonRpcProvider;
  poseidonAddress: `0x${string}`;
  merkleTreeAddress: `0x${string}`;
  targetCommitment: `0x${string}`;
}) {
  const poseidon = new ethers.Contract(params.poseidonAddress, POSEIDON_ABI, params.provider);
  const leaves = await loadAllLeaves(params.provider, params.merkleTreeAddress);
  const index = leaves.findIndex((x) => x.toLowerCase() === params.targetCommitment.toLowerCase());
  if (index < 0) {
    throw new Error("Could not find commitment in Merkle leaves");
  }
  const {levels, zeroes} = await buildLevelMaps(poseidon, leaves, 20);
  const path = extractPath(levels, zeroes, index, 20);
  return {
    allLeaves: leaves,
    root: path.root,
    index,
    siblings: path.siblings as `0x${string}`[],
    directions: path.directions as boolean[],
  };
}
