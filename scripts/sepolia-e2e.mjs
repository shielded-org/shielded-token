/**
 * Sepolia testnet E2E — same flow as hardhat-local-e2e.mjs:
 * build circuit/contracts → deploy (optional) → shield 6 notes → 3 relayed transfers → scan/decrypt.
 *
 * Env (use a local file and Node 20+):  node --env-file=.env.sepolia scripts/sepolia-e2e.mjs
 *
 * Required:
 *   TESTNET_RPC_URL   (e.g. https://ethereum-sepolia-rpc.publicnode.com)
 *   PRIVATE_KEY       deployer + shield signer (0x-prefixed, funded with Sepolia ETH)
 *
 * Optional:
 *   TESTNET_CHAIN_ID=11155111
 *   TESTNET_NAME=sepolia
 *   BLOCK_EXPLORER_BASE_URL=https://sepolia.etherscan.io
 *   RELAYER_URL         (default http://127.0.0.1:8787) — relayer must use RELAYER_RPC_URL=TESTNET_RPC_URL
 *   RELAYER_CONFIRM_TIMEOUT_MS, RELAYER_POLL_INTERVAL_MS
 *
 * Reuse deployment (no new Poseidon/verifier/tree/token txs) — tree must be empty or use transfers-only:
 *   SKIP_DEPLOY=true
 *   Addresses from SEPOLIA_POSEIDON, SEPOLIA_POSEIDON_HASHER, SEPOLIA_VERIFIER, SEPOLIA_MERKLE_TREE,
 *   SEPOLIA_SHIELDED_TOKEN — or scripts/sepolia-deployment.json from a prior deploy.
 *
 * Transfers only (skip deploy + skip shield; uses Merkle snapshot after a shield phase):
 *   TRANSFERS_ONLY=true
 *   Requires scripts/sepolia-e2e-state.json (written after shields on a prior run, before transfers).
 *
 * TOKEN_DEPLOY_BLOCK — block when token was deployed (log scan); also stored in sepolia-deployment.json.
 *
 * After deploy, addresses are written to scripts/sepolia-deployment.json (gitignored).
 */

import {execFileSync} from "node:child_process";
import {existsSync, readFileSync, unlinkSync, writeFileSync} from "node:fs";
import {
  createCipheriv,
  createDecipheriv,
  createECDH,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";

import {ethers} from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const contractsDir = path.join(root, "packages", "contracts");
const circuitsDir = path.join(root, "packages", "circuits");
const deploymentJsonPath = path.join(__dirname, "sepolia-deployment.json");
const shieldStateJsonPath = path.join(__dirname, "sepolia-e2e-state.json");

const TESTNET_RPC_URL = process.env.TESTNET_RPC_URL || "";
const TESTNET_CHAIN_ID = Number(process.env.TESTNET_CHAIN_ID || 11155111);
const TESTNET_NAME = process.env.TESTNET_NAME || "sepolia";
const BLOCK_EXPLORER_BASE_URL = (process.env.BLOCK_EXPLORER_BASE_URL || "https://sepolia.etherscan.io").replace(
  /\/$/,
  ""
);
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const VERIFY_CONTRACTS =
  String(process.env.VERIFY_CONTRACTS || "").toLowerCase() === "true" ||
  process.env.VERIFY_CONTRACTS === "1" ||
  (process.env.VERIFY_CONTRACTS == null && ETHERSCAN_API_KEY.length > 0);
const RELAYER_URL = process.env.RELAYER_URL || "http://127.0.0.1:8787";
const RELAYER_CONFIRM_TIMEOUT_MS = Number(process.env.RELAYER_CONFIRM_TIMEOUT_MS || 600_000);
const RELAYER_POLL_INTERVAL_MS = Number(process.env.RELAYER_POLL_INTERVAL_MS || 3_000);
const SKIP_DEPLOY = String(process.env.SKIP_DEPLOY || "").toLowerCase() === "true" || process.env.SKIP_DEPLOY === "1";
const TRANSFERS_ONLY = String(process.env.TRANSFERS_ONLY || "").toLowerCase() === "true" || process.env.TRANSFERS_ONLY === "1";

const SHIELDED_TOKEN_ABI = [
  "function shieldRouted(uint256 amount, bytes32 commitment, bytes encryptedNote, bytes32 channel, bytes32 subchannel) external",
  "function shieldedTransferRouted(bytes proof, bytes32[2] nullifiers, bytes32[2] newCommitments, bytes[2] encryptedNotes, bytes32[2] channels, bytes32[2] subchannels, bytes32 merkleRoot, bytes32 token, uint64 fee) external",
  "function tokenField() external view returns (bytes32)",
  "function nullifierSet(bytes32) external view returns (bool)",
  "event RoutedCommitment(bytes32 indexed channel, bytes32 indexed subchannel, bytes encryptedNote)",
];

const MERKLE_ABI = [
  "function insert(bytes32 leaf) external",
  "function getLastRoot() external view returns (bytes32)",
  "function isKnownRoot(bytes32 root) external view returns (bool)",
  "function getNextIndex() external view returns (uint256)",
];

const HASHER_ABI = ["function hash2(bytes32 left, bytes32 right) external view returns (bytes32)"];
const POSEIDON_ABI = [
  "function hash_2(uint256 x, uint256 y) external pure returns (uint256)",
  "function hash(uint256[] input) external pure returns (uint256)",
];

function loadForgeArtifact(relPath) {
  const p = path.join(contractsDir, "out", relPath);
  return JSON.parse(readFileSync(p, "utf8"));
}

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, {cwd, stdio: "inherit"});
}

