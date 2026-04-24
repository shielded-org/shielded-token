// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPoseidon2} from "./interfaces/IPoseidon2.sol";

/// @notice Adapter that exposes a stable `hash2(bytes32,bytes32)` interface for Poseidon2.
/// @dev This contract delegates hashing to an audited Poseidon2 implementation contract.
contract Poseidon2Hasher is IPoseidon2 {
    address public immutable poseidon2;
    bytes4 public immutable hash2Selector;

    error ZeroAddress();
    error HashCallFailed();
    error InvalidReturnData();

    /// @param poseidon2_ Address of deployed Poseidon2 contract (e.g. zemse/poseidon2-evm deployment)
    /// @param hash2Selector_ Function selector for 2-input hash on the target contract
    constructor(address poseidon2_, bytes4 hash2Selector_) {
        if (poseidon2_ == address(0)) revert ZeroAddress();
        poseidon2 = poseidon2_;
        hash2Selector = hash2Selector_;
    }

    function hash2(bytes32 left, bytes32 right) external view returns (bytes32 result) {
        (bool ok, bytes memory ret) = poseidon2.staticcall(abi.encodeWithSelector(hash2Selector, left, right));
        if (!ok) revert HashCallFailed();
        if (ret.length != 32) revert InvalidReturnData();
        result = abi.decode(ret, (bytes32));
    }
}
