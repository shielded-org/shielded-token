# Shielded Token

Privacy-focused shielded token system for EVM using:

- Noir circuits
- UltraHonk proofs (Barretenberg)
- Solidity verifier/contracts
- Relayer-mediated on-chain submission
- Encrypted note discovery for recipients via viewing keys

This repo supports two deployment patterns:

- **Monolith (`ShieldedToken`)**: a single contract coordinates public ERC20 balances + embedded privacy pool.
- **Multi-token pool (`ShieldedERC20Pool`)**: an external pool contract that can hold and route shielded notes for multiple allowlisted ERC20 tokens.

Both patterns use the same Merkle/nullifier/proof model and routed encrypted note discovery (`RoutedCommitment`).

---

## What this project is

This project demonstrates a shielded token transfer system where in-pool transfers hide sender, receiver, and amount from public observers. The system uses a note-based UTXO model:

- Notes are commitments stored in an on-chain Merkle tree
- Spends are authorized with zero-knowledge proofs
- Double-spend prevention is enforced by nullifiers
- Recipients discover notes by decrypting encrypted note payloads using viewing keys

The architecture is inspired by STRK20-style privacy workflow and adapted to EVM + Noir + UltraHonk.

---

## Privacy model (important)

Inside the private pool (shielded transfers):

- Sender identity is hidden behind relayer submission
- Receiver identity is hidden in encrypted notes
- Amounts are hidden in encrypted notes and witness data
- On-chain records only commitments/nullifiers/roots/proof-related public inputs

At public boundaries (deposit/unshield):

- Boundary actions are on-chain and visible by EVM design
- Deposit/unshield metadata can still be observable at entry/exit points

Shielding and unshielding remain **boundary actions** on a public chain (visible entry/exit), while in-pool transfers aim for strong confidentiality.

---

## Monorepo structure

- `packages/circuits`: Noir circuit (`main.nr`) for shielded transfer constraints
- `packages/contracts`: Foundry contracts (verifier, tree, monolithic `ShieldedToken`, Poseidon helpers)
- `services/relayer`: HTTP relayer for submitting shielded transfers on-chain
- `scripts/hardhat-local-e2e.mjs`: complete local E2E orchestration
- `scripts/sepolia-e2e.mjs`: same flow against Sepolia (deploy or reuse addresses, optional transfers-only)
- `apps/web`: frontend shell (not required for CLI E2E)

---

## Contracts and what they do

### `ShieldedToken.sol` (monolith coordinator)

Single contract combining:

- **ERC20 surface**: `transfer`, `approve`, `transferFrom`, `balanceOf`, `totalSupply` for transparent interoperability
- **Embedded pool**: `shieldRouted`, `shieldedTransferRouted`, `unshield`
- **Nullifier set** and **UltraHonk** verification against the shared Merkle tree
- **`tokenField`**: `bytes32(uint256(uint160(address(this))))` so the Noir circuit binds to this token address
- **`RoutedCommitment(channel, subchannel, encryptedNote)`**: indexed encrypted payloads for channel/subchannel-scoped recipient discovery

### `ShieldedERC20Pool.sol` (multi-token pool)

Standalone privacy pool for existing ERC20s:

- **Token-aware shielding**: `shieldRouted(token, amount, commitment, encryptedNote, channel, subchannel)`
- **Token-bound transfer verification**: `shieldedTransferRouted(..., tokenField, fee)` where `tokenField` must map to an enabled ERC20
- **Unshield to EOA**: `unshield(...)` transfers underlying ERC20 from pool custody to recipient
- **Safety controls**: token allowlist (`enabledToken`), nullifier replay protection, root checks, and non-reentrancy
- **Same routed discovery surface**: emits `RoutedCommitment(channel, subchannel, encryptedNote)` like monolith mode

### `IncrementalMerkleTree.sol`
On-chain note commitment tree.

- Poseidon2-based parent hashing
- Rolling known root window for concurrency tolerance
- Membership roots referenced by proofs

