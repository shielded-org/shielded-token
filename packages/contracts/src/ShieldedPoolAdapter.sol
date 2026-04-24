// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20Minimal} from "./interfaces/IERC20Minimal.sol";

interface IShieldedPoolDeposit {
    function depositFromAdapter(uint256 amount, bytes32 commitment, bytes calldata encryptedNote) external;
}

contract ShieldedPoolAdapter {
    IERC20Minimal public immutable token;
    IShieldedPoolDeposit public immutable pool;

    error ZeroAddress();
    error TransferFailed();

    constructor(address token_, address pool_) {
        if (token_ == address(0) || pool_ == address(0)) revert ZeroAddress();
        token = IERC20Minimal(token_);
        pool = IShieldedPoolDeposit(pool_);
    }

    function deposit(uint256 amount, bytes32 commitment, bytes calldata encryptedNote) external {
        if (!token.transferFrom(msg.sender, address(pool), amount)) revert TransferFailed();
        pool.depositFromAdapter(amount, commitment, encryptedNote);
    }
}
