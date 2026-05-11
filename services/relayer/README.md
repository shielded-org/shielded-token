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
- `RELAYER_RPC_URL` — default JSON-RPC when `RELAYER_PRIMARY_CHAIN_ID` is unset (defaults to Ethereum Sepolia `11155111`)
- `RELAYER_PRIMARY_CHAIN_ID` — numeric chain id for `RELAYER_RPC_URL` (e.g. `31337` for Anvil)
- `RELAYER_RPC_URL_ETH_SEPOLIA` — RPC for Ethereum Sepolia (`11155111`); required to relay on that chain
- `RELAYER_RPC_URL_BASE_SEPOLIA` — RPC for Base Sepolia (`84532`); required to relay on that chain
- `RELAYER_SIGNER_PRIVATE_KEYS` comma-separated private keys (preferred; round-robin signer selection)
- `RELAYER_SIGNER_PRIVATE_KEY` single-key fallback (legacy)
- `RELAYER_SHIELDED_TRANSFER_GAS_LIMIT` (default `16000000`) — public RPCs such as Sepolia often reject txs above ~16.7M gas

If RPC and signer are not configured, the relayer falls back to stub mode and returns synthetic tx hashes.

## Request payload

Include `chainId` (`11155111` or `84532`) so the relayer selects the correct RPC and signer pool. When omitted, the relayer defaults to Ethereum Sepolia.

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
- `feeRecipientPk` (`bytes32`; per-transfer fee note recipient key)
- optional `gasLimit`
