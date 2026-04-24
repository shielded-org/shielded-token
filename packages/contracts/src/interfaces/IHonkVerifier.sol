// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IHonkVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}