### `HonkVerifier.sol` (generated)
UltraHonk Solidity verifier generated from circuit VK using `bb contract`.

### Poseidon contracts
`Poseidon2`, `Poseidon2YulHasher`, `Poseidon2Hasher` are used to align hashing across circuit + EVM.

---

## Circuit overview (`packages/circuits/src/main.nr`)

The Noir circuit enforces:

- Input note reconstruction from private witnesses
- Merkle membership for each input note
- Nullifier correctness (`Poseidon(spending_key, commitment)`)
- Output commitment correctness
- Conservation rule: sum(inputs) = sum(outputs) + fee
- Distinct nullifiers inside a transfer

Public inputs include:

- token field
- Merkle root
- nullifiers
- output commitments
- fee

Private witness includes secrets (spending key, paths, note amounts/blindings, etc.).

---

## Relayer service

Relayer endpoint:

- `POST /relay/shielded-transfer`

Status endpoint:

- `GET /relay/status/:requestId`

Health endpoint:

- `GET /healthz`

Relayer behavior:

- Accepts proof bundle + commitments/nullifiers/encrypted notes + `channels`/`subchannels`
- Supports both targets:
  - monolith via `shieldedToken` (legacy field)
  - pool/monolith via `shieldedTarget` (preferred field)
- Broadcasts tx with relayer signer
- Polls for receipt and updates request status (`submitted`, `confirmed`, `failed`, `timeout`)

---

## Running the project

### 1) Prerequisites

- Node.js 20+ (22 recommended)
- Foundry (`forge`, `anvil`)
- Noir (`nargo`)
- Barretenberg CLI (`bb`)

### 2) Install dependencies

```bash
npm install
```

### 3) Start local chain

```bash
anvil
```

### 4) Start relayer

Use `services/relayer/.env` (already configured for local Anvil defaults):

- `RELAYER_PORT=8787`
- `RELAYER_RPC_URL=http://127.0.0.1:8545`
- `RELAYER_SIGNER_PRIVATE_KEY=...`
- `RELAYER_URL=http://127.0.0.1:8787`

Run:

```bash
npm run dev:relayer
```

### 5) Run full E2E (local)

```bash
npm run e2e:hardhat-local
```

This script does all of the following:

- Compiles circuit and contracts
- Generates verifier from VK
- Deploys Poseidon/hash adapter/verifier/tree
- Deploys monolithic `ShieldedToken`
- Deposits initial notes via `shieldRouted` (public balance → commitments, routed discovery events)
- Generates and submits routed shielded transfers through relayer
- Waits for on-chain confirmations
- Scans and decrypts recipient notes via viewing keys

### 5b) Sepolia testnet E2E

Fund the deployer account with Sepolia ETH. Point the relayer at the same RPC and chain (`services/relayer` `RELAYER_RPC_URL`, `RELAYER_SIGNER_PRIVATE_KEY` funded on Sepolia). Copy `.env.sepolia.example` to `.env.sepolia`, set `PRIVATE_KEY`, then:

```bash
node --env-file=.env.sepolia scripts/sepolia-e2e.mjs
```

(`npm run e2e:sepolia` runs the same script; export vars or use a shell wrapper if you do not use `--env-file`.)

Required env: `TESTNET_RPC_URL`, `PRIVATE_KEY` (deployer, `0x` optional), and relayer reachable at `RELAYER_URL`.

- **First run (deploy):** omit `SKIP_DEPLOY` / `TRANSFERS_ONLY`. Writes `scripts/sepolia-deployment.json` (gitignored) and `scripts/sepolia-e2e-state.json` after shields (before transfers).
- **Reuse deployment, empty Merkle tree:** `SKIP_DEPLOY=1` with addresses in env or the deployment JSON; runs shields + transfers.
- **Transfers only** (after a run that saved state post-shield, before transfers finished): `TRANSFERS_ONLY=1` plus the same deployment and `scripts/sepolia-e2e-state.json`. On success the state file is removed.

Do not commit `.env` files or private keys. If a key was pasted into chat or committed, rotate it.

