import {execFileSync} from "node:child_process";
import {readFileSync, writeFileSync} from "node:fs";
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

const LOCAL_RPC_URL = process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545";
const RELAYER_URL = process.env.RELAYER_URL || "http://127.0.0.1:8787";
const RELAYER_CONFIRM_TIMEOUT_MS = Number(process.env.RELAYER_CONFIRM_TIMEOUT_MS || 180_000);
const RELAYER_POLL_INTERVAL_MS = Number(process.env.RELAYER_POLL_INTERVAL_MS || 2_000);
const DEPLOYER_KEY =
  process.env.LOCAL_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const POOL_ABI = [
  "function shieldRouted(address token, uint256 amount, bytes32 commitment, bytes encryptedNote, bytes32 channel, bytes32 subchannel) external",
  "function shieldedTransferRouted(bytes proof, bytes32[2] nullifiers, bytes32[2] newCommitments, bytes[2] encryptedNotes, bytes32[2] channels, bytes32[2] subchannels, bytes32 merkleRoot, bytes32 token, uint256 fee, bytes32 feeRecipientPk) external",
  "function unshield(bytes proof, bytes32 nullifier, address token, address recipient, uint256 amount, bytes32 merkleRoot) external",
  "function nullifierSet(bytes32) external view returns (bool)",
  "event RoutedCommitment(bytes32 indexed channel, bytes32 indexed subchannel, bytes encryptedNote)",
];

const ERC20_ABI = [
  "function mint(address to, uint256 amount) external",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
];

const MERKLE_ABI = [
  "function getLastRoot() external view returns (bytes32)",
  "function isKnownRoot(bytes32 root) external view returns (bool)",
];
const MERKLE_EVENTS_ABI = [
  "event LeafInserted(uint256 indexed index, bytes32 indexed leaf, bytes32 indexed newRoot)",
];

const POSEIDON_ABI = [
  "function hash_2(uint256 x, uint256 y) external pure returns (uint256)",
  "function hash(uint256[] input) external pure returns (uint256)",
];
const KEY_DERIVATION_SEED = process.env.KEY_DERIVATION_SEED || "zkproject-deterministic-seed-v1";
const BN254_FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const SECP256K1_GROUP_ORDER = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

function loadForgeArtifact(relPath) {
  const p = path.join(contractsDir, "out", relPath);
  return JSON.parse(readFileSync(p, "utf8"));
}

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, {cwd, stdio: "inherit"});
}

