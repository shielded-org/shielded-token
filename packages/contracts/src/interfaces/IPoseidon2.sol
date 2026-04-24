// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IPoseidon2 {
    function hash2(bytes32 left, bytes32 right) external view returns (bytes32);
}
