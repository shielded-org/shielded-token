// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IHonkVerifier} from "./interfaces/IHonkVerifier.sol";
import {IIncrementalMerkleTree} from "./interfaces/IIncrementalMerkleTree.sol";

contract ShieldedToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    IHonkVerifier public immutable verifier;
    IIncrementalMerkleTree public immutable merkleTree;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(bytes32 => bool) public nullifierSet;
    bytes32 public immutable tokenField;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
    event Shield(address indexed account, bytes32 indexed commitment, bytes32 indexed root, uint256 amount);
    event NullifierSpent(bytes32 indexed nullifier);
    event ShieldedTransfer(
        bytes32 indexed nullifier0,
        bytes32 indexed nullifier1,
        bytes32 indexed commitment0,
        bytes32 commitment1
    );
    event NewCommitment(bytes encryptedNote);
    event Unshield(bytes32 indexed nullifier, address indexed recipient, uint256 amount);
    bytes32 private constant REDACTED = keccak256("REDACTED");

    error InvalidRoot();
    error InvalidProof();
    error InvalidTokenField();
    error InvalidRecipient();
    error InvalidAmount();
    error InvalidCommitment();
    error InvalidNullifier();
    error DuplicateNullifiers();
    error ZeroAddress();
    error NullifierAlreadySpent(bytes32 nullifier);
    error InsufficientBalance();
    error InsufficientAllowance();

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        address verifier_,
        address merkleTree_,
        address initialHolder,
        uint256 initialSupply
    ) {
        if (verifier_ == address(0) || merkleTree_ == address(0) || initialHolder == address(0)) revert ZeroAddress();
        name = tokenName;
        symbol = tokenSymbol;
        verifier = IHonkVerifier(verifier_);
        merkleTree = IIncrementalMerkleTree(merkleTree_);
        tokenField = bytes32(uint256(uint160(address(this))));
        _mint(initialHolder, initialSupply);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed < amount) revert InsufficientAllowance();
        allowance[from][msg.sender] = allowed - amount;
        _transfer(from, to, amount);
        return true;
    }

    function shield(uint256 amount, bytes32 commitment) external {
        if (amount == 0) revert InvalidAmount();
        if (commitment == bytes32(0)) revert InvalidCommitment();
        _burnWithoutEvent(msg.sender, amount);
        merkleTree.insert(commitment);
        // Keep event ABI stable while redacting sensitive payload values.
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
        // Keep event ABI stable while redacting sensitivity from emitted fields.
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
        _mintWithoutEvent(recipient, amount);
        // Keep event ABI stable while redacting sensitive payload values.
        emit Unshield(REDACTED, address(0), 0);
    }

    function _checkAndMarkNullifier(bytes32 nullifier) internal {
        if (nullifierSet[nullifier]) revert NullifierAlreadySpent(nullifier);
        nullifierSet[nullifier] = true;
        emit NullifierSpent(REDACTED);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (balanceOf[from] < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] -= amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _mintWithoutEvent(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function _burn(address from, uint256 amount) internal {
        if (balanceOf[from] < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] -= amount;
        }
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    function _burnWithoutEvent(address from, uint256 amount) internal {
        if (balanceOf[from] < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] -= amount;
        }
        totalSupply -= amount;
    }

}
