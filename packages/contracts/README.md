# Contracts Package

This package contains the shielded coordinator baseline for phases 0-5:

- `src/ShieldedToken.sol`: dual-mode token with `shield`, `shieldedTransfer`, and `unshield`.
- `src/interfaces/*`: verifier and Merkle tree interfaces.
- `src/mocks/*`: local testing mocks for verifier and tree.
- `test/ShieldedToken.t.sol`: unit tests for nullifiers, root checks, and state transitions.

## Commands

```shell
forge build
forge test
forge fmt
```

## Notes

- Hashing in this phase is integration-oriented and not audit-ready.
- The production `HonkVerifier.sol` and Poseidon-compatible Merkle tree will be wired in a later hardening phase.
