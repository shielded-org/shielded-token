# Shielded Token

Privacy-focused shielded token system for EVM using:

- Noir circuits
- UltraHonk proofs (Barretenberg)
- Solidity verifier/contracts
- Relayer-mediated on-chain submission
- Encrypted note discovery for recipients via viewing keys

This repo implements a **STRK20-style monolith**: a single `ShieldedToken` contract coordinates **public ERC20 balances** and the **embedded privacy pool** (Merkle commitments, nullifiers, proofs, encrypted note discovery). Moving value into the pool uses `shield` (burn public balance + insert commitment); private transfers and `unshield` operate on that same coordinator.

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
- `apps/web`: frontend shell (not required for CLI E2E)

---

## Contracts and what they do

### `ShieldedToken.sol` (monolith coordinator)

Single contract combining:

- **ERC20 surface**: `transfer`, `approve`, `transferFrom`, `balanceOf`, `totalSupply` for transparent interoperability
- **Embedded pool**: `shield`, `shieldedTransfer`, `unshield`
- **Nullifier set** and **UltraHonk** verification against the shared Merkle tree
- **`tokenField`**: `bytes32(uint256(uint160(address(this))))` so the Noir circuit binds to this token address
- **`NewCommitment`**: encrypted payloads for recipient-side discovery (optional on `shield` if calldata empty)

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

- Accepts proof bundle + commitments/nullifiers/encrypted notes
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

### 5) Run full E2E

```bash
npm run e2e:hardhat-local
```

This script does all of the following:

- Compiles circuit and contracts
- Generates verifier from VK
- Deploys Poseidon/hash adapter/verifier/tree
- Deploys monolithic `ShieldedToken`
- Deposits initial notes via `shield` (public balance → commitments)
- Generates and submits 3 shielded transfers through relayer
- Waits for on-chain confirmations
- Scans and decrypts recipient notes via viewing keys

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
8. Relayer submits `shieldedTransfer` on-chain.
9. Pool verifies proof, marks nullifiers spent, inserts commitments, emits encrypted note events.
10. Bob scans `NewCommitment` events.
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

- Query `NewCommitment` logs from token deploy block
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
