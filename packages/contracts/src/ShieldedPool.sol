// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IHonkVerifier} from "./interfaces/IHonkVerifier.sol";
import {IIncrementalMerkleTree} from "./interfaces/IIncrementalMerkleTree.sol";
import {IERC20Minimal} from "./interfaces/IERC20Minimal.sol";

contract ShieldedPool {
    IHonkVerifier public immutable verifier;
    IIncrementalMerkleTree public immutable merkleTree;
    IERC20Minimal public immutable underlyingToken;
    bytes32 public immutable tokenField;

    address public owner;
    address public adapter;
    mapping(bytes32 => bool) public nullifierSet;

    event Shield(address indexed account, bytes32 indexed commitment, bytes32 indexed root, uint256 amount);
    event NullifierSpent(bytes32 indexed nullifier);
    event ShieldedTransfer(
        bytes32 indexed nullifier0,
        bytes32 indexed nullifier1,
        bytes32 indexed commitment0,
        bytes32 commitment1
    );
    event Unshield(bytes32 indexed nullifier, address indexed recipient, uint256 amount);
    event NewCommitment(bytes encryptedNote);

    bytes32 private constant REDACTED = keccak256("REDACTED");

    error InvalidRoot();
    error InvalidProof();
    error InvalidTokenField();
    error InvalidRecipient();
    error InvalidAmount();
    error InvalidCommitment();
    error InvalidNullifier();
    error DuplicateNullifiers();
    error NullifierAlreadySpent(bytes32 nullifier);
    error ZeroAddress();
    error Unauthorized();
    error AdapterAlreadySet();
    error TransferFailed();

    constructor(address verifier_, address merkleTree_, address underlyingToken_) {
        if (verifier_ == address(0) || merkleTree_ == address(0) || underlyingToken_ == address(0)) revert ZeroAddress();
        verifier = IHonkVerifier(verifier_);
        merkleTree = IIncrementalMerkleTree(merkleTree_);
        underlyingToken = IERC20Minimal(underlyingToken_);
        tokenField = bytes32(uint256(uint160(underlyingToken_)));
        owner = msg.sender;
    }

    function setAdapter(address adapter_) external {
        if (msg.sender != owner) revert Unauthorized();
        if (adapter == address(0)) {
            if (adapter_ == address(0)) revert ZeroAddress();
            adapter = adapter_;
            return;
        }
        revert AdapterAlreadySet();
    }

    function depositFromAdapter(uint256 amount, bytes32 commitment, bytes calldata encryptedNote) external {
        if (msg.sender != adapter) revert Unauthorized();
        if (amount == 0) revert InvalidAmount();
        if (commitment == bytes32(0)) revert InvalidCommitment();

        merkleTree.insert(commitment);
        emit NewCommitment(encryptedNote);
        emit Shield(address(0), REDACTED, REDACTED, 0);
    }

    function shieldedTransfer(
        bytes calldata proof,
        bytes32[2] calldata nullifiers,
        bytes32[2] calldata newCommitments,
        bytes[2] calldata encryptedNotes,
        bytes32 merkleRoot,
        bytes32 token,
        uint64 fee
    ) external {
        if (token != tokenField) revert InvalidTokenField();
        if (proof.length == 0) revert InvalidProof();
        if (nullifiers[0] == bytes32(0) || nullifiers[1] == bytes32(0)) revert InvalidNullifier();
        if (nullifiers[0] == nullifiers[1]) revert DuplicateNullifiers();
        if (newCommitments[0] == bytes32(0) || newCommitments[1] == bytes32(0)) revert InvalidCommitment();
        if (!merkleTree.isKnownRoot(merkleRoot)) revert InvalidRoot();

        bytes32[] memory publicInputs = new bytes32[](7);
        publicInputs[0] = token;
        publicInputs[1] = merkleRoot;
        publicInputs[2] = nullifiers[0];
        publicInputs[3] = nullifiers[1];
        publicInputs[4] = newCommitments[0];
        publicInputs[5] = newCommitments[1];
        publicInputs[6] = bytes32(uint256(fee));

        if (!verifier.verify(proof, publicInputs)) revert InvalidProof();

        _checkAndMarkNullifier(nullifiers[0]);
        _checkAndMarkNullifier(nullifiers[1]);

        merkleTree.insert(newCommitments[0]);
        merkleTree.insert(newCommitments[1]);
        emit NewCommitment(encryptedNotes[0]);
        emit NewCommitment(encryptedNotes[1]);
        emit ShieldedTransfer(REDACTED, REDACTED, REDACTED, REDACTED);
    }

    function unshield(
        bytes calldata proof,
        bytes32 nullifier,
        address recipient,
        uint256 amount,
        bytes32 merkleRoot
    ) external {
        if (proof.length == 0) revert InvalidProof();
        if (recipient == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (nullifier == bytes32(0)) revert InvalidNullifier();
        if (!merkleTree.isKnownRoot(merkleRoot)) revert InvalidRoot();

        bytes32[] memory publicInputs = new bytes32[](4);
        publicInputs[0] = nullifier;
        publicInputs[1] = bytes32(uint256(uint160(recipient)));
        publicInputs[2] = bytes32(amount);
        publicInputs[3] = merkleRoot;

        if (!verifier.verify(proof, publicInputs)) revert InvalidProof();

        _checkAndMarkNullifier(nullifier);
        if (!underlyingToken.transfer(recipient, amount)) revert TransferFailed();
        emit Unshield(REDACTED, address(0), 0);
    }

    function _checkAndMarkNullifier(bytes32 nullifier) internal {
        if (nullifierSet[nullifier]) revert NullifierAlreadySpent(nullifier);
        nullifierSet[nullifier] = true;
        emit NullifierSpent(REDACTED);
    }
}
