// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IIncrementalMerkleTree} from "./interfaces/IIncrementalMerkleTree.sol";
import {IPoseidon2} from "./interfaces/IPoseidon2.sol";

contract IncrementalMerkleTree is IIncrementalMerkleTree {
    uint256 public constant ROOT_HISTORY_SIZE = 30;
    uint256 public constant TREE_DEPTH = 20;
    uint256 public constant MAX_LEAVES = 1 << TREE_DEPTH;

    IPoseidon2 public immutable hasher;
    bytes32 public currentRoot;
    mapping(bytes32 => bool) internal knownRoots;
    bytes32[ROOT_HISTORY_SIZE] internal rootHistory;
    uint256 internal rootPointer;
    bytes32[TREE_DEPTH] internal zeros;
    bytes32[TREE_DEPTH] internal filledSubtrees;
    uint256 internal nextIndex;

    event LeafInserted(uint256 indexed index, bytes32 indexed leaf, bytes32 indexed newRoot);

    error TreeFull();
    error ZeroHasherAddress();

    constructor(address hasher_) {
        if (hasher_ == address(0)) revert ZeroHasherAddress();
        hasher = IPoseidon2(hasher_);

        bytes32 currentZero = bytes32(0);
        for (uint256 level = 0; level < TREE_DEPTH; level++) {
            zeros[level] = currentZero;
            filledSubtrees[level] = currentZero;
            currentZero = _hashLeftRight(currentZero, currentZero);
        }
        currentRoot = currentZero;
        _rememberRoot(currentRoot);
    }

    function insert(bytes32 leaf) external {
        if (nextIndex >= MAX_LEAVES) revert TreeFull();

        uint256 index = nextIndex;
        bytes32 currentHash = leaf;
        for (uint256 level = 0; level < TREE_DEPTH; level++) {
            if ((index & 1) == 0) {
                filledSubtrees[level] = currentHash;
                currentHash = _hashLeftRight(currentHash, zeros[level]);
            } else {
                currentHash = _hashLeftRight(filledSubtrees[level], currentHash);
            }
            index >>= 1;
        }

        nextIndex += 1;
        currentRoot = currentHash;
        _rememberRoot(currentRoot);
        emit LeafInserted(nextIndex - 1, leaf, currentRoot);
    }

    function getLastRoot() external view returns (bytes32) {
        return currentRoot;
    }

    function isKnownRoot(bytes32 root) external view returns (bool) {
        return knownRoots[root];
    }

    function getNextIndex() external view returns (uint256) {
        return nextIndex;
    }

    function _hashLeftRight(bytes32 left, bytes32 right) internal view returns (bytes32) {
        return hasher.hash2(left, right);
    }

    function _rememberRoot(bytes32 newRoot) internal {
        bytes32 previous = rootHistory[rootPointer];
        if (previous != bytes32(0)) {
            knownRoots[previous] = false;
        }

        rootHistory[rootPointer] = newRoot;
        knownRoots[newRoot] = true;
        rootPointer = (rootPointer + 1) % ROOT_HISTORY_SIZE;
    }
}
