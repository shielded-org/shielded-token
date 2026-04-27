# Shielded (Sepolia Pool Integrated)

This extension workspace is a MetaMask-style wallet surface tailored to this project, with:

- standard EOA wallet vault (import + encrypted local storage)
- public balance + public transfer flows
- deterministic shield key derivation (spending key, viewing key, owner pk derivation path)
- shielded note discovery and private spendable balance tracking against Sepolia pool events
- in-browser Noir + bb.js proof computation for private transfer submission
- in-browser Noir + bb.js proof computation for unshield (private -> public) using the same circuit artifact as transfer
- clear UX separation between public and private balances, and public/private send modes

## Integrated Sepolia addresses

Configured in `src/config.ts`:

- Poseidon: `0xa9CC305Af95542673aea1518881B6F1E7A8DE3b8`
- Poseidon Hasher: `0xE6d12EfF9db5FDb548Aa17Ad1587623FFAe3BE96`
- Verifier: `0xf45A783A47c68570b9D786a291e934F6A6B70950`
- MerkleTree: `0x3C4A041C4145B7FEF8C341Ca10D162A717adcc7A`
- Shielded ERC20 Pool: `0xDd10f44Bc04451f0e1B698F5a8422f56d0d05966`
- Token: `0x9DBEd8AB4A05b5E4b6aF3bf61AA3051F6caa91b4`

## File map

- `src/App.tsx`  
  Main wallet UI + state: vault lifecycle, balances, public send, private note sync.
- `src/config.ts`  
  Chain + contract addresses + ABIs used by the extension.
- `src/crypto.ts`  
  AES-GCM key encryption/decryption (PBKDF2-derived key).
- `src/storage.ts`  
  Browser vault persistence.
- `src/keys.ts`  
  Deterministic key derivation used for spending/viewing keys.
- `src/shielded.ts`  
  RoutedCommitment log scanning + note decryption + note extraction.
- `public/manifest.json`  
  Manifest v3 extension config.

## Deterministic key model

The extension derives shield keys from wallet identity using domain-separated hashing:

- seed: `keccak256("zkproject-wallet-seed-v1", walletAddress)`
- spending key: `H(seed, "owner:spending") mod BN254 + 1`
- viewing key: `H(seed, "owner:viewing") mod secp256k1_order + 1`
- owner pk: derived via Poseidon on-chain primitive (`hash_2(spendingKey, 1)`)

This is deterministic and replicable across extension sessions.

## Run locally

From repo root:

```bash
npm install --workspace @zkproject/wallet-extension
npm run dev --workspace @zkproject/wallet-extension
```

## Build + load as extension

```bash
npm run build --workspace @zkproject/wallet-extension
```

Then load unpacked extension in Chromium:

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click **Load unpacked**
4. Select `apps/wallet-extension/dist`

## Notes on private sends

Private transfer now performs:

1. spendable note discovery for the sender
2. Merkle path construction from `LeafInserted` events on the integrated MerkleTree
3. witness generation + proof generation in browser via Noir + bb.js
4. relayer submission to `shieldedTransferRouted` on Sepolia pool

UI supports a single recipient `shielded address` (`shd_...`) for private sends. Advanced mode can still accept raw `owner_pk` + `viewingPub`.

Private transfer supports both single-note and two-note spends. Users can transfer any amount up to available private balance; leftover amount is returned as a private change note.

## Notes on unshield

Unshield flow supports withdrawing to either:

- your own EOA address, or
- a custom recipient address.

Unshield now supports both full-note and partial withdrawals. Partial unshield creates a private change note back to the sender in the same transaction.

Both transfer and unshield use `public/circuits/shielded_transfer.json` (`mode=0` transfer, `mode=1` unshield).
