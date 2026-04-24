// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ShieldedToken} from "../src/ShieldedToken.sol";
import {IncrementalMerkleTree} from "../src/IncrementalMerkleTree.sol";
import {IHonkVerifier} from "../src/interfaces/IHonkVerifier.sol";
import {IPoseidon2} from "../src/interfaces/IPoseidon2.sol";

contract TestPoseidon2 is IPoseidon2 {
    function hash2(bytes32 left, bytes32 right) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(left, right));
    }
}

contract TestHonkVerifier is IHonkVerifier {
    bool public shouldVerify = true;

    function setShouldVerify(bool value) external {
        shouldVerify = value;
    }

    function verify(bytes calldata, bytes32[] calldata) external view returns (bool) {
        return shouldVerify;
    }
}

contract ShieldedTokenTest is Test {
    ShieldedToken internal token;
    TestHonkVerifier internal verifier;
    TestPoseidon2 internal hasher;
    IncrementalMerkleTree internal tree;

    uint256 internal alicePk = 0xA11CE;
    address internal alice;
    address internal bob = address(0xB0B);

    function setUp() public {
        alice = vm.addr(alicePk);
        verifier = new TestHonkVerifier();
        hasher = new TestPoseidon2();
        tree = new IncrementalMerkleTree(address(hasher));
        token = new ShieldedToken("Shielded Token", "SHLD", address(verifier), address(tree), alice, 1_000e18);
    }

    function test_Shield_BurnsAndInsertsCommitment() public {
        bytes32 commitment = keccak256("commitment_1");

        vm.prank(alice);
        token.shield(100e18, commitment);

        assertEq(token.balanceOf(alice), 900e18);
        assertTrue(tree.isKnownRoot(tree.getLastRoot()));
    }

    function test_ShieldedTransfer_MarksNullifiersAndInsertsCommitments() public {
        bytes32 root = tree.getLastRoot();
        bytes32[2] memory nullifiers = [bytes32(uint256(111)), bytes32(uint256(222))];
        bytes32[2] memory commitments = [bytes32(uint256(333)), bytes32(uint256(444))];
        bytes[2] memory encryptedNotes = [bytes("enc-note-0"), bytes("enc-note-1")];

        token.shieldedTransfer(hex"0102", nullifiers, commitments, encryptedNotes, root, token.tokenField(), 0);

        assertTrue(token.nullifierSet(nullifiers[0]));
        assertTrue(token.nullifierSet(nullifiers[1]));
    }

    function test_ShieldedTransfer_RevertOnStaleRoot() public {
        bytes32[2] memory nullifiers = [bytes32(uint256(111)), bytes32(uint256(222))];
        bytes32[2] memory commitments = [bytes32(uint256(333)), bytes32(uint256(444))];
        bytes[2] memory encryptedNotes = [bytes("enc-note-0"), bytes("enc-note-1")];
        bytes32 unknownRoot = bytes32(uint256(9_999_999));
        bytes32 tokenField = token.tokenField();
        assertFalse(tree.isKnownRoot(unknownRoot));

        vm.expectRevert(ShieldedToken.InvalidRoot.selector);
        token.shieldedTransfer(
            hex"0102",
            nullifiers,
            commitments,
            encryptedNotes,
            unknownRoot,
            tokenField,
            0
        );
    }

    function test_ShieldedTransfer_RevertOnInvalidProof() public {
        verifier.setShouldVerify(false);
        assertFalse(verifier.shouldVerify());
        bytes32 root = tree.getLastRoot();
        bytes32 tokenField = token.tokenField();
        bytes32[2] memory nullifiers = [bytes32(uint256(111)), bytes32(uint256(222))];
        bytes32[2] memory commitments = [bytes32(uint256(333)), bytes32(uint256(444))];
        bytes[2] memory encryptedNotes = [bytes("enc-note-0"), bytes("enc-note-1")];

        vm.expectRevert(ShieldedToken.InvalidProof.selector);
        token.shieldedTransfer(hex"0102", nullifiers, commitments, encryptedNotes, root, tokenField, 0);
    }

    function test_Unshield_MintsToRecipient() public {
        bytes32 root = tree.getLastRoot();
        bytes32 nullifier = bytes32(uint256(999));

        token.unshield(hex"CAFE", nullifier, bob, 70e18, root);

        assertEq(token.balanceOf(bob), 70e18);
        assertTrue(token.nullifierSet(nullifier));
    }

    function test_RevertWhenNullifierReused() public {
        bytes32 root = tree.getLastRoot();
        bytes32 nullifier = bytes32(uint256(999));

        token.unshield(hex"CAFE", nullifier, bob, 10e18, root);
        vm.expectRevert();
        token.unshield(hex"CAFE", nullifier, bob, 10e18, root);
    }

    function test_RootHistoryWindowExpiresOldRoot() public {
        bytes32 oldest = tree.getLastRoot();
        bytes32 tokenField = token.tokenField();
        for (uint256 i = 0; i < 35; i++) {
            tree.insert(bytes32(i + 1));
        }
        assertFalse(tree.isKnownRoot(oldest));

        bytes32[2] memory nullifiers = [bytes32(uint256(111)), bytes32(uint256(222))];
        bytes32[2] memory commitments = [bytes32(uint256(333)), bytes32(uint256(444))];
        bytes[2] memory encryptedNotes = [bytes("enc-note-0"), bytes("enc-note-1")];

        vm.expectRevert(ShieldedToken.InvalidRoot.selector);
        token.shieldedTransfer(hex"0102", nullifiers, commitments, encryptedNotes, oldest, tokenField, 0);
    }

}