function encodeConstructorArgs(types, values) {
  return ethers.AbiCoder.defaultAbiCoder().encode(types, values);
}

function verifyContractOnEtherscan({address, contractId, constructorArgs}) {
  const args = [
    "verify-contract",
    "--chain-id",
    String(TESTNET_CHAIN_ID),
    "--etherscan-api-key",
    ETHERSCAN_API_KEY,
    "--watch",
    address,
    contractId,
  ];
  if (constructorArgs) {
    args.push("--constructor-args", constructorArgs);
  }
  run("forge", args, contractsDir);
}

function explorerTx(hash) {
  if (!hash || !BLOCK_EXPLORER_BASE_URL) return hash;
  return `${BLOCK_EXPLORER_BASE_URL}/tx/${hash}`;
}

function explorerAddr(addr) {
  if (!addr || !BLOCK_EXPLORER_BASE_URL) return addr;
  return `${BLOCK_EXPLORER_BASE_URL}/address/${addr}`;
}

async function relayShieldedTransfer(bundle) {
  const res = await fetch(`${RELAYER_URL}/relay/shielded-transfer`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify(bundle),
  });
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(`Relayer rejected request (${res.status}): ${payload.error || "unknown error"}`);
  }
  return payload;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRelayerStatus(requestId) {
  const res = await fetch(`${RELAYER_URL}/relay/status/${requestId}`);
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(`Relayer status fetch failed (${res.status}): ${payload.error || "unknown error"}`);
  }
  return payload;
}

