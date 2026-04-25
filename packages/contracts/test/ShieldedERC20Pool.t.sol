// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ShieldedERC20Pool} from "../src/ShieldedERC20Pool.sol";
import {IncrementalMerkleTree} from "../src/IncrementalMerkleTree.sol";
import {IHonkVerifier} from "../src/interfaces/IHonkVerifier.sol";
import {IPoseidon2} from "../src/interfaces/IPoseidon2.sol";

contract TestPoseidon2Pool is IPoseidon2 {
    function hash2(bytes32 left, bytes32 right) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(left, right));
    }
}

contract TestHonkVerifierPool is IHonkVerifier {
    bool public shouldVerify = true;

    function setShouldVerify(bool value) external {
        shouldVerify = value;
    }

    function verify(bytes calldata, bytes32[] calldata) external view returns (bool) {
        return shouldVerify;
    }
}

contract MockERC20 {
    string public name = "Mock Token";
    string public symbol = "MOCK";
    uint8 public decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (balanceOf[msg.sender] < amount) revert("balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed < amount) revert("allowance");
        if (balanceOf[from] < amount) revert("balance");
        allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract ShieldedERC20PoolTest is Test {
    ShieldedERC20Pool internal pool;
    TestHonkVerifierPool internal verifier;
    TestPoseidon2Pool internal hasher;
    IncrementalMerkleTree internal tree;
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;

    uint256 internal alicePk = 0xA11CE;
    address internal alice;
    address internal bob = address(0xB0B);

    function setUp() public {
        alice = vm.addr(alicePk);
        verifier = new TestHonkVerifierPool();
        hasher = new TestPoseidon2Pool();
        tree = new IncrementalMerkleTree(address(hasher));
        tokenA = new MockERC20();
        tokenB = new MockERC20();
        address[] memory initialTokens = new address[](1);
        initialTokens[0] = address(tokenA);
        pool = new ShieldedERC20Pool(address(verifier), address(tree), alice, initialTokens);
        tokenA.mint(alice, 1_000e18);
        tokenB.mint(alice, 1_000e18);
    }

    function test_ShieldRouted_PullsTokensAndInsertsCommitment() public {
        bytes32 commitment = keccak256("pool_commitment_1");
        vm.startPrank(alice);
        tokenA.approve(address(pool), 100e18);
        pool.shieldRouted(address(tokenA), 100e18, commitment, new bytes(0), bytes32(uint256(1)), bytes32(uint256(11)));
        vm.stopPrank();

        assertEq(tokenA.balanceOf(alice), 900e18);
        assertEq(tokenA.balanceOf(address(pool)), 100e18);
        assertTrue(tree.isKnownRoot(tree.getLastRoot()));
    }

    function test_ShieldRouted_RevertWhenTokenDisabled() public {
        bytes32 commitment = keccak256("pool_commitment_2");
        vm.startPrank(alice);
        tokenB.approve(address(pool), 10e18);
        vm.expectRevert(abi.encodeWithSelector(ShieldedERC20Pool.TokenNotEnabled.selector, address(tokenB)));
        pool.shieldRouted(address(tokenB), 10e18, commitment, new bytes(0), bytes32(uint256(1)), bytes32(uint256(11)));
        vm.stopPrank();
    }

    function test_ShieldedTransferRouted_MarksNullifiersAndInsertsCommitments() public {
        bytes32 root = tree.getLastRoot();
        bytes32 tokenField = bytes32(uint256(uint160(address(tokenA))));
        bytes32[2] memory nullifiers = [bytes32(uint256(111)), bytes32(uint256(222))];
        bytes32[2] memory commitments = [bytes32(uint256(333)), bytes32(uint256(444))];
        bytes[2] memory encryptedNotes = [bytes("enc-note-0"), bytes("enc-note-1")];
        bytes32[2] memory channels = [bytes32(uint256(1)), bytes32(uint256(2))];
        bytes32[2] memory subchannels = [bytes32(uint256(11)), bytes32(uint256(22))];

        pool.shieldedTransferRouted(
            hex"0102", nullifiers, commitments, encryptedNotes, channels, subchannels, root, tokenField, 0
        );

        assertTrue(pool.nullifierSet(nullifiers[0]));
        assertTrue(pool.nullifierSet(nullifiers[1]));
    }

    function test_ShieldedTransferRouted_RevertWhenTokenFieldInvalid() public {
        bytes32 root = tree.getLastRoot();
        bytes32 invalidField = bytes32(type(uint256).max);
        bytes32[2] memory nullifiers = [bytes32(uint256(111)), bytes32(uint256(222))];
        bytes32[2] memory commitments = [bytes32(uint256(333)), bytes32(uint256(444))];
        bytes[2] memory encryptedNotes = [bytes("enc-note-0"), bytes("enc-note-1")];
        bytes32[2] memory channels = [bytes32(uint256(1)), bytes32(uint256(2))];
        bytes32[2] memory subchannels = [bytes32(uint256(11)), bytes32(uint256(22))];

        vm.expectRevert(ShieldedERC20Pool.InvalidTokenField.selector);
        pool.shieldedTransferRouted(
            hex"0102", nullifiers, commitments, encryptedNotes, channels, subchannels, root, invalidField, 0
        );
    }

    function test_Unshield_TransfersUnderlyingToken() public {
        // Seed pool balance for redemption path.
        tokenA.mint(address(pool), 70e18);
        bytes32 root = tree.getLastRoot();
        bytes32 nullifier = bytes32(uint256(999));

        pool.unshield(hex"CAFE", nullifier, address(tokenA), bob, 70e18, root);

        assertEq(tokenA.balanceOf(bob), 70e18);
        assertTrue(pool.nullifierSet(nullifier));
    }
}
