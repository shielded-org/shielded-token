import "dotenv/config";
import {createHash, randomUUID} from "node:crypto";
import http from "node:http";
import {ethers} from "ethers";

const port = Number(process.env.RELAYER_PORT || 8787);
const host = "0.0.0.0";
const relayerRpcUrl = process.env.RELAYER_RPC_URL || process.env.LOCAL_RPC_URL || "";
const relayerPrivateKeysRaw = process.env.RELAYER_SIGNER_PRIVATE_KEYS || process.env.RELAYER_SIGNER_PRIVATE_KEY || "";
const relayerPrivateKeys = relayerPrivateKeysRaw
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const confirmTimeoutMs = Number(process.env.RELAYER_CONFIRM_TIMEOUT_MS || 180_000);
const confirmPollMs = Number(process.env.RELAYER_CONFIRM_POLL_MS || 2_000);
/** Sepolia / many RPCs cap block gas target; raw tx gasLimit must stay under ~16.7M. */
const defaultShieldedTransferGasLimit = Number(process.env.RELAYER_SHIELDED_TRANSFER_GAS_LIMIT || 16_000_000);

const requests = new Map();
const canSubmitOnchain = Boolean(relayerRpcUrl && relayerPrivateKeys.length > 0);

const SHIELDED_TRANSFER_ABI = [
  "function shieldedTransferRouted(bytes proof, bytes32[2] nullifiers, bytes32[2] newCommitments, bytes[2] encryptedNotes, bytes32[2] channels, bytes32[2] subchannels, bytes32 merkleRoot, bytes32 token, uint256 fee, bytes32 feeRecipientPk) external",
];
const UNSHIELD_ABI = [
  "function unshield(bytes proof, bytes32 nullifier, address token, address recipient, uint256 amount, bytes32 merkleRoot, bytes32 newCommitment, bytes encryptedNote, bytes32 channel, bytes32 subchannel) external",
];

const HONK_ERROR_SELECTORS = {
  "0x7e5769bf": "INVALID_VERIFICATION_KEY()",
  "0xa3dad654": "POINT_NOT_ON_CURVE()",
  "0x7667dc9b": "PUBLIC_INPUT_COUNT_INVALID(uint256,uint256)",
  "0xeba9f4a6": "PUBLIC_INPUT_INVALID_BN128_G1_POINT()",
  "0x374a972f": "PUBLIC_INPUT_GE_P()",
  "0xf894a7bc": "MOD_EXP_FAILURE()",
  "0x01882d81": "PAIRING_PREAMBLE_FAILED()",
  "0x4e719763": "OPENING_COMMITMENT_FAILED()",
  "0xd71fd263": "PAIRING_FAILED()",
};

let relayerSigners = [];
let signerCursor = 0;
if (canSubmitOnchain) {
  const provider = new ethers.JsonRpcProvider(relayerRpcUrl);
  relayerSigners = relayerPrivateKeys.map((pk) => new ethers.NonceManager(new ethers.Wallet(pk, provider)));
}

function pickRelayerSigner() {
  if (relayerSigners.length === 0) return null;
  const signer = relayerSigners[signerCursor % relayerSigners.length];
  signerCursor += 1;
  return signer;
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(payload));
}

function makeTxHash(requestId, body) {
  return `0x${createHash("sha256").update(`${requestId}:${JSON.stringify(body)}`).digest("hex")}`;
}

function toReasonableHex(input, bytes = 8) {
  if (typeof input !== "string" || !input.startsWith("0x")) return null;
  return input.length > 2 + bytes * 2 ? `${input.slice(0, 2 + bytes * 2)}...` : input;
}

function extractRevertData(error) {
  const direct = error?.data;
  if (typeof direct === "string" && direct.startsWith("0x")) return direct;
  const nested = error?.info?.error?.data;
  if (typeof nested === "string" && nested.startsWith("0x")) return nested;
  return null;
}

function isInsufficientFundsError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    error?.code === "INSUFFICIENT_FUNDS" ||
    /insufficient funds for gas \* price \+ value/i.test(message)
  );
}

function buildBundleDebug(body) {
  const proof = body?.proof;
  const proofHex = typeof proof === "string" && proof.startsWith("0x") ? proof : null;
  return {
    proofBytes: proofHex ? (proofHex.length - 2) / 2 : null,
    proofPrefix: toReasonableHex(proofHex, 16),
    nullifier0: toReasonableHex(body?.nullifiers?.[0]),
    nullifier1: toReasonableHex(body?.nullifiers?.[1]),
    commitment0: toReasonableHex(body?.newCommitments?.[0]),
    commitment1: toReasonableHex(body?.newCommitments?.[1]),
    merkleRoot: toReasonableHex(body?.merkleRoot, 16),
    token: toReasonableHex(body?.token, 16),
    fee: body?.fee != null ? String(body.fee) : null,
    feeRecipientPk: toReasonableHex(body?.feeRecipientPk, 16),
  };
}

