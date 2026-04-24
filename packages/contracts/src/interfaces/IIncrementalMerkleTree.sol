// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IIncrementalMerkleTree {
    function insert(bytes32 leaf) external;
    function getLastRoot() external view returns (bytes32);
    function isKnownRoot(bytes32 root) external view returns (bool);
    function getNextIndex() external view returns (uint256);
}
