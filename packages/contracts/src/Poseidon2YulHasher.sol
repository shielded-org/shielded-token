// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPoseidon2 as IUpstreamPoseidon2} from "./vendor/poseidon2-evm/IPoseidon2.sol";
import {IPoseidon2} from "./interfaces/IPoseidon2.sol";

/// @notice Local adapter around vendored Poseidon2Yul contract.
/// @dev Expects `upstream` to be a deployed `Poseidon2Yul` instance.
contract Poseidon2YulHasher is IPoseidon2 {
    uint256 internal constant PRIME =
        0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001;

    address public immutable upstream;

    error ZeroAddress();
    error InvalidFieldElement();

    constructor(address upstream_) {
        if (upstream_ == address(0)) revert ZeroAddress();
        upstream = upstream_;
    }

    function hash2(bytes32 left, bytes32 right) external view returns (bytes32) {
        uint256 x = uint256(left);
        uint256 y = uint256(right);
        if (x >= PRIME || y >= PRIME) revert InvalidFieldElement();
        uint256 out = IUpstreamPoseidon2(upstream).hash_2(x, y);
        return bytes32(out);
    }
}
