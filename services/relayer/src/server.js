import "dotenv/config";
import {createHash, randomUUID} from "node:crypto";
import http from "node:http";
import {ethers} from "ethers";

const port = Number(process.env.RELAYER_PORT || 8787);
const host = "0.0.0.0";
const relayerRpcUrl = process.env.RELAYER_RPC_URL || process.env.LOCAL_RPC_URL || "";
const relayerPrivateKey = process.env.RELAYER_SIGNER_PRIVATE_KEY || process.env.LOCAL_PRIVATE_KEY || "";
const confirmTimeoutMs = Number(process.env.RELAYER_CONFIRM_TIMEOUT_MS || 180_000);
const confirmPollMs = Number(process.env.RELAYER_CONFIRM_POLL_MS || 2_000);

const requests = new Map();
const canSubmitOnchain = Boolean(relayerRpcUrl && relayerPrivateKey);

const SHIELDED_TRANSFER_ABI = [
  "function shieldedTransfer(bytes proof, bytes32[2] nullifiers, bytes32[2] newCommitments, bytes[2] encryptedNotes, bytes32 merkleRoot, bytes32 token, uint64 fee) external",
];

let relayerSigner = null;
if (canSubmitOnchain) {
  const provider = new ethers.JsonRpcProvider(relayerRpcUrl);
  relayerSigner = new ethers.NonceManager(new ethers.Wallet(relayerPrivateKey, provider));
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {"content-type": "application/json"});
  res.end(JSON.stringify(payload));
}

function makeTxHash(requestId, body) {
  return `0x${createHash("sha256").update(`${requestId}:${JSON.stringify(body)}`).digest("hex")}`;
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
  if (typeof body.shieldedToken !== "string" || !ethers.isAddress(body.shieldedToken)) {
    return "Missing or invalid shieldedToken address";
  }
  if (typeof body.merkleRoot !== "string" || !ethers.isHexString(body.merkleRoot, 32)) {
    return "Invalid merkleRoot";
  }
  if (typeof body.token !== "string" || !ethers.isHexString(body.token, 32)) {
    return "Invalid token field";
  }
  return null;
}

async function submitShieldedTransferOnchain(body) {
  const token = new ethers.Contract(body.shieldedToken, SHIELDED_TRANSFER_ABI, relayerSigner);
  const tx = await token.shieldedTransfer(
    body.proof,
    body.nullifiers,
    body.newCommitments,
    body.encryptedNotes,
    body.merkleRoot,
    body.token,
    Number(body.fee ?? 0),
    {gasLimit: body.gasLimit ?? 30_000_000}
  );
  return tx.hash;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReceiptByPolling(txHash) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < confirmTimeoutMs) {
    const receipt = await relayerSigner.provider.getTransactionReceipt(txHash);
    if (receipt) return receipt;
    await sleep(confirmPollMs);
  }
  return null;
}

const server = http.createServer((req, res) => {
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
          void relayerSigner.provider
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
              requests.set(requestId, {
                ...current,
                status: receipt.status === 1 ? "confirmed" : "failed",
                blockNumber: receipt.blockNumber,
              });
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
        const failed = {
          ...record,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        };
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
