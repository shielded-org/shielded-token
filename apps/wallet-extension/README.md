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

- Poseidon: `0x9326A6EF88A986286D4B557A9951602182a397Ba`
- Poseidon Hasher: `0x81E5BDC2167BAD2675792D5B87ec6D70f4bdc268`
- Verifier: `0x8Fde56DB65E28853d3e8eecB1033ccAdB34540E7`
- MerkleTree: `0x73C03CB432823F3c0B70a8d5a097738260Fb7aae`
- Shielded ERC20 Pool: `0x23228B4c59CA11597346802D6625C834D44c4922`
- Token: `0x2F3dAD877Fc7394c08Be9e323B0CBc6D5BEcFA4A`

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

UI requires recipient `owner_pk` and recipient `viewingPub` for private sends.

## Notes on unshield

Unshield flow supports withdrawing to either:

- your own EOA address, or
- a custom recipient address.

Current circuit path unshields an exact note amount. If you need a different amount, first reshape note denominations using private transfers.

Both transfer and unshield use `public/circuits/shielded_transfer.json` (`mode=0` transfer, `mode=1` unshield).