async function relayShieldedTransfer(bundle) {
  const res = await fetch(`${RELAYER_URL}/relay/shielded-transfer`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify(bundle),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(`Relayer rejected request (${res.status}): ${payload.error || "unknown error"}`);
  return payload;
}

async function relayUnshield(bundle) {
  const res = await fetch(`${RELAYER_URL}/relay/unshield`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify(bundle),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(`Relayer rejected unshield (${res.status}): ${payload.error || "unknown error"}`);
  return payload;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRelayerStatus(requestId) {
  const res = await fetch(`${RELAYER_URL}/relay/status/${requestId}`);
  const payload = await res.json();
  if (!res.ok) throw new Error(`Relayer status fetch failed (${res.status}): ${payload.error || "unknown error"}`);
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

function normalizeSeedToBytes32(seedInput) {
  if (ethers.isHexString(seedInput, 32)) return seedInput;
  if (ethers.isHexString(seedInput)) return ethers.zeroPadValue(seedInput, 32);
  return ethers.keccak256(ethers.toUtf8Bytes(seedInput));
}

function deriveDeterministicScalar(seedBytes32, label, modulus) {
  const digest = ethers.solidityPackedKeccak256(["string", "bytes32", "string"], ["zkproject-key-v1", seedBytes32, label]);
  return (BigInt(digest) % (modulus - 1n)) + 1n;
}

function buildDeterministicUsers(seedBytes32) {
  const names = ["owner", "userB", "userC", "userD", "userG", "userH", "userK", "feeRecipient"];
  const users = {};
  for (const name of names) {
    users[name] = {
      name: name === "feeRecipient" ? "FeeRecipient" : name === "owner" ? "Owner" : name.replace("user", "User"),
      spendingKey: deriveDeterministicScalar(seedBytes32, `${name}:spending`, BN254_FIELD_MODULUS),
      viewingPriv: deriveDeterministicScalar(seedBytes32, `${name}:viewing`, SECP256K1_GROUP_ORDER),
    };
  }
  return users;
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
    const key = hkdfSync("sha256", sharedSecret, hexToBytes(envelope.salt), Buffer.from("zkproject-note-v1"), 32);
    const decipher = createDecipheriv("aes-256-gcm", key, hexToBytes(envelope.iv));
    decipher.setAuthTag(hexToBytes(envelope.tag));
    const plaintext = Buffer.concat([decipher.update(hexToBytes(envelope.ct)), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8"));
  } catch {
    return null;
  }
}

async function scanAndDecryptNotes({provider, poolAddress, fromBlock, viewer, subchannels = [0, 1, 2, 3]}) {
  const iface = new ethers.Interface(POOL_ABI);
  const topic = iface.getEvent("RoutedCommitment").topicHash;
  const channel = ethers.keccak256(viewer.viewingPub);
  const logs = [];
  for (const subIdx of subchannels) {
    const route = routeForRecipient(viewer.viewingPub, subIdx);
    const scoped = await provider.getLogs({
      address: poolAddress,
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
    if (note) discovered.push({blockNumber: log.blockNumber, txHash: log.transactionHash, note});
  }
  return discovered;
}

async function summarizeViewerBalance({viewer, discovered, poseidonRW, poolRW}) {
  let discoveredAmount = 0n;
  let spentAmount = 0n;
  let spendableAmount = 0n;
  let spentNotes = 0;
  let spendableNotes = 0;
  for (const item of discovered) {
    const noteAmount = BigInt(item.note.amount);
    discoveredAmount += noteAmount;
    const nf = await nullifier(poseidonRW, viewer.spendingKey, item.note.commitment);
    const isSpent = await poolRW.nullifierSet(nf);
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
  const out = await poseidon.hash([owner, parseHexToBigInt(tokenField), amount, blinding]);
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
  for (let i = 0; i < leaves.length; i += 1) current.set(i, parseHexToBigInt(leaves[i]));
  levels.push(current);
  for (let level = 0; level < depth; level += 1) {
    const next = new Map();
    const parentIndices = new Set();
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

async function loadAllLeavesFromTree(provider, treeAddress, fromBlock) {
  const iface = new ethers.Interface(MERKLE_EVENTS_ABI);
  const topic = iface.getEvent("LeafInserted").topicHash;
  const logs = await provider.getLogs({
    address: treeAddress,
    fromBlock,
    toBlock: "latest",
    topics: [topic],
  });
  const leaves = [];
  for (const log of logs) {
    const parsed = iface.parseLog(log);
    if (!parsed) continue;
    leaves[Number(parsed.args.index)] = parsed.args.leaf;
  }
  return leaves.filter(Boolean);
}

function findLeafIndex(allLeaves, commitment) {
  return allLeaves.findIndex((leaf) => leaf.toLowerCase() === commitment.toLowerCase());
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
  return {root, siblings, directions};
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
fee_recipient_pk = "${payload.fee_recipient_pk}"
mode = "${payload.mode ?? "0"}"
unshield_recipient = "${payload.unshield_recipient ?? "0x0000000000000000000000000000000000000000000000000000000000000000"}"
unshield_amount = "${payload.unshield_amount ?? "0"}"
unshield_token_address = "${payload.unshield_token_address ?? "0x0000000000000000000000000000000000000000000000000000000000000000"}"
`.trimStart();
  writeFileSync(path.join(circuitsDir, "Prover.toml"), toml, "utf8");
}

function readProofHex() {
  const proofWithPublicInputs = readFileSync(path.join(circuitsDir, "target", "proof"));
  const proofWithoutPublicInputs = proofWithPublicInputs.subarray(12 * 32);
  return `0x${proofWithoutPublicInputs.toString("hex")}`;
}

function computeTransferFee(amount) {
  return (amount * 5n) / 1000n; // 0.5%
}

async function executeTransferStep({
  stepName,
  poseidonRW,
  treeRW,
  poolRW,
  poolAddress,
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
  feeRecipientPk,
  poolDeployBlock,
}) {
  const inCommitments = [inNotes[0].commitment, inNotes[1].commitment];
  const inAmounts = [inNotes[0].amount, inNotes[1].amount];
  const inBlindings = [inNotes[0].blinding, inNotes[1].blinding];
  const nullifier0 = await nullifier(poseidonRW, spendingKey, inCommitments[0]);
  const nullifier1 = await nullifier(poseidonRW, spendingKey, inCommitments[1]);
  const outCommitment0 = await noteCommitment(poseidonRW, recipientPk, tokenField, recipientAmount, outBlindings[0]);
  const outCommitment1 = await noteCommitment(poseidonRW, changePk, tokenField, changeAmount, outBlindings[1]);
  const encryptedNote0 = encryptNoteECDH(
    {token: tokenField, amount: recipientAmount.toString(), blinding: toHex32(outBlindings[0]), commitment: outCommitment0},
    recipientViewingPub
  );
  const encryptedNote1 = encryptNoteECDH(
    {token: tokenField, amount: changeAmount.toString(), blinding: toHex32(outBlindings[1]), commitment: outCommitment1},
    changeViewingPub
  );

  const rootOnChain = await treeRW.getLastRoot();
  if (!(await treeRW.isKnownRoot(rootOnChain))) throw new Error(`${stepName}: root is unknown`);
  const allLeaves = await loadAllLeavesFromTree(
    treeRW.runner.provider,
    await treeRW.getAddress(),
    poolDeployBlock
  );
  if ((allLeaves[inNotes[0].index] || "").toLowerCase() !== inNotes[0].commitment.toLowerCase()) {
    throw new Error(
      `${stepName}: input0 commitment/index mismatch (idx=${inNotes[0].index})`
    );
  }
  if ((allLeaves[inNotes[1].index] || "").toLowerCase() !== inNotes[1].commitment.toLowerCase()) {
    throw new Error(
      `${stepName}: input1 commitment/index mismatch (idx=${inNotes[1].index})`
    );
  }
  const {levels, zeroes} = await buildLevelMaps(poseidonRW, allLeaves, 20);
  const path0 = extractPath(levels, zeroes, inNotes[0].index, 20);
  const path1 = extractPath(levels, zeroes, inNotes[1].index, 20);
  if (path0.root.toLowerCase() !== rootOnChain.toLowerCase()) {
    throw new Error(`${stepName}: computed root ${path0.root} != on-chain root ${rootOnChain}`);
  }

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
    fee_recipient_pk: feeRecipientPk,
    mode: "0",
    unshield_recipient: "0x0000000000000000000000000000000000000000000000000000000000000000",
    unshield_amount: "0",
    unshield_token_address: "0x0000000000000000000000000000000000000000000000000000000000000000",
  });

  console.log(`\n== ${stepName}: generating proof ==`);
  run("nargo", ["execute", "witness"], circuitsDir);
  run("bb", ["prove", "-b", "target/shielded_transfer.json", "-w", "target/witness.gz", "-o", "target/proof"], circuitsDir);
  const proofHex = readProofHex();

  const relayerResult = await relayShieldedTransfer({
    shieldedTarget: poolAddress,
    proof: proofHex,
    nullifiers: [nullifier0, nullifier1],
    newCommitments: [outCommitment0, outCommitment1],
    encryptedNotes: [encryptedNote0, encryptedNote1],
    channels: routedChannels,
    subchannels: routedSubchannels,
    merkleRoot: rootOnChain,
    token: tokenField,
    fee: fee.toString(),
    feeRecipientPk,
    gasLimit: Number(process.env.SHIELDED_TRANSFER_GAS_LIMIT || 16_000_000),
  });
  const confirmedStatus = await waitForRelayerConfirmation(relayerResult.requestId);
  console.log(`== ${stepName}: confirmed ==`, {txHash: confirmedStatus.txHash ?? relayerResult.txHash});

  return {
    created: [
      {commitment: outCommitment0, amount: recipientAmount, blinding: outBlindings[0], ownerPk: recipientPk},
      {commitment: outCommitment1, amount: changeAmount, blinding: outBlindings[1], ownerPk: changePk},
    ],
  };
}

async function executeUnshieldStep({
  stepName,
  poseidonRW,
  treeRW,
  poolRW,
  poolAddress,
  tokenField,
  tokenAddress,
  spendingKey,
  inNote,
  recipient,
  poolDeployBlock,
}) {
  const nf = await nullifier(poseidonRW, spendingKey, inNote.commitment);
  const rootOnChain = await treeRW.getLastRoot();
  if (!(await treeRW.isKnownRoot(rootOnChain))) throw new Error(`${stepName}: root is unknown`);
  const allLeaves = await loadAllLeavesFromTree(
    treeRW.runner.provider,
    await treeRW.getAddress(),
    poolDeployBlock
  );
  const {levels, zeroes} = await buildLevelMaps(poseidonRW, allLeaves, 20);
  const path = extractPath(levels, zeroes, inNote.index, 20);
  if (path.root.toLowerCase() !== rootOnChain.toLowerCase()) {
    throw new Error(`${stepName}: computed root ${path.root} != on-chain root ${rootOnChain}`);
  }
  writeProverToml({
    spending_key: spendingKey.toString(),
    in_amounts: [inNote.amount.toString(), "0"],
    in_blindings: [toHex32(inNote.blinding), "0x0000000000000000000000000000000000000000000000000000000000000000"],
    merkle_siblings: [path.siblings, new Array(20).fill("0x0000000000000000000000000000000000000000000000000000000000000000")],
    merkle_directions: [path.directions, new Array(20).fill(false)],
    out_amounts: ["0", "0"],
    out_recipient_pks: ["0x0000000000000000000000000000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000000000000000000000000000"],
    out_blindings: ["0x0000000000000000000000000000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000000000000000000000000000"],
    token: tokenField,
    merkle_root: rootOnChain,
    nullifiers: [nf, "0x0000000000000000000000000000000000000000000000000000000000000000"],
    out_commitments: ["0x0000000000000000000000000000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000000000000000000000000000"],
    fee: "0",
    fee_recipient_pk: "0x0000000000000000000000000000000000000000000000000000000000000000",
    mode: "1",
    unshield_recipient: toHex32(BigInt(recipient)),
    unshield_amount: inNote.amount.toString(),
    unshield_token_address: toHex32(tokenAddress),
  });

  console.log(`\n== ${stepName}: generating proof ==`);
  run("nargo", ["execute", "witness"], circuitsDir);
  run("bb", ["prove", "-b", "target/shielded_transfer.json", "-w", "target/witness.gz", "-o", "target/proof"], circuitsDir);
  const proofHex = readProofHex();

  const relayerResult = await relayUnshield({
    shieldedTarget: poolAddress,
    proof: proofHex,
    nullifier: nf,
    token: tokenAddress,
    recipient,
    amount: inNote.amount.toString(),
    merkleRoot: rootOnChain,
    gasLimit: Number(process.env.SHIELDED_TRANSFER_GAS_LIMIT || 16_000_000),
  });
  const confirmedStatus = await waitForRelayerConfirmation(relayerResult.requestId);
  console.log(`== ${stepName}: confirmed ==`, {txHash: confirmedStatus.txHash ?? relayerResult.txHash});
  return {nullifier: nf, amount: inNote.amount};
}

async function main() {
  console.log("== Building contracts and circuit ==");
  run("nargo", ["compile"], circuitsDir);
  run("bb", ["write_vk", "-b", "target/shielded_transfer.json", "-o", "target/vk"], circuitsDir);
  run("bb", ["contract", "-k", "target/vk", "-o", "target/contract.sol"], circuitsDir);
  writeFileSync(path.join(contractsDir, "src", "HonkVerifier.sol"), readFileSync(path.join(circuitsDir, "target", "contract.sol"), "utf8"));
  run("forge", ["build"], contractsDir);

  const provider = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
  const signer = new ethers.NonceManager(new ethers.Wallet(DEPLOYER_KEY, provider));
  const deployerAddress = await signer.getAddress();
  console.log(`Using local chain: ${LOCAL_RPC_URL}`);
  console.log(`Deployer: ${deployerAddress}`);

  const poseidonFactory = new ethers.ContractFactory(
    loadForgeArtifact("Poseidon2.sol/Poseidon2.json").abi,
    loadForgeArtifact("Poseidon2.sol/Poseidon2.json").bytecode.object,
    signer
  );
  const poseidon = await poseidonFactory.deploy();
  await poseidon.waitForDeployment();
  const poseidonAddress = await poseidon.getAddress();
  const poseidonRW = new ethers.Contract(poseidonAddress, POSEIDON_ABI, provider);

  const hasherFactory = new ethers.ContractFactory(
    loadForgeArtifact("Poseidon2YulHasher.sol/Poseidon2YulHasher.json").abi,
    loadForgeArtifact("Poseidon2YulHasher.sol/Poseidon2YulHasher.json").bytecode.object,
    signer
  );
  const hasher = await hasherFactory.deploy(poseidonAddress);
  await hasher.waitForDeployment();
  const hasherAddress = await hasher.getAddress();

  const verifierFactory = new ethers.ContractFactory(
    loadForgeArtifact("HonkVerifier.sol/UltraVerifier.json").abi,
    loadForgeArtifact("HonkVerifier.sol/UltraVerifier.json").bytecode.object,
    signer
  );
  const verifier = await verifierFactory.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();

  const treeFactory = new ethers.ContractFactory(
    loadForgeArtifact("IncrementalMerkleTree.sol/IncrementalMerkleTree.json").abi,
    loadForgeArtifact("IncrementalMerkleTree.sol/IncrementalMerkleTree.json").bytecode.object,
    signer
  );
  const tree = await treeFactory.deploy(hasherAddress);
  await tree.waitForDeployment();
  const treeAddress = await tree.getAddress();

  const erc20Factory = new ethers.ContractFactory(
    loadForgeArtifact("MockERC20.sol/MockERC20.json").abi,
    loadForgeArtifact("MockERC20.sol/MockERC20.json").bytecode.object,
    signer
  );
  const mockToken = await erc20Factory.deploy();
  await mockToken.waitForDeployment();
  const mockTokenAddress = await mockToken.getAddress();
  const mockRW = new ethers.Contract(mockTokenAddress, ERC20_ABI, signer);
  await (await mockRW.mint(deployerAddress, ethers.parseEther("1000"))).wait();

  const poolFactory = new ethers.ContractFactory(
    loadForgeArtifact("ShieldedERC20Pool.sol/ShieldedERC20Pool.json").abi,
    loadForgeArtifact("ShieldedERC20Pool.sol/ShieldedERC20Pool.json").bytecode.object,
    signer
  );
  const pool = await poolFactory.deploy(verifierAddress, treeAddress, deployerAddress, [mockTokenAddress]);
  await pool.waitForDeployment();
  const poolAddress = await pool.getAddress();
  const poolDeployReceipt = await pool.deploymentTransaction().wait();
  const poolDeployBlock = poolDeployReceipt?.blockNumber ?? 0;
  const poolRW = new ethers.Contract(poolAddress, POOL_ABI, signer);
  const treeRW = new ethers.Contract(treeAddress, MERKLE_ABI, signer);
  const tokenField = toHex32(mockTokenAddress);
  await (await mockRW.approve(poolAddress, ethers.parseEther("1000"))).wait();

  const users = buildDeterministicUsers(normalizeSeedToBytes32(KEY_DERIVATION_SEED));
  for (const user of Object.values(users)) {
    user.ownerPk = parseHexToBigInt(await poseidonHash2(poseidonRW, user.spendingKey, 1n));
    user.viewingPub = viewingPrivToPub(user.viewingPriv);
    user.routeCursor = 0;
  }
  const feeRecipientPk = toHex32(users.feeRecipient.ownerPk);
  const feeRecipientSpendingKey = users.feeRecipient.spendingKey;
  const allLeaves = [];
  const notesByOwnerPk = new Map();
  const ownerPkKey = (ownerPk) => toHex32(ownerPk).toLowerCase();
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
  const popOneNote = (ownerPk) => {
    const key = ownerPkKey(ownerPk);
    const existing = notesByOwnerPk.get(key) || [];
    if (existing.length < 1) throw new Error(`Not enough notes for ${key}`);
    const first = existing.shift();
    notesByOwnerPk.set(key, existing);
    return first;
  };

  console.log("== Shielding six owner notes into ERC20 pool ==");
  for (const [i, spec] of [
    {amount: 120n, blinding: 1111n},
    {amount: 120n, blinding: 2222n},
    {amount: 120n, blinding: 3333n},
    {amount: 120n, blinding: 4444n},
    {amount: 120n, blinding: 5555n},
    {amount: 120n, blinding: 6666n},
  ].entries()) {
    const commitment = await noteCommitment(poseidonRW, users.owner.ownerPk, tokenField, spec.amount, spec.blinding);
    const encryptedDepositNote = encryptNoteECDH(
      {token: tokenField, amount: spec.amount.toString(), blinding: toHex32(spec.blinding), commitment},
      users.owner.viewingPub
    );
    const route = routeForRecipient(users.owner.viewingPub, users.owner.routeCursor++);
    await (await poolRW.shieldRouted(mockTokenAddress, spec.amount, commitment, encryptedDepositNote, route.channel, route.subchannel)).wait();
    const leavesAfter = await loadAllLeavesFromTree(provider, treeAddress, poolDeployBlock);
    const index = findLeafIndex(leavesAfter, commitment);
    if (index < 0) throw new Error(`Could not resolve inserted leaf index for shielded note #${i + 1}`);
    allLeaves.splice(0, allLeaves.length, ...leavesAfter);
    pushNote({index, commitment, amount: spec.amount, blinding: spec.blinding, ownerPk: users.owner.ownerPk});
    console.log(`Shielded note #${i + 1}: inserted`);
  }

  run("bb", ["write_vk", "-b", "target/shielded_transfer.json", "-o", "target/vk"], circuitsDir);

  const ownerToRecipientsPlan = [
    {name: "Transfer 1 (Owner -> UserB)", recipient: users.userB, recipientAmounts: [120n, 120n]},
    {name: "Transfer 2 (Owner -> UserC)", recipient: users.userC, recipientAmounts: [120n, 120n]},
    {name: "Transfer 3 (Owner -> UserD)", recipient: users.userD, recipientAmounts: [120n, 120n]},
  ];

  for (const plan of ownerToRecipientsPlan) {
    const [in0, in1] = popTwoNotes(users.owner.ownerPk);
    in0.allLeavesSnapshot = [...allLeaves];
    in1.allLeavesSnapshot = [...allLeaves];
    const transferFee = computeTransferFee(plan.recipientAmounts[0]);
    const outBlindings = [BigInt(7000 + allLeaves.length + 1), BigInt(7000 + allLeaves.length + 2)];
    const route0 = routeForRecipient(plan.recipient.viewingPub, plan.recipient.routeCursor++);
    const route1 = routeForRecipient(plan.recipient.viewingPub, plan.recipient.routeCursor++);
    const stepResult = await executeTransferStep({
      stepName: plan.name,
      poseidonRW,
      treeRW,
      poolRW,
      poolAddress,
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
      fee: transferFee,
      feeRecipientPk,
      poolDeployBlock,
    });
    for (const created of stepResult.created) {
      const leavesAfter = await loadAllLeavesFromTree(provider, treeAddress, poolDeployBlock);
      const index = findLeafIndex(leavesAfter, created.commitment);
      if (index < 0) throw new Error(`Could not resolve inserted leaf index for ${plan.name}`);
      allLeaves.splice(0, allLeaves.length, ...leavesAfter);
      pushNote({...created, index});
    }
  }

  const recipientSpendPlan = [
    {sender: users.userB, recipient: users.userG, sendAmount: 239n},
    {sender: users.userC, recipient: users.userK, sendAmount: 239n},
    {sender: users.userD, recipient: users.userK, sendAmount: 239n},
  ];
  for (const [i, plan] of recipientSpendPlan.entries()) {
    const [in0, in1] = popTwoNotes(plan.sender.ownerPk);
    in0.allLeavesSnapshot = [...allLeaves];
    in1.allLeavesSnapshot = [...allLeaves];
    const transferFee = computeTransferFee(plan.sendAmount);
    const totalIn = in0.amount + in1.amount;
    const paysFeeAsSecondOutput = transferFee > 0n;
    const changeAmount = paysFeeAsSecondOutput ? transferFee : totalIn - plan.sendAmount - transferFee;
    const changePk = paysFeeAsSecondOutput ? users.feeRecipient.ownerPk : plan.sender.ownerPk;
    const changeViewingPub = paysFeeAsSecondOutput ? users.feeRecipient.viewingPub : plan.sender.viewingPub;
    if (paysFeeAsSecondOutput && totalIn !== plan.sendAmount + transferFee) {
      throw new Error(`${plan.sender.name}: inputs must equal sendAmount + fee when fee output note is required`);
    }
    const outBlindings = [BigInt(9000 + i * 10 + 1), BigInt(9000 + i * 10 + 2)];
    const route0 = routeForRecipient(plan.recipient.viewingPub, plan.recipient.routeCursor++);
    const route1 = paysFeeAsSecondOutput
      ? routeForRecipient(users.feeRecipient.viewingPub, users.feeRecipient.routeCursor++)
      : routeForRecipient(plan.sender.viewingPub, plan.sender.routeCursor++);
    const stepResult = await executeTransferStep({
      stepName: `Transfer ${4 + i} (${plan.sender.name} -> ${plan.recipient.name})`,
      poseidonRW,
      treeRW,
      poolRW,
      poolAddress,
      tokenField,
      spendingKey: plan.sender.spendingKey,
      inNotes: [in0, in1],
      recipientPk: plan.recipient.ownerPk,
      recipientViewingPub: plan.recipient.viewingPub,
      recipientAmount: plan.sendAmount,
      changePk,
      changeViewingPub,
      changeAmount,
      outBlindings,
      routedChannels: [route0.channel, route1.channel],
      routedSubchannels: [route0.subchannel, route1.subchannel],
      fee: transferFee,
      feeRecipientPk,
      poolDeployBlock,
    });
    for (const created of stepResult.created) {
      const leavesAfter = await loadAllLeavesFromTree(provider, treeAddress, poolDeployBlock);
      const index = findLeafIndex(leavesAfter, created.commitment);
      if (index < 0) throw new Error(`Could not resolve inserted leaf index for Transfer ${4 + i}`);
      allLeaves.splice(0, allLeaves.length, ...leavesAfter);
      pushNote({...created, index});
    }
  }

  const unshieldSender = users.userG;
  const unshieldNote = popOneNote(unshieldSender.ownerPk);
  unshieldNote.allLeavesSnapshot = [...allLeaves];
  const recipientBefore = await mockRW.balanceOf(deployerAddress);
  const unshieldResult = await executeUnshieldStep({
    stepName: `Unshield (UserG -> ${deployerAddress})`,
    poseidonRW,
    treeRW,
    poolRW,
    poolAddress,
    tokenField,
    tokenAddress: mockTokenAddress,
    spendingKey: unshieldSender.spendingKey,
    inNote: unshieldNote,
    recipient: deployerAddress,
    poolDeployBlock,
  });
  const recipientAfter = await mockRW.balanceOf(deployerAddress);
  if (recipientAfter - recipientBefore !== unshieldResult.amount) {
    throw new Error(`Unshield amount mismatch: expected ${unshieldResult.amount}, got ${recipientAfter - recipientBefore}`);
  }
  if (!(await poolRW.nullifierSet(unshieldResult.nullifier))) {
    throw new Error("Unshield nullifier was not marked spent");
  }
  console.log("== Unshield success ==", {
    sender: unshieldSender.name,
    recipient: deployerAddress,
    amount: unshieldResult.amount.toString(),
  });

  const feeNotes = notesByOwnerPk.get(ownerPkKey(BigInt(feeRecipientPk))) || [];
  let spendableFeeAmount = 0n;
  let spentFeeAmount = 0n;
  let spendableFeeNotes = 0;
  let spentFeeNotes = 0;
  for (const note of feeNotes) {
    const nf = await nullifier(poseidonRW, feeRecipientSpendingKey, note.commitment);
    const isSpent = await poolRW.nullifierSet(nf);
    if (isSpent) {
      spentFeeNotes += 1;
      spentFeeAmount += note.amount;
    } else {
      spendableFeeNotes += 1;
      spendableFeeAmount += note.amount;
    }
  }

  console.log("\n== ERC20 Pool multi-transfer E2E success ==");
  console.log({
    poolAddress,
    mockTokenAddress,
    finalRoot: await treeRW.getLastRoot(),
  });
  console.log("\n== Fee summary ==");
  console.log({
    configuredFeeRateBps: "50",
    feeRecipientPk,
    generatedFeeNotes: feeNotes.length,
    generatedFeeAmount: feeNotes.reduce((sum, n) => sum + n.amount, 0n).toString(),
    spendableFeeNotes,
    spendableFeeAmount: spendableFeeAmount.toString(),
    spentFeeNotes,
    spentFeeAmount: spentFeeAmount.toString(),
    spendabilityCheck: "nullifier-checked",
  });

  console.log("\n== Recipient scan/decrypt using viewing keys ==");
  for (const key of ["owner", "userB", "userC", "userD", "userG", "userH", "userK", "feeRecipient"]) {
    const viewer = users[key];
    const discovered = await scanAndDecryptNotes({
      provider,
      poolAddress,
      fromBlock: poolDeployBlock,
      viewer,
      subchannels: [0, 1, 2, 3, 4, 5],
    });
    const summary = await summarizeViewerBalance({viewer, discovered, poseidonRW, poolRW});
    console.log({viewer: viewer.name, ...summary});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
