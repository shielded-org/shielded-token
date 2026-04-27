// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IHonkVerifier} from "./interfaces/IHonkVerifier.sol";
import {IIncrementalMerkleTree} from "./interfaces/IIncrementalMerkleTree.sol";
import {IERC20Minimal} from "./interfaces/IERC20Minimal.sol";

/// @title ShieldedERC20Pool
/// @notice Multi-token shielded pool with routed note discovery.
/// @dev Uses one transfer circuit per tx (`token` public input). Notes remain token-specific.
contract ShieldedERC20Pool {
    IHonkVerifier public immutable verifier;
    IIncrementalMerkleTree public immutable merkleTree;
    address public owner;

    mapping(bytes32 => bool) public nullifierSet;
    mapping(address => bool) public enabledToken;

    event NullifierSpent(bytes32 indexed nullifier);
    event Shield(address indexed account, bytes32 indexed commitment, bytes32 indexed root, uint256 amount);
    event ShieldedTransfer(
        bytes32 indexed nullifier0,
        bytes32 indexed nullifier1,
        bytes32 indexed commitment0,
        bytes32 commitment1
    );
    event Unshield(bytes32 indexed nullifier, address indexed recipient, uint256 amount);
    event RoutedCommitment(bytes32 indexed channel, bytes32 indexed subchannel, bytes encryptedNote);
    event TokenEnabled(address indexed token, bool enabled);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    bytes32 private constant REDACTED = keccak256("REDACTED");
    uint256 private _entered;

    error InvalidRoot();
    error InvalidProof();
    error InvalidTokenField();
    error InvalidToken();
    error InvalidRecipient();
    error InvalidAmount();
    error InvalidCommitment();
    error InvalidNullifier();
    error DuplicateNullifiers();
    error ZeroAddress();
    error NullifierAlreadySpent(bytes32 nullifier);
    error NotOwner();
    error Reentrancy();
    error TokenNotEnabled(address token);
    error TokenTransferFailed();
    error UnsupportedTokenBehavior();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_entered == 1) revert Reentrancy();
        _entered = 1;
        _;
        _entered = 0;
    }

    constructor(address verifier_, address merkleTree_, address owner_, address[] memory initialTokens) {
        if (verifier_ == address(0) || merkleTree_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        verifier = IHonkVerifier(verifier_);
        merkleTree = IIncrementalMerkleTree(merkleTree_);
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);

        for (uint256 i = 0; i < initialTokens.length; i++) {
            address token = initialTokens[i];
            if (token == address(0)) revert ZeroAddress();
            enabledToken[token] = true;
            emit TokenEnabled(token, true);
        }
    }

    function setTokenEnabled(address token, bool enabled) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        enabledToken[token] = enabled;
        emit TokenEnabled(token, enabled);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address prev = owner;
        owner = newOwner;
        emit OwnershipTransferred(prev, newOwner);
    }

    function shieldRouted(
        address token,
        uint256 amount,
        bytes32 commitment,
        bytes calldata encryptedNote,
        bytes32 channel,
        bytes32 subchannel
    ) external nonReentrant {
        if (!enabledToken[token]) revert TokenNotEnabled(token);
        if (amount == 0) revert InvalidAmount();
        if (commitment == bytes32(0)) revert InvalidCommitment();

        uint256 beforeBal = IERC20Minimal(token).balanceOf(address(this));
        bool ok = IERC20Minimal(token).transferFrom(msg.sender, address(this), amount);
        if (!ok) revert TokenTransferFailed();
        uint256 afterBal = IERC20Minimal(token).balanceOf(address(this));
        if (afterBal - beforeBal != amount) revert UnsupportedTokenBehavior();

        merkleTree.insert(commitment);
        if (encryptedNote.length > 0) {
            emit RoutedCommitment(channel, subchannel, encryptedNote);
        }
        emit Shield(address(0), REDACTED, REDACTED, 0);
    }

    function shieldedTransferRouted(
        bytes calldata proof,
        bytes32[2] calldata nullifiers,
        bytes32[2] calldata newCommitments,
        bytes[2] calldata encryptedNotes,
        bytes32[2] calldata channels,
        bytes32[2] calldata subchannels,
        bytes32 merkleRoot,
        bytes32 token,
        uint256 fee,
        bytes32 feeRecipientPk
    ) external {
        address tokenAddress = _tokenFieldToAddress(token);
        if (!enabledToken[tokenAddress]) revert TokenNotEnabled(tokenAddress);
        if (proof.length == 0) revert InvalidProof();
        if (nullifiers[0] == bytes32(0)) revert InvalidNullifier();
        if (nullifiers[1] != bytes32(0) && nullifiers[0] == nullifiers[1]) revert DuplicateNullifiers();
        if (newCommitments[0] == bytes32(0) || newCommitments[1] == bytes32(0)) revert InvalidCommitment();
        if (!merkleTree.isKnownRoot(merkleRoot)) revert InvalidRoot();

        bytes32[] memory publicInputs = new bytes32[](12);
        publicInputs[0] = token;
        publicInputs[1] = merkleRoot;
        publicInputs[2] = nullifiers[0];
        publicInputs[3] = nullifiers[1];
        publicInputs[4] = newCommitments[0];
        publicInputs[5] = newCommitments[1];
        publicInputs[6] = bytes32(uint256(fee));
        publicInputs[7] = feeRecipientPk;
        publicInputs[8] = bytes32(uint256(0)); // mode=transfer
        publicInputs[9] = bytes32(0); // unshield recipient
        publicInputs[10] = bytes32(0); // unshield amount
        publicInputs[11] = bytes32(0); // unshield token address

        if (!verifier.verify(proof, publicInputs)) revert InvalidProof();

        _checkAndMarkNullifier(nullifiers[0]);
        if (nullifiers[1] != bytes32(0)) {
            _checkAndMarkNullifier(nullifiers[1]);
        }

        merkleTree.insert(newCommitments[0]);
        merkleTree.insert(newCommitments[1]);
        emit RoutedCommitment(channels[0], subchannels[0], encryptedNotes[0]);
        emit RoutedCommitment(channels[1], subchannels[1], encryptedNotes[1]);
        emit ShieldedTransfer(REDACTED, REDACTED, REDACTED, REDACTED);
    }

    function unshield(
        bytes calldata proof,
        bytes32 nullifier,
        address token,
        address recipient,
        uint256 amount,
        bytes32 merkleRoot,
        bytes32 newCommitment,
        bytes calldata encryptedNote,
        bytes32 channel,
        bytes32 subchannel
    ) external nonReentrant {
        if (!enabledToken[token]) revert TokenNotEnabled(token);
        if (proof.length == 0) revert InvalidProof();
        if (recipient == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (nullifier == bytes32(0)) revert InvalidNullifier();
        if (!merkleTree.isKnownRoot(merkleRoot)) revert InvalidRoot();

        bytes32[] memory publicInputs = new bytes32[](12);
        publicInputs[0] = bytes32(uint256(uint160(token)));
        publicInputs[1] = merkleRoot;
        publicInputs[2] = nullifier;
        publicInputs[3] = bytes32(0); // nullifier lane #2 unused in unshield
        publicInputs[4] = newCommitment; // output commitment #1 is private change note (optional)
        publicInputs[5] = bytes32(0); // output commitment #2 unused in unshield
        publicInputs[6] = bytes32(0); // fee unused in unshield
        publicInputs[7] = bytes32(0); // fee recipient pk unused in unshield
        publicInputs[8] = bytes32(uint256(1)); // mode=unshield
        publicInputs[9] = bytes32(uint256(uint160(recipient)));
        publicInputs[10] = bytes32(amount);
        publicInputs[11] = bytes32(uint256(uint160(token)));

        if (!verifier.verify(proof, publicInputs)) revert InvalidProof();

        _checkAndMarkNullifier(nullifier);
        if (newCommitment != bytes32(0)) {
            merkleTree.insert(newCommitment);
            if (encryptedNote.length > 0) {
                emit RoutedCommitment(channel, subchannel, encryptedNote);
            }
        }
        bool ok = IERC20Minimal(token).transfer(recipient, amount);
        if (!ok) revert TokenTransferFailed();
        emit Unshield(REDACTED, address(0), 0);
    }

    function _checkAndMarkNullifier(bytes32 nullifier) internal {
        if (nullifierSet[nullifier]) revert NullifierAlreadySpent(nullifier);
        nullifierSet[nullifier] = true;
        emit NullifierSpent(REDACTED);
    }

    function _tokenFieldToAddress(bytes32 tokenField) internal pure returns (address tokenAddress) {
        uint256 raw = uint256(tokenField);
        if (raw >> 160 != 0) revert InvalidTokenField();
        tokenAddress = address(uint160(raw));
        if (tokenAddress == address(0)) revert InvalidToken();
    }
}
