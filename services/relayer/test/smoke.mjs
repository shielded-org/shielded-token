import assert from "node:assert/strict";

const base = process.env.RELAYER_URL || "http://localhost:8787";

async function run() {
  const health = await fetch(`${base}/healthz`);
  assert.equal(health.status, 200, "healthz must return 200");

  const transfer = await fetch(`${base}/relay/shielded-transfer`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({
      proof: "0x1234",
      nullifiers: ["0x01", "0x02"],
      newCommitments: ["0x03", "0x04"],
      merkleRoot: "0x05",
      token: "0x06",
      fee: "0",
    }),
  });

  assert.equal(transfer.status, 200, "relay endpoint must return 200");
  const payload = await transfer.json();
  assert.equal(payload.accepted, true, "relay request must be accepted");
  assert.ok(payload.requestId, "requestId must exist");
  assert.ok(payload.txHash, "txHash must exist");

  const status = await fetch(`${base}/relay/status/${payload.requestId}`);
  assert.equal(status.status, 200, "status endpoint must return 200");
}

run().then(
  () => {
    // eslint-disable-next-line no-console
    console.log("Relayer smoke test passed");
  },
  (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  }
);