function validatePayload(body) {
  if (!body || typeof body !== "object") return "Missing payload";
  if (!body.proof || !Array.isArray(body.nullifiers) || !Array.isArray(body.newCommitments)) {
    return "Invalid proof bundle shape";
  }
  if (!Array.isArray(body.encryptedNotes)) {
    return "Missing encryptedNotes";
  }
  if (body.nullifiers.length !== 2 || body.newCommitments.length !== 2 || body.encryptedNotes.length !== 2) {
    return "Expected 2 nullifiers, 2 commitments, and 2 encrypted notes";
  }
  const target = body.shieldedTarget ?? body.shieldedToken;
  if (typeof target !== "string" || !ethers.isAddress(target)) {
    return "Missing or invalid shieldedTarget address";
  }
  if (typeof body.merkleRoot !== "string" || !ethers.isHexString(body.merkleRoot, 32)) {
    return "Invalid merkleRoot";
  }
  if (typeof body.token !== "string" || !ethers.isHexString(body.token, 32)) {
    return "Invalid token field";
  }
  if (typeof body.feeRecipientPk !== "string" || !ethers.isHexString(body.feeRecipientPk, 32)) {
    return "Invalid feeRecipientPk";
  }
  if (!Array.isArray(body.channels) || !Array.isArray(body.subchannels)) {
    return "channels/subchannels arrays are required";
  }
  if (body.channels.length !== 2 || body.subchannels.length !== 2) {
    return "Expected 2 channels and 2 subchannels";
  }
  for (const item of [...body.channels, ...body.subchannels]) {
    if (typeof item !== "string" || !ethers.isHexString(item, 32)) {
      return "channels/subchannels entries must be bytes32 hex strings";
    }
  }
  return null;
}

function validateUnshieldPayload(body) {
  if (!body || typeof body !== "object") return "Missing payload";
  if (typeof body.proof !== "string" || !body.proof.startsWith("0x")) return "Invalid proof";
  const target = body.shieldedTarget ?? body.shieldedToken;
  if (typeof target !== "string" || !ethers.isAddress(target)) return "Missing or invalid shieldedTarget address";
  if (typeof body.nullifier !== "string" || !ethers.isHexString(body.nullifier, 32)) return "Invalid nullifier";
  if (typeof body.merkleRoot !== "string" || !ethers.isHexString(body.merkleRoot, 32)) return "Invalid merkleRoot";
  if (typeof body.token !== "string" || !ethers.isAddress(body.token)) return "Invalid token address";
  if (typeof body.recipient !== "string" || !ethers.isAddress(body.recipient)) return "Invalid recipient address";
  if (body.amount == null) return "Missing amount";
  if (body.newCommitment != null && (typeof body.newCommitment !== "string" || !ethers.isHexString(body.newCommitment, 32))) {
    return "Invalid newCommitment";
  }
  if (body.channel != null && (typeof body.channel !== "string" || !ethers.isHexString(body.channel, 32))) {
    return "Invalid channel";
  }
  if (body.subchannel != null && (typeof body.subchannel !== "string" || !ethers.isHexString(body.subchannel, 32))) {
    return "Invalid subchannel";
  }
  if (body.encryptedNote != null && (typeof body.encryptedNote !== "string" || !body.encryptedNote.startsWith("0x"))) {
    return "Invalid encryptedNote";
  }
  return null;
}

async function submitShieldedTransferOnchain(body) {
  const target = body.shieldedTarget ?? body.shieldedToken;
  if (relayerSigners.length === 0) throw new Error("No relayer signer configured");
  const maxSignerAttempts = Math.max(relayerSigners.length, 1);
  let lastError = null;

  for (let attempt = 0; attempt < maxSignerAttempts; attempt += 1) {
    const signer = pickRelayerSigner();
    if (!signer) break;
    const contract = new ethers.Contract(target, SHIELDED_TRANSFER_ABI, signer);
    const sendShieldedTransfer = async () =>
      await contract.shieldedTransferRouted(
        body.proof,
        body.nullifiers,
        body.newCommitments,
        body.encryptedNotes,
        body.channels,
        body.subchannels,
        body.merkleRoot,
        body.token,
        BigInt(body.fee ?? 0),
        body.feeRecipientPk,
        {gasLimit: body.gasLimit ?? defaultShieldedTransferGasLimit}
      );

    try {
      const tx = await sendShieldedTransfer();
      return tx.hash;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error?.code;
      if (code === "NONCE_EXPIRED" || /nonce too low|nonce has already been used/i.test(message)) {
        signer.reset();
        try {
          const tx = await sendShieldedTransfer();
          return tx.hash;
        } catch (retryError) {
          lastError = retryError;
          if (isInsufficientFundsError(retryError)) continue;
          throw retryError;
        }
      }
      lastError = error;
      if (isInsufficientFundsError(error)) continue;
      const revertData = extractRevertData(error);
      const selector = revertData ? revertData.slice(0, 10).toLowerCase() : null;
      const enriched = new Error(message);
      enriched.code = code;
      enriched.revertData = revertData;
      enriched.revertSelector = selector;
      enriched.revertName = selector ? HONK_ERROR_SELECTORS[selector] ?? null : null;
      throw enriched;
    }
  }

  if (lastError) throw lastError;
  throw new Error("No relayer signer configured");
}