### 5c) Local multi-token ERC20 pool E2E

```bash
npm run e2e:hardhat-local-pool
```

This deploys:

- `MockERC20` (underlying token)
- `ShieldedERC20Pool` (multi-token routed privacy pool)
- Poseidon/verifier/tree stack

Then it runs the same routed private transfer flow and balance summary over pool-held ERC20 notes.

### 5d) Sepolia multi-token ERC20 pool E2E

```bash
node --env-file=.env.sepolia scripts/sepolia-erc20-pool-e2e.mjs
```

Or via npm script:

```bash
npm run e2e:sepolia-pool
```

Key env knobs:

- `TESTNET_POOL_TOKEN_ADDRESS` (existing Sepolia ERC20 to use as underlying token)
- `DEPLOY_MOCK_TOKEN=1` (optional demo mode; deploys `MockERC20` on Sepolia)
- `SKIP_DEPLOY=1` (reuse `scripts/sepolia-pool-deployment.json` / `SEPOLIA_POOL_*` env)
- `ETHERSCAN_API_KEY` + `VERIFY_CONTRACTS=1` (optional deploy-time verification)

### 5e) Frontend integration note (multi-token pool)

For app integration with `ShieldedERC20Pool`, keep one wallet state per user:

- Spending key / viewing key material (local, never sent on-chain)
- Decrypted note set grouped by `tokenField`
- Spent-state tracking via nullifier checks
- Merkle sync state from pool events (`Shield`, `ShieldedTransfer`, `RoutedCommitment`)

Existing Merkle trees are expected in production; clients should hydrate from chain/indexer and generate proofs against currently known roots.

---

## User POV walkthrough (transfer lifecycle)

Example: Alice privately sends shielded value to Bob.

1. Alice has existing private notes in local wallet (plus Merkle context).
2. Alice selects input notes to spend.
3. Alice computes nullifiers from spending key + commitments.
4. Alice creates output notes (Bob note + Alice change note).
5. Alice encrypts each output note using ECDH + AEAD with recipient viewing pubkey.
6. Alice generates Noir witness and UltraHonk proof locally.
7. Alice sends proof bundle to relayer over HTTP.
8. Relayer submits `shieldedTransferRouted` on-chain.
9. Pool verifies proof, marks nullifiers spent, inserts commitments, emits encrypted note events.
10. Bob scans `RoutedCommitment` events for his channel/subchannel paths.
11. Bob attempts decrypt with his viewing key.
12. Bob discovers only notes addressed to him and stores them locally for future spends.

---

## Viewing keys and note discovery

Current E2E implements:

- ECDH key agreement (`secp256k1`)
- HKDF-SHA256 key derivation
- AES-256-GCM encryption/decryption

Encrypted note envelope fields:

- `v`: version
- `eph`: ephemeral sender pubkey
- `salt`: HKDF salt
- `iv`: AEAD nonce
- `ct`: ciphertext
- `tag`: AEAD auth tag

Discovery process:

- Query `RoutedCommitment` logs filtered by `(channel, subchannel)` from token deploy block
- Attempt decrypt with recipient viewing private key
- Successful decrypt means note belongs to that recipient

---

## Useful commands

Run contracts tests:

```bash
npm run test:contracts
```

Build contracts:

```bash
npm run build:contracts
```

Compile circuits:

```bash
npm run build:circuits
```

Relayer smoke test:

```bash
npm run test:relayer-smoke
```

---

## Current limitations and next hardening steps

- Deposit and unshield are still public boundary actions.
- E2E currently keeps viewing keys in script memory (demo mode).
- Production wallet flow should persist encrypted local note store and key management.
- Additional hardening recommended:
  - authenticated associated data (AAD) strategy
  - replay/session binding for relayer payloads
  - richer wallet-side note indexing and recovery

---

## TL;DR

If you want to run the full system quickly:

1. `anvil`
2. `npm run dev:relayer`
3. `npm run e2e:hardhat-local`

You will see deployments, relayed private transfers, on-chain confirmations, and recipient note decryption results in one run.
