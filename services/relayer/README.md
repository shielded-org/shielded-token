# Relayer Service

Relayer API for private shielded-transfer submission:

- `POST /relay/shielded-transfer` accepts a proof bundle and submits on-chain
- `GET /relay/status/:requestId` returns latest request state
- `GET /healthz` returns health + mode (`onchain` or `stub`)

## Run

```bash
npm run dev --workspace @zkproject/relayer
```

## Environment

- `RELAYER_PORT` (default `8787`)
- `RELAYER_RPC_URL` RPC endpoint used by relayer wallet
- `RELAYER_SIGNER_PRIVATE_KEY` private key used to submit txs
- `RELAYER_SHIELDED_TRANSFER_GAS_LIMIT` (default `16000000`) — public RPCs such as Sepolia often reject txs above ~16.7M gas

If RPC and signer are not configured, the relayer falls back to stub mode and returns synthetic tx hashes.

## Request payload

`POST /relay/shielded-transfer` expects:

- `shieldedTarget` (address; ShieldedToken or ShieldedERC20Pool)
- `shieldedToken` (legacy alias still accepted)
- `proof` (hex bytes)
- `nullifiers` (`bytes32[2]`)
- `newCommitments` (`bytes32[2]`)
- `channels` (`bytes32[2]`)
- `subchannels` (`bytes32[2]`)
- `merkleRoot` (`bytes32`)
- `token` (`bytes32` token field)
- `fee` (`uint64`)
- optional `gasLimit`