async function submitUnshieldOnchain(body) {
  const target = body.shieldedTarget ?? body.shieldedToken;
  if (relayerSigners.length === 0) throw new Error("No relayer signer configured");
  let lastError = null;
  const maxSignerAttempts = Math.max(relayerSigners.length, 1);
  for (let attempt = 0; attempt < maxSignerAttempts; attempt += 1) {
    const signer = pickRelayerSigner();
    if (!signer) break;
    const contract = new ethers.Contract(target, UNSHIELD_ABI, signer);
    try {
      const tx = await contract.unshield(
        body.proof,
        body.nullifier,
        body.token,
        body.recipient,
        BigInt(body.amount),
        body.merkleRoot,
        body.newCommitment ?? ethers.ZeroHash,
        body.encryptedNote ?? "0x",
        body.channel ?? ethers.ZeroHash,
        body.subchannel ?? ethers.ZeroHash,
        {gasLimit: body.gasLimit ?? defaultShieldedTransferGasLimit}
      );
      return tx.hash;
    } catch (error) {
      lastError = error;
      if (isInsufficientFundsError(error)) continue;
      throw error;
    }
  }
  if (lastError) throw lastError;
  throw new Error("No relayer signer configured");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReceiptByPolling(txHash) {
  const startedAt = Date.now();
  const provider = relayerSigners[0].provider;
  while (Date.now() - startedAt < confirmTimeoutMs) {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (receipt) return receipt;
    await sleep(confirmPollMs);
  }
  return null;
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/healthz") {
    return json(res, 200, {
      ok: true,
      queueSize: requests.size,
      mode: canSubmitOnchain ? "onchain" : "stub",
    });
  }

  if (req.method === "GET" && req.url?.startsWith("/relay/status/")) {
    const requestId = req.url.split("/").at(-1);
    const status = requests.get(requestId);
    if (!status) return json(res, 404, {error: "Request not found"});
    return json(res, 200, status);
  }

  if (req.method === "GET" && req.url?.startsWith("/relay/status-by-tx/")) {
    const txHash = req.url.split("/").at(-1)?.toLowerCase();
    if (!txHash || !txHash.startsWith("0x")) return json(res, 400, {error: "Invalid tx hash"});
    for (const [, status] of requests) {
      if (typeof status?.txHash === "string" && status.txHash.toLowerCase() === txHash) {
        return json(res, 200, status);
      }
    }
    return json(res, 404, {error: "Request not found for tx hash"});
  }

  if (req.method === "POST" && req.url === "/relay/shielded-transfer") {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        req.destroy();
      }
    });

    req.on("end", async () => {
      let body;
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        return json(res, 400, {accepted: false, error: "Invalid JSON"});
      }

      const err = validatePayload(body);
      if (err) return json(res, 400, {accepted: false, error: err});

      const requestId = randomUUID();
      const record = {
        accepted: true,
        requestId,
        txHash: null,
        status: "queued",
        createdAt: new Date().toISOString(),
        debug: buildBundleDebug(body),
      };
      requests.set(requestId, record);
      try {
        if (canSubmitOnchain) {
          const txHash = await submitShieldedTransferOnchain(body);
          const submitted = {
            ...record,
            txHash,
            status: "submitted",
          };
          requests.set(requestId, submitted);

          // Confirm asynchronously so API does not hang on unstable forks.
          const provider = relayerSigners[0].provider;
          void provider
            .getTransactionReceipt(txHash)
            .then(async (initialReceipt) => {
              if (initialReceipt) return initialReceipt;
              return await waitForReceiptByPolling(txHash);
            })
            .then((receipt) => {
              const current = requests.get(requestId);
              if (!current) return;
              if (!receipt) {
                requests.set(requestId, {
                  ...current,
                  status: "timeout",
                  error: `Timed out waiting for tx receipt after ${confirmTimeoutMs}ms`,
                });
                return;
              }
              if (receipt.status === 1) {
                requests.set(requestId, {
                  ...current,
                  status: "confirmed",
                  blockNumber: receipt.blockNumber,
                });
                return;
              }
              const providerForDiag = relayerSigners[0]?.provider;
              void (async () => {
                let replayError = null;
                let revertData = null;
                let selector = null;
                let selectorName = null;
                if (providerForDiag && current.txHash) {
                  try {
                    const tx = await providerForDiag.getTransaction(current.txHash);
                    if (tx) {
                      await providerForDiag.call({
                        to: tx.to,
                        from: tx.from,
                        data: tx.data,
                        value: tx.value,
                      }, tx.blockNumber ?? "latest");
                    }
                  } catch (err) {
                    replayError = err instanceof Error ? err.message : String(err);
                    revertData = extractRevertData(err);
                    selector = revertData ? revertData.slice(0, 10).toLowerCase() : null;
                    selectorName = selector ? HONK_ERROR_SELECTORS[selector] ?? null : null;
                  }
                }
                const latest = requests.get(requestId);
                if (!latest) return;
                requests.set(requestId, {
                  ...latest,
                  status: "failed",
                  blockNumber: receipt.blockNumber,
                  error: selectorName ? `Execution reverted: ${selectorName}` : "Execution reverted onchain",
                  debug: {
                    ...latest.debug,
                    replayError,
                    revertData: toReasonableHex(revertData, 24),
                    revertSelector: selector,
                    revertSelectorName: selectorName,
                  },
                });
              })().catch(() => {});
            })
            .catch((error) => {
              const current = requests.get(requestId);
              if (!current) return;
              requests.set(requestId, {
                ...current,
                status: "failed",
                error: error instanceof Error ? error.message : String(error),
              });
            });
          return json(res, 200, submitted);
        }

        const txHash = makeTxHash(requestId, body);
        const submitted = {...record, txHash, status: "submitted"};
        requests.set(requestId, submitted);
        return json(res, 200, submitted);
      } catch (error) {
        const selector = error?.revertSelector ?? null;
        const failed = {
          ...record,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          debug: {
            ...buildBundleDebug(body),
            errorCode: error?.code ?? null,
            revertData: toReasonableHex(error?.revertData ?? extractRevertData(error), 24),
            revertSelector: selector,
            revertSelectorName: selector ? HONK_ERROR_SELECTORS[selector] ?? null : null,
          },
        };
        requests.set(requestId, failed);
        return json(res, 500, failed);
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/relay/unshield") {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) req.destroy();
    });
    req.on("end", async () => {
      let body;
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        return json(res, 400, {accepted: false, error: "Invalid JSON"});
      }
      const err = validateUnshieldPayload(body);
      if (err) return json(res, 400, {accepted: false, error: err});

      const requestId = randomUUID();
      const record = {
        accepted: true,
        requestId,
        txHash: null,
        status: "queued",
        createdAt: new Date().toISOString(),
        debug: {
          proofBytes: typeof body.proof === "string" ? (body.proof.length - 2) / 2 : null,
          nullifier: toReasonableHex(body.nullifier),
          token: body.token,
          recipient: body.recipient,
          amount: String(body.amount),
          merkleRoot: toReasonableHex(body.merkleRoot),
        },
      };
      requests.set(requestId, record);
      try {
        if (canSubmitOnchain) {
          const txHash = await submitUnshieldOnchain(body);
          const submitted = {...record, txHash, status: "submitted"};
          requests.set(requestId, submitted);
          const provider = relayerSigners[0].provider;
          void provider
            .getTransactionReceipt(txHash)
            .then(async (initialReceipt) => initialReceipt ?? (await waitForReceiptByPolling(txHash)))
            .then((receipt) => {
              const current = requests.get(requestId);
              if (!current) return;
              if (!receipt) {
                requests.set(requestId, {...current, status: "timeout", error: `Timed out waiting for tx receipt after ${confirmTimeoutMs}ms`});
                return;
              }
              requests.set(requestId, {
                ...current,
                status: receipt.status === 1 ? "confirmed" : "failed",
                blockNumber: receipt.blockNumber,
              });
            })
            .catch((error) => {
              const current = requests.get(requestId);
              if (!current) return;
              requests.set(requestId, {...current, status: "failed", error: error instanceof Error ? error.message : String(error)});
            });
          return json(res, 200, submitted);
        }
        const txHash = makeTxHash(requestId, body);
        const submitted = {...record, txHash, status: "submitted"};
        requests.set(requestId, submitted);
        return json(res, 200, submitted);
      } catch (error) {
        const failed = {...record, status: "failed", error: error instanceof Error ? error.message : String(error)};
        requests.set(requestId, failed);
        return json(res, 500, failed);
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/relay/shield") {
    return json(res, 410, {
      accepted: false,
      error: "Relayed shield is disabled: EOA signatures in shield calldata leak depositor identity.",
    });
  }

  return json(res, 404, {error: "Not found"});
});

server.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`Relayer listening on http://${host}:${port}`);
});