async function waitForRelayerConfirmation(requestId, timeoutMs = RELAYER_CONFIRM_TIMEOUT_MS) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const status = await fetchRelayerStatus(requestId);
    if (status.status === "confirmed") return status;
    if (status.status === "failed" || status.status === "timeout") {
      throw new Error(`Relayer request failed: ${status.error || "unknown error"}`);
    }
    await sleep(RELAYER_POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for relayer confirmation after ${timeoutMs}ms (requestId=${requestId})`);
}

function parseHexToBigInt(hex) {
  return BigInt(hex);
}

function toHex32(v) {
  return ethers.zeroPadValue(ethers.toBeHex(v), 32);
}

function hexToBytes(hex) {
  return Buffer.from(hex.replace(/^0x/, ""), "hex");
}

function bytesToHex(bytes) {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

function viewingPrivToPub(viewingPriv) {
  const ecdh = createECDH("secp256k1");
  ecdh.setPrivateKey(hexToBytes(toHex32(viewingPriv)));
  return bytesToHex(ecdh.getPublicKey(undefined, "compressed"));
}

function routeForRecipient(viewingPubHex, subchannelId) {
  const channel = ethers.keccak256(viewingPubHex);
  const subchannel = ethers.solidityPackedKeccak256(["bytes32", "uint64"], [channel, BigInt(subchannelId)]);
  return {channel, subchannel};
}

function encryptNoteECDH(note, recipientViewingPubHex) {
  const eph = createECDH("secp256k1");
  eph.generateKeys();
  const sharedSecret = eph.computeSecret(hexToBytes(recipientViewingPubHex));
  const salt = randomBytes(32);
  const key = hkdfSync("sha256", sharedSecret, salt, Buffer.from("zkproject-note-v1"), 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(note), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope = {
    v: 1,
    eph: bytesToHex(eph.getPublicKey(undefined, "compressed")),
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    ct: bytesToHex(ciphertext),
    tag: bytesToHex(tag),
  };
  return bytesToHex(Buffer.from(JSON.stringify(envelope), "utf8"));
}

function decryptNoteECDH(encryptedNoteHex, recipientViewingPriv) {
  try {
    const envelopeRaw = Buffer.from(encryptedNoteHex.replace(/^0x/, ""), "hex").toString("utf8");
    const envelope = JSON.parse(envelopeRaw);
    if (envelope.v !== 1) return null;
    const recipientECDH = createECDH("secp256k1");
    recipientECDH.setPrivateKey(hexToBytes(toHex32(recipientViewingPriv)));
    const sharedSecret = recipientECDH.computeSecret(hexToBytes(envelope.eph));
    const key = hkdfSync(
      "sha256",
      sharedSecret,
      hexToBytes(envelope.salt),
      Buffer.from("zkproject-note-v1"),
      32
    );
    const decipher = createDecipheriv("aes-256-gcm", key, hexToBytes(envelope.iv));
    decipher.setAuthTag(hexToBytes(envelope.tag));
    const plaintext = Buffer.concat([
      decipher.update(hexToBytes(envelope.ct)),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8"));
  } catch {
    return null;
  }
}

async function scanAndDecryptNotes({provider, tokenAddress, fromBlock, viewer, subchannels = [0, 1, 2, 3]}) {
  const iface = new ethers.Interface(SHIELDED_TOKEN_ABI);
  const topic = iface.getEvent("RoutedCommitment").topicHash;
  const channel = ethers.keccak256(viewer.viewingPub);
  const logs = [];
  for (const subIdx of subchannels) {
    const route = routeForRecipient(viewer.viewingPub, subIdx);
    const scoped = await provider.getLogs({
      address: tokenAddress,
      fromBlock,
      toBlock: "latest",
      topics: [topic, channel, route.subchannel],
    });
    logs.push(...scoped);
  }
  const discovered = [];
  for (const log of logs) {
    const parsed = iface.parseLog(log);
    if (!parsed) continue;
    const encryptedNote = parsed.args.encryptedNote;
    const note = decryptNoteECDH(encryptedNote, viewer.viewingPriv);
    if (note) {
      discovered.push({
        blockNumber: log.blockNumber,
        txHash: log.transactionHash,
        note,
      });
    }
  }
  return discovered;
}

async function summarizeViewerBalance({viewer, discovered, poseidonRW, tokenRW}) {
  let discoveredAmount = 0n;
  let spentAmount = 0n;
  let spendableAmount = 0n;
  let spentNotes = 0;
  let spendableNotes = 0;

  for (const item of discovered) {
    const noteAmount = BigInt(item.note.amount);
    discoveredAmount += noteAmount;
    const nf = await nullifier(poseidonRW, viewer.spendingKey, item.note.commitment);
    const isSpent = await tokenRW.nullifierSet(nf);
    if (isSpent) {
      spentNotes += 1;
      spentAmount += noteAmount;
    } else {
      spendableNotes += 1;
      spendableAmount += noteAmount;
    }
  }

  return {
    discoveredNotes: discovered.length,
    discoveredAmount: discoveredAmount.toString(),
    spendableNotes,
    spendableAmount: spendableAmount.toString(),
    spentNotes,
    spentAmount: spentAmount.toString(),
  };
}

async function poseidonHash2(poseidon, a, b) {
  const out = await poseidon.hash_2(a, b);
  return toHex32(out);
}

async function noteCommitment(poseidon, owner, tokenField, amount, blinding) {
  const out = await poseidon.hash([
    owner,
    parseHexToBigInt(tokenField),
    amount,
    blinding,
  ]);
  return toHex32(out);
}

async function nullifier(poseidon, spendingKey, commitmentHex) {
  return await poseidonHash2(poseidon, spendingKey, parseHexToBigInt(commitmentHex));
}

async function buildZeroes(poseidon, depth) {
  const zeroes = [];
  let cur = 0n;
  for (let i = 0; i < depth; i += 1) {
    zeroes.push(cur);
    cur = parseHexToBigInt(await poseidonHash2(poseidon, cur, cur));
  }
  return zeroes;
}

async function buildLevelMaps(poseidon, leaves, depth = 20) {
  const zeroes = await buildZeroes(poseidon, depth);
  const levels = [];
  let current = new Map();
  for (let i = 0; i < leaves.length; i += 1) {
    current.set(i, parseHexToBigInt(leaves[i]));
  }
  levels.push(current);

  for (let level = 0; level < depth; level += 1) {
    const next = new Map();
    const parentIndices = new Set();
    for (const idx of current.keys()) {
      parentIndices.add(idx >> 1);
    }
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

function extractPath(levelMaps, zeroes, targetIndex, depth = 20) {
  const siblings = [];
  const directions = [];
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
  return {
    root,
    siblings,
    directions,
  };
}

function writeProverToml(payload) {
  const toml = `
spending_key = "${payload.spending_key}"
in_amounts = ["${payload.in_amounts[0]}", "${payload.in_amounts[1]}"]
in_blindings = ["${payload.in_blindings[0]}", "${payload.in_blindings[1]}"]
merkle_siblings = [
  [${payload.merkle_siblings[0].map((x) => `"${x}"`).join(", ")}],
  [${payload.merkle_siblings[1].map((x) => `"${x}"`).join(", ")}]
]
merkle_directions = [
  [${payload.merkle_directions[0].map((x) => (x ? "true" : "false")).join(", ")}],
  [${payload.merkle_directions[1].map((x) => (x ? "true" : "false")).join(", ")}]
]
out_amounts = ["${payload.out_amounts[0]}", "${payload.out_amounts[1]}"]
out_recipient_pks = ["${payload.out_recipient_pks[0]}", "${payload.out_recipient_pks[1]}"]
out_blindings = ["${payload.out_blindings[0]}", "${payload.out_blindings[1]}"]
token = "${payload.token}"
merkle_root = "${payload.merkle_root}"
nullifiers = ["${payload.nullifiers[0]}", "${payload.nullifiers[1]}"]
out_commitments = ["${payload.out_commitments[0]}", "${payload.out_commitments[1]}"]
fee = "${payload.fee}"
`.trimStart();

  writeFileSync(path.join(circuitsDir, "Prover.toml"), toml, "utf8");
}

function readProofHex() {
  const proofWithPublicInputs = readFileSync(path.join(circuitsDir, "target", "proof"));
  const proofWithoutPublicInputs = proofWithPublicInputs.subarray(7 * 32);
  return `0x${proofWithoutPublicInputs.toString("hex")}`;
}

async function executeTransferStep({
  stepName,
  poseidonRW,
  treeRW,
  tokenRW,
  tokenAddress,
  tokenField,
  spendingKey,
  recipientViewingPub,
  changeViewingPub,
  inNotes,
  recipientPk,
  recipientAmount,
  changePk,
  changeAmount,
  outBlindings,
  routedChannels,
  routedSubchannels,
  fee,
}) {
  if (inNotes.length !== 2) throw new Error(`${stepName}: expected exactly two input notes`);

  const inCommitments = [inNotes[0].commitment, inNotes[1].commitment];
  const inAmounts = [inNotes[0].amount, inNotes[1].amount];
  const inBlindings = [inNotes[0].blinding, inNotes[1].blinding];
  const nullifier0 = await nullifier(poseidonRW, spendingKey, inCommitments[0]);
  const nullifier1 = await nullifier(poseidonRW, spendingKey, inCommitments[1]);

  const outCommitment0 = await noteCommitment(poseidonRW, recipientPk, tokenField, recipientAmount, outBlindings[0]);
  const outCommitment1 = await noteCommitment(poseidonRW, changePk, tokenField, changeAmount, outBlindings[1]);
  const encryptedNote0 = encryptNoteECDH(
    {
      token: tokenField,
      amount: recipientAmount.toString(),
      blinding: toHex32(outBlindings[0]),
      commitment: outCommitment0,
    },
    recipientViewingPub
  );
  const encryptedNote1 = encryptNoteECDH(
    {
      token: tokenField,
      amount: changeAmount.toString(),
      blinding: toHex32(outBlindings[1]),
      commitment: outCommitment1,
    },
    changeViewingPub
  );

  const rootOnChain = await treeRW.getLastRoot();
  if (!(await treeRW.isKnownRoot(rootOnChain))) throw new Error(`${stepName}: root is unknown`);

  const allLeaves = [...inNotes[0].allLeavesSnapshot];
  const {levels, zeroes} = await buildLevelMaps(poseidonRW, allLeaves, 20);
  const path0 = extractPath(levels, zeroes, inNotes[0].index, 20);
  const path1 = extractPath(levels, zeroes, inNotes[1].index, 20);
  if (path0.root.toLowerCase() !== rootOnChain.toLowerCase()) {
    throw new Error(`${stepName}: computed root ${path0.root} != on-chain root ${rootOnChain}`);
  }

  console.log(`\n== ${stepName}: preparing witness ==`);
  console.log({phase: "witness_prepared", inputCount: 2, outputCount: 2});

  writeProverToml({
    spending_key: spendingKey.toString(),
    in_amounts: inAmounts.map(String),
    in_blindings: inBlindings.map((x) => toHex32(x)),
    merkle_siblings: [path0.siblings, path1.siblings],
    merkle_directions: [path0.directions, path1.directions],
    out_amounts: [recipientAmount.toString(), changeAmount.toString()],
    out_recipient_pks: [toHex32(recipientPk), toHex32(changePk)],
    out_blindings: outBlindings.map((x) => toHex32(x)),
    token: tokenField,
    merkle_root: rootOnChain,
    nullifiers: [nullifier0, nullifier1],
    out_commitments: [outCommitment0, outCommitment1],
    fee: fee.toString(),
  });

  console.log(`== ${stepName}: generating proof ==`);
  run("nargo", ["execute", "witness"], circuitsDir);
  run(
    "bb",
    ["prove", "-b", "target/shielded_transfer.json", "-w", "target/witness.gz", "-o", "target/proof"],
    circuitsDir
  );
  const proofHex = readProofHex();

  console.log(`== ${stepName}: submitting via relayer ==`);
  const relayerResult = await relayShieldedTransfer({
    shieldedToken: tokenAddress,
    proof: proofHex,
    nullifiers: [nullifier0, nullifier1],
    newCommitments: [outCommitment0, outCommitment1],
    encryptedNotes: [encryptedNote0, encryptedNote1],
    channels: routedChannels,
    subchannels: routedSubchannels,
    merkleRoot: rootOnChain,
    token: tokenField,
    fee: Number(fee),
    gasLimit: Number(process.env.SHIELDED_TRANSFER_GAS_LIMIT || 16_000_000),
  });
  const confirmedStatus = await waitForRelayerConfirmation(relayerResult.requestId);

  const nf0Used = await tokenRW.nullifierSet(nullifier0);
  const nf1Used = await tokenRW.nullifierSet(nullifier1);
  console.log(`== ${stepName}: confirmed on-chain ==`);
  console.log({
    merkleRoot: rootOnChain,
    nullifier0Used: nf0Used,
    nullifier1Used: nf1Used,
    relayerRequestId: relayerResult.requestId,
    txHash: confirmedStatus.txHash ?? relayerResult.txHash,
    explorer: explorerTx(confirmedStatus.txHash ?? relayerResult.txHash),
    status: confirmedStatus.status,
    blockNumber: confirmedStatus.blockNumber,
  });

  return {
    consumed: inNotes.map((n) => n.index),
    created: [
      {commitment: outCommitment0, amount: recipientAmount, blinding: outBlindings[0], ownerPk: recipientPk},
      {commitment: outCommitment1, amount: changeAmount, blinding: outBlindings[1], ownerPk: changePk},
    ],
  };
}

function readDeploymentFromEnv() {
  const poseidon = process.env.SEPOLIA_POSEIDON;
  const hasher = process.env.SEPOLIA_POSEIDON_HASHER;
  const verifier = process.env.SEPOLIA_VERIFIER;
  const tree = process.env.SEPOLIA_MERKLE_TREE;
  const token = process.env.SEPOLIA_SHIELDED_TOKEN;
  if (!poseidon || !hasher || !verifier || !tree || !token) {
    return null;
  }
  return {poseidon, poseidonHasher: hasher, verifier, merkleTree: tree, shieldedToken: token};
}

function readDeploymentFromJson() {
  if (!existsSync(deploymentJsonPath)) return null;
  try {
    const j = JSON.parse(readFileSync(deploymentJsonPath, "utf8"));
    if (j.poseidon && j.poseidonHasher && j.verifier && j.merkleTree && j.shieldedToken) {
      return {
        poseidon: j.poseidon,
        poseidonHasher: j.poseidonHasher,
        verifier: j.verifier,
        merkleTree: j.merkleTree,
        shieldedToken: j.shieldedToken,
        tokenDeployBlock: j.tokenDeployBlock ?? 0,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function writeShieldState(payload) {
  const notesByOwnerPk = {};
  for (const [ownerPkKey, notes] of payload.notesByOwnerPk.entries()) {
    notesByOwnerPk[ownerPkKey] = notes.map((n) => ({
      index: n.index,
      commitment: n.commitment,
      amount: n.amount.toString(),
      blinding: n.blinding.toString(),
      ownerPk: n.ownerPk.toString(),
    }));
  }
  const serializable = {
    version: 1,
    shieldedToken: payload.tokenAddr,
    tokenField: payload.tokenField,
    allLeaves: payload.allLeaves,
    notesByOwnerPk,
  };
  writeFileSync(shieldStateJsonPath, `${JSON.stringify(serializable, null, 2)}\n`, "utf8");
  console.log(`Wrote post-shield state: ${shieldStateJsonPath} (for TRANSFERS_ONLY=1)`);
}

function readShieldState() {
  if (!existsSync(shieldStateJsonPath)) {
    throw new Error(
      `TRANSFERS_ONLY requires ${shieldStateJsonPath} from a prior run (saved after shields, before transfers)`
    );
  }
  const j = JSON.parse(readFileSync(shieldStateJsonPath, "utf8"));
  if (j.version !== 1 || !Array.isArray(j.allLeaves)) {
    if (!j.notesByOwnerPk || typeof j.notesByOwnerPk !== "object") {
      throw new Error("Invalid sepolia-e2e-state.json");
    }
  }
  const notesByOwnerPk = new Map();
  if (j.notesByOwnerPk && typeof j.notesByOwnerPk === "object") {
    for (const [ownerPkKey, notes] of Object.entries(j.notesByOwnerPk)) {
      const parsed = notes.map((n) => ({
        index: n.index,
        commitment: n.commitment,
        amount: BigInt(n.amount),
        blinding: BigInt(n.blinding),
        ownerPk: BigInt(n.ownerPk),
      }));
      notesByOwnerPk.set(ownerPkKey, parsed);
    }
  }
  return {
    tokenAddrExpected: j.shieldedToken,
    tokenFieldExpected: j.tokenField,
    allLeaves: [...j.allLeaves],
    notesByOwnerPk,
  };
}

async function main() {
  if (!TESTNET_RPC_URL) {
    throw new Error("Set TESTNET_RPC_URL (e.g. https://ethereum-sepolia-rpc.publicnode.com)");
  }
  if (!PRIVATE_KEY) {
    throw new Error("Set PRIVATE_KEY for funded Sepolia deployer/shield signer");
  }

  const pk = PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`;
  console.log(`== ${TESTNET_NAME} (chainId ${TESTNET_CHAIN_ID}) ==`);
  console.log(`RPC: ${TESTNET_RPC_URL}`);

  const provider = new ethers.JsonRpcProvider(TESTNET_RPC_URL, TESTNET_CHAIN_ID);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== TESTNET_CHAIN_ID) {
    console.warn(`Warning: RPC chainId ${net.chainId} differs from TESTNET_CHAIN_ID ${TESTNET_CHAIN_ID}`);
  }

  const buildAndCompile = !TRANSFERS_ONLY;
  if (buildAndCompile) {
    console.log("== Building contracts and circuit ==");
    run("nargo", ["compile"], circuitsDir);
    run("bb", ["write_vk", "-b", "target/shielded_transfer.json", "-o", "target/vk"], circuitsDir);
    run("bb", ["contract", "-k", "target/vk", "-o", "target/contract.sol"], circuitsDir);
    writeFileSync(
      path.join(contractsDir, "src", "HonkVerifier.sol"),
      readFileSync(path.join(circuitsDir, "target", "contract.sol"), "utf8")
    );
    run("forge", ["build"], contractsDir);
  } else {
    console.log("== TRANSFERS_ONLY: compiling circuit only (no forge / verifier copy) ==");
    run("nargo", ["compile"], circuitsDir);
    run("bb", ["write_vk", "-b", "target/shielded_transfer.json", "-o", "target/vk"], circuitsDir);
  }

  const baseSigner = new ethers.Wallet(pk, provider);
  const signer = new ethers.NonceManager(baseSigner);
  const deployerAddr = await signer.getAddress();
  const bal = await provider.getBalance(deployerAddr);
  console.log(`Deployer: ${deployerAddr}`);
  console.log(`Balance: ${ethers.formatEther(bal)} ETH`);
  if (bal === 0n) throw new Error("Deployer has zero ETH; fund the account on Sepolia");

  let poseidonAddr;
  let poseidon2HasherAddr;
  let verifierAddr;
  let treeAddr;
  let tokenAddr;
  let tokenDeployBlock = Number(process.env.TOKEN_DEPLOY_BLOCK || 0);

  const fromJson = readDeploymentFromJson();
  const fromEnv = readDeploymentFromEnv();

  if (SKIP_DEPLOY || TRANSFERS_ONLY) {
    const dep = fromEnv || fromJson;
    if (!dep) {
      throw new Error(
        "SKIP_DEPLOY or TRANSFERS_ONLY requires SEPOLIA_* env vars or scripts/sepolia-deployment.json from a prior deploy"
      );
    }
    poseidonAddr = dep.poseidon;
    poseidon2HasherAddr = dep.poseidonHasher;
    verifierAddr = dep.verifier;
    treeAddr = dep.merkleTree;
    tokenAddr = dep.shieldedToken;
    if (dep.tokenDeployBlock != null) tokenDeployBlock = Number(dep.tokenDeployBlock);
    console.log("== Using existing deployment ==");
    console.log({
      poseidon: explorerAddr(poseidonAddr),
      poseidonHasher: explorerAddr(poseidon2HasherAddr),
      verifier: explorerAddr(verifierAddr),
      merkleTree: explorerAddr(treeAddr),
      shieldedToken: explorerAddr(tokenAddr),
      tokenDeployBlock,
    });
  } else {
    console.log("== Deploying to Sepolia ==");
    const poseidonArtifact = loadForgeArtifact("Poseidon2.sol/Poseidon2.json");
    const poseidonFactory = new ethers.ContractFactory(
      poseidonArtifact.abi,
      poseidonArtifact.bytecode.object,
      signer
    );
    const poseidon = await poseidonFactory.deploy();
    await poseidon.waitForDeployment();
    poseidonAddr = await poseidon.getAddress();
    console.log(`Poseidon2: ${explorerAddr(poseidonAddr)}`);

    const hasherAdapterArtifact = loadForgeArtifact("Poseidon2YulHasher.sol/Poseidon2YulHasher.json");
    const hasherAdapterFactory = new ethers.ContractFactory(
      hasherAdapterArtifact.abi,
      hasherAdapterArtifact.bytecode.object,
      signer
    );
    const hasherAdapter = await hasherAdapterFactory.deploy(poseidonAddr);
    await hasherAdapter.waitForDeployment();
    poseidon2HasherAddr = await hasherAdapter.getAddress();
    console.log(`Poseidon2Hasher: ${explorerAddr(poseidon2HasherAddr)}`);

    const verifierArtifact = loadForgeArtifact("HonkVerifier.sol/UltraVerifier.json");
    const verifierFactory = new ethers.ContractFactory(
      verifierArtifact.abi,
      verifierArtifact.bytecode.object,
      signer
    );
    const verifier = await verifierFactory.deploy();
    await verifier.waitForDeployment();
    verifierAddr = await verifier.getAddress();
    console.log(`HonkVerifier: ${explorerAddr(verifierAddr)}`);

    const treeArtifact = loadForgeArtifact("IncrementalMerkleTree.sol/IncrementalMerkleTree.json");
    const treeFactory = new ethers.ContractFactory(treeArtifact.abi, treeArtifact.bytecode.object, signer);
    const tree = await treeFactory.deploy(poseidon2HasherAddr);
    await tree.waitForDeployment();
    treeAddr = await tree.getAddress();
    console.log(`IncrementalMerkleTree: ${explorerAddr(treeAddr)}`);

    const tokenArtifact = loadForgeArtifact("ShieldedToken.sol/ShieldedToken.json");
    const tokenFactory = new ethers.ContractFactory(tokenArtifact.abi, tokenArtifact.bytecode.object, signer);
    const initialSupply = ethers.parseEther("1000");
    const token = await tokenFactory.deploy(
      "Shielded Token",
      "SHLD",
      verifierAddr,
      treeAddr,
      deployerAddr,
      initialSupply
    );
    await token.waitForDeployment();
    tokenAddr = await token.getAddress();
    const tokenDeployReceipt = await token.deploymentTransaction().wait();
    tokenDeployBlock = tokenDeployReceipt?.blockNumber ?? 0;
    console.log(`ShieldedToken: ${explorerAddr(tokenAddr)}`);

    const record = {
      testnet: TESTNET_NAME,
      chainId: TESTNET_CHAIN_ID,
      rpcUrl: TESTNET_RPC_URL,
      blockExplorer: BLOCK_EXPLORER_BASE_URL,
      poseidon: poseidonAddr,
      poseidonHasher: poseidon2HasherAddr,
      verifier: verifierAddr,
      merkleTree: treeAddr,
      shieldedToken: tokenAddr,
      tokenDeployBlock,
      deployedAt: new Date().toISOString(),
    };
    writeFileSync(deploymentJsonPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    console.log(`Wrote ${deploymentJsonPath}`);

    if (VERIFY_CONTRACTS) {
      if (!ETHERSCAN_API_KEY) {
        console.warn("VERIFY_CONTRACTS enabled but ETHERSCAN_API_KEY is empty; skipping verification.");
      } else {
        console.log("== Verifying contracts on Etherscan ==");
        try {
          verifyContractOnEtherscan({
            address: poseidonAddr,
            contractId: "src/vendor/poseidon2-evm/Poseidon2.sol:Poseidon2",
          });
          verifyContractOnEtherscan({
            address: poseidon2HasherAddr,
            contractId: "src/Poseidon2YulHasher.sol:Poseidon2YulHasher",
            constructorArgs: encodeConstructorArgs(["address"], [poseidonAddr]),
          });
          verifyContractOnEtherscan({
            address: verifierAddr,
            contractId: "src/HonkVerifier.sol:UltraVerifier",
          });
          verifyContractOnEtherscan({
            address: treeAddr,
            contractId: "src/IncrementalMerkleTree.sol:IncrementalMerkleTree",
            constructorArgs: encodeConstructorArgs(["address"], [poseidon2HasherAddr]),
          });
          verifyContractOnEtherscan({
            address: tokenAddr,
            contractId: "src/ShieldedToken.sol:ShieldedToken",
            constructorArgs: encodeConstructorArgs(
              ["string", "string", "address", "address", "address", "uint256"],
              ["Shielded Token", "SHLD", verifierAddr, treeAddr, deployerAddr, initialSupply]
            ),
          });
        } catch (err) {
          console.warn(`Contract verification failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  const poseidonRW = new ethers.Contract(poseidonAddr, POSEIDON_ABI, provider);
  const treeRW = new ethers.Contract(treeAddr, MERKLE_ABI, signer);
  const tokenRW = new ethers.Contract(tokenAddr, SHIELDED_TOKEN_ABI, signer);
  const tokenField = await tokenRW.tokenField();

  const users = {
    owner: {name: "Owner", spendingKey: 123456789n, viewingPriv: 11111111n},
    userB: {name: "UserB", spendingKey: 777777n, viewingPriv: 22222222n},
    userC: {name: "UserC", spendingKey: 888888n, viewingPriv: 33333333n},
    userD: {name: "UserD", spendingKey: 999999n, viewingPriv: 44444444n},
    userG: {name: "UserG", spendingKey: 555555n, viewingPriv: 66666666n},
    userH: {name: "UserH", spendingKey: 666666n, viewingPriv: 77777777n},
    userK: {name: "UserK", spendingKey: 444444n, viewingPriv: 88888888n},
  };
  for (const user of Object.values(users)) {
    user.ownerPk = parseHexToBigInt(await poseidonHash2(poseidonRW, user.spendingKey, 1n));
    user.viewingPub = viewingPrivToPub(user.viewingPriv);
    user.routeCursor = 0;
  }
  const fee = 0n;

  const onChainNextIndex = await treeRW.getNextIndex();
  const ownerPkKey = (ownerPk) => toHex32(ownerPk).toLowerCase();
  let allLeaves;
  let notesByOwnerPk;
  const pushNote = (note) => {
    const key = ownerPkKey(note.ownerPk);
    const existing = notesByOwnerPk.get(key) || [];
    existing.push(note);
    notesByOwnerPk.set(key, existing);
  };
  const popTwoNotes = (ownerPk) => {
    const key = ownerPkKey(ownerPk);
    const existing = notesByOwnerPk.get(key) || [];
    if (existing.length < 2) throw new Error(`Not enough notes for ${key}`);
    const first = existing.shift();
    const second = existing.shift();
    notesByOwnerPk.set(key, existing);
    return [first, second];
  };

  if (TRANSFERS_ONLY) {
    const st = readShieldState();
    if (st.tokenAddrExpected.toLowerCase() !== tokenAddr.toLowerCase()) {
      throw new Error(
        `sepolia-e2e-state.json token ${st.tokenAddrExpected} != current ${tokenAddr}`
      );
    }
    if (st.tokenFieldExpected.toLowerCase() !== tokenField.toLowerCase()) {
      throw new Error("sepolia-e2e-state.json tokenField mismatch vs on-chain tokenField()");
    }
    if (BigInt(st.allLeaves.length) !== onChainNextIndex) {
      throw new Error(
        `State vs chain desync: state has ${st.allLeaves.length} leaves, tree getNextIndex()=${onChainNextIndex}`
      );
    }
    allLeaves = st.allLeaves;
    notesByOwnerPk = st.notesByOwnerPk;
    console.log("== TRANSFERS_ONLY: loaded post-shield Merkle snapshot ==");
    console.log({leaves: allLeaves.length});
  } else {
    if (onChainNextIndex > 0n) {
      throw new Error(
        `Merkle tree already has ${onChainNextIndex} leaves. This script only supports an empty tree for the scripted shield phase. Use TRANSFERS_ONLY=1 with ${shieldStateJsonPath} after a run that saved state post-shield, or deploy a new token/tree.`
      );
    }
    console.log("== Shielding six owner notes (on-chain txs from deployer) ==");
    const initialNotesSpec = [
      {amount: 20n, blinding: 1111n},
      {amount: 20n, blinding: 2222n},
      {amount: 20n, blinding: 3333n},
      {amount: 20n, blinding: 4444n},
      {amount: 20n, blinding: 5555n},
      {amount: 20n, blinding: 6666n},
    ];
    allLeaves = [];
    notesByOwnerPk = new Map();
    for (let i = 0; i < initialNotesSpec.length; i += 1) {
      const spec = initialNotesSpec[i];
      const commitment = await noteCommitment(poseidonRW, users.owner.ownerPk, tokenField, spec.amount, spec.blinding);
      const encryptedDepositNote = encryptNoteECDH(
        {token: tokenField, amount: spec.amount.toString(), blinding: toHex32(spec.blinding), commitment},
        users.owner.viewingPub
      );
      const route = routeForRecipient(users.owner.viewingPub, users.owner.routeCursor++);
      const tx = await tokenRW.shieldRouted(spec.amount, commitment, encryptedDepositNote, route.channel, route.subchannel);
      const receipt = await tx.wait();
      console.log(`Shielded note #${i + 1}: ${explorerTx(receipt.hash)}`);
      const index = allLeaves.length;
      allLeaves.push(commitment);
      pushNote({index, commitment, amount: spec.amount, blinding: spec.blinding, ownerPk: users.owner.ownerPk});
    }
    writeShieldState({tokenAddr, tokenField, allLeaves, notesByOwnerPk});
  }

  run("bb", ["write_vk", "-b", "target/shielded_transfer.json", "-o", "target/vk"], circuitsDir);

  const ownerToRecipientsPlan = [
    {name: "Transfer 1 (Owner -> UserB)", recipient: users.userB, recipientAmounts: [35n, 5n]},
    {name: "Transfer 2 (Owner -> UserC)", recipient: users.userC, recipientAmounts: [33n, 7n]},
    {name: "Transfer 3 (Owner -> UserD)", recipient: users.userD, recipientAmounts: [34n, 6n]},
  ];

  const results = [];
  for (const plan of ownerToRecipientsPlan) {
    const [in0, in1] = popTwoNotes(users.owner.ownerPk);
    in0.allLeavesSnapshot = [...allLeaves];
    in1.allLeavesSnapshot = [...allLeaves];

    const outBlindings = [BigInt(7000 + results.length * 10 + 1), BigInt(7000 + results.length * 10 + 2)];
    const route0 = routeForRecipient(plan.recipient.viewingPub, plan.recipient.routeCursor++);
    const route1 = routeForRecipient(plan.recipient.viewingPub, plan.recipient.routeCursor++);
    const stepResult = await executeTransferStep({
      stepName: plan.name,
      poseidonRW,
      treeRW,
      tokenRW,
      tokenAddress: tokenAddr,
      tokenField,
      spendingKey: users.owner.spendingKey,
      inNotes: [in0, in1],
      recipientPk: plan.recipient.ownerPk,
      recipientViewingPub: plan.recipient.viewingPub,
      recipientAmount: plan.recipientAmounts[0],
      changePk: plan.recipient.ownerPk,
      changeViewingPub: plan.recipient.viewingPub,
      changeAmount: plan.recipientAmounts[1],
      outBlindings,
      routedChannels: [route0.channel, route1.channel],
      routedSubchannels: [route0.subchannel, route1.subchannel],
      fee,
    });

    for (const created of stepResult.created) {
      const index = allLeaves.length;
      allLeaves.push(created.commitment);
      pushNote({
        index,
        commitment: created.commitment,
        amount: created.amount,
        blinding: created.blinding,
        ownerPk: created.ownerPk,
      });
    }
    results.push({name: plan.name, consumed: stepResult.consumed, created: stepResult.created});
  }

  const recipientSpendPlan = [
    {sender: users.userB, recipient: users.userG, sendAmount: 10n},
    {sender: users.userC, recipient: users.userK, sendAmount: 15n},
    {sender: users.userD, recipient: users.userK, sendAmount: 12n},
  ];

  for (let i = 0; i < recipientSpendPlan.length; i += 1) {
    const plan = recipientSpendPlan[i];
    const [in0, in1] = popTwoNotes(plan.sender.ownerPk);
    in0.allLeavesSnapshot = [...allLeaves];
    in1.allLeavesSnapshot = [...allLeaves];
    const totalIn = in0.amount + in1.amount;
    const changeAmount = totalIn - plan.sendAmount - fee;
    if (changeAmount < 0n) throw new Error(`${plan.sender.name}: insufficient balance for planned spend`);
    const outBlindings = [BigInt(9000 + i * 10 + 1), BigInt(9000 + i * 10 + 2)];
    const route0 = routeForRecipient(plan.recipient.viewingPub, plan.recipient.routeCursor++);
    const route1 = routeForRecipient(plan.sender.viewingPub, plan.sender.routeCursor++);
    const stepResult = await executeTransferStep({
      stepName: `Transfer ${4 + i} (${plan.sender.name} -> ${plan.recipient.name})`,
      poseidonRW,
      treeRW,
      tokenRW,
      tokenAddress: tokenAddr,
      tokenField,
      spendingKey: plan.sender.spendingKey,
      inNotes: [in0, in1],
      recipientPk: plan.recipient.ownerPk,
      recipientViewingPub: plan.recipient.viewingPub,
      recipientAmount: plan.sendAmount,
      changePk: plan.sender.ownerPk,
      changeViewingPub: plan.sender.viewingPub,
      changeAmount,
      outBlindings,
      routedChannels: [route0.channel, route1.channel],
      routedSubchannels: [route0.subchannel, route1.subchannel],
      fee,
    });

    for (const created of stepResult.created) {
      const index = allLeaves.length;
      allLeaves.push(created.commitment);
      pushNote({
        index,
        commitment: created.commitment,
        amount: created.amount,
        blinding: created.blinding,
        ownerPk: created.ownerPk,
      });
    }
    results.push({name: `${plan.sender.name}->${plan.recipient.name}`, consumed: stepResult.consumed, created: stepResult.created});
  }

  console.log("\n== Multi-transfer E2E success ==");
  console.log({
    transfersExecuted: results.length,
    finalOwnerUnspentNotes: (notesByOwnerPk.get(ownerPkKey(users.owner.ownerPk)) || []).length,
    finalRoot: await treeRW.getLastRoot(),
    tokenField,
    shieldedToken: explorerAddr(tokenAddr),
  });

  const scanFrom = tokenDeployBlock > 0 ? tokenDeployBlock : 0;
  console.log("\n== Recipient scan/decrypt using viewing keys ==");
  for (const key of ["owner", "userB", "userC", "userD", "userG", "userH", "userK"]) {
    const viewer = users[key];
    const discovered = await scanAndDecryptNotes({
      provider,
      tokenAddress: tokenAddr,
      fromBlock: scanFrom,
      viewer,
      subchannels: [0, 1, 2, 3, 4, 5],
    });
    const summary = await summarizeViewerBalance({
      viewer,
      discovered,
      poseidonRW,
      tokenRW,
    });
    console.log({
      viewer: viewer.name,
      ...summary,
    });
  }

  if (existsSync(shieldStateJsonPath)) {
    try {
      unlinkSync(shieldStateJsonPath);
      console.log(`Removed ${shieldStateJsonPath} after successful transfers`);
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
