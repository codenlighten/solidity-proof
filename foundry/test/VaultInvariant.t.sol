// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Base} from "./Base.sol";
import {VaultV1} from "contracts/VaultV1.sol";
import {VaultV2} from "contracts/VaultV2.sol";

/// Random sequences of deposit / withdraw / over-withdraw / upgrade / claimFees. The handler is the vault owner
/// and keeps its own ledger, so the invariants compare the contract to an independent model.
contract VaultHandler is Base {
    VaultV1 public immutable vault;
    address[] public actors;
    mapping(address => uint256) public modelBalance; // independent ledger
    bool public upgraded;
    uint256 public modelFees;
    uint256 public modelFeeBps; // the rate we asked for, recorded here rather than read back from the contract
    uint256 public feeBearingWithdrawals;
    uint256 public claimsWithFees;
    uint256 public overWithdrawReverts;

    constructor() {
        // the handler deploys the vault so it is the owner and can upgrade and claim fees
        VaultV1 impl = new VaultV1();
        vault = VaultV1(address(new ERC1967Proxy(address(impl), abi.encodeCall(VaultV1.initialize, (address(this))))));
        for (uint160 i = 1; i <= 4; i++) actors.push(address(0x1000 + i));
    }

    receive() external payable {} // the owner receives claimed fees

    function _ceilFee(uint256 amount, uint256 bps) private pure returns (uint256) {
        return (amount * bps + 9_999) / 10_000; // amount < 100 ether here, so no overflow
    }

    function actorCount() external view returns (uint256) { return actors.length; }

    function deposit(uint256 seed, uint256 amount) external {
        address a = actors[seed % actors.length];
        amount = amount % 100 ether;
        vm.deal(a, amount);
        vm.prank(a);
        vault.deposit{value: amount}();
        modelBalance[a] += amount;
    }

    function withdraw(uint256 seed, uint256 amount) external {
        address a = actors[seed % actors.length];
        uint256 bal = modelBalance[a];
        amount = bal == 0 ? 0 : amount % (bal + 1);
        uint256 fee = upgraded ? _ceilFee(amount, modelFeeBps) : 0;
        uint256 ethBefore = a.balance;
        vm.prank(a);
        vault.withdraw(amount);
        // the withdrawer actually receives the net amount
        assertEq(a.balance - ethBefore, amount - fee);
        modelBalance[a] = bal - amount;
        modelFees += fee;
        if (fee > 0) feeBearingWithdrawals++;
    }

    function overWithdraw(uint256 seed) external {
        address a = actors[seed % actors.length];
        vm.prank(a);
        uint256 before = vault.balanceOf(a);
        try vault.withdraw(modelBalance[a] + 1) {
            revert("over-withdraw succeeded");
        } catch (bytes memory err) {
            assertTrue(bytes4(err) == VaultV1.InsufficientBalance.selector); // the right error, not any revert
            assertEq(vault.balanceOf(a), before); // and nothing changed
            overWithdrawReverts++;
        }
    }

    function upgradeToV2(uint256 feeBps) external {
        if (upgraded) return;
        feeBps = feeBps % 501;
        VaultV2 impl = new VaultV2();
        vault.upgradeToAndCall(address(impl), abi.encodeCall(VaultV2.initializeV2, (feeBps)));
        upgraded = true;
        modelFeeBps = feeBps;
        assertEq(VaultV2(address(vault)).feeBps(), feeBps); // the stored rate is the requested one
    }

    function claimFees() external {
        if (!upgraded) return;
        uint256 ethBefore = address(this).balance;
        VaultV2(address(vault)).claimFees();
        assertEq(address(this).balance - ethBefore, modelFees); // the owner actually receives the fees
        if (modelFees > 0) claimsWithFees++;
        modelFees = 0;
    }
}

contract VaultInvariants is Base {
    VaultV1 vault;
    VaultHandler handler;

    function setUp() public {
        handler = new VaultHandler();
        vault = handler.vault();
    }

    function targetContracts() public view returns (address[] memory t) {
        t = new address[](1);
        t[0] = address(handler);
    }

    /// ETH held == sum of account balances + accrued fees.
    function invariant_conservation() public view {
        uint256 sum;
        for (uint256 i; i < handler.actorCount(); i++) sum += vault.balanceOf(handler.actors(i));
        uint256 fees = handler.upgraded() ? VaultV2(address(vault)).accruedFees() : 0;
        assertEq(address(vault).balance, sum + fees);
    }

    /// Each account balance equals the handler's independent ledger.
    function invariant_matchesModel() public view {
        for (uint256 i; i < handler.actorCount(); i++) {
            address a = handler.actors(i);
            assertEq(vault.balanceOf(a), handler.modelBalance(a));
        }
    }

    /// Accrued fees equal the model's fee total.
    function invariant_feesMatchModel() public view {
        if (handler.upgraded()) assertEq(VaultV2(address(vault)).accruedFees(), handler.modelFees());
    }
}

/// Directed sequences: the invariants above would pass vacuously if the fuzzer never reached V2's fee paths.
contract VaultV2Directed is Base {
    VaultV1 vault;
    address constant OWNER = address(0xF00D);
    address constant USER = address(0xBEEF);

    function setUp() public {
        VaultV1 impl = new VaultV1();
        vault = VaultV1(address(new ERC1967Proxy(address(impl), abi.encodeCall(VaultV1.initialize, (OWNER)))));
        vm.deal(USER, 100 ether);
        vm.prank(USER);
        vault.deposit{value: 10 ether}();
    }

    function _upgrade(uint256 bps) private returns (VaultV2 v2) {
        VaultV2 impl = new VaultV2();
        vm.prank(OWNER);
        vault.upgradeToAndCall(address(impl), abi.encodeCall(VaultV2.initializeV2, (bps)));
        v2 = VaultV2(address(vault));
    }

    function test_depositUpgradeWithdrawClaim() public {
        VaultV2 v2 = _upgrade(200);
        assertEq(v2.balanceOf(USER), 10 ether); // pre-upgrade balance preserved
        uint256 before = USER.balance;
        vm.prank(USER);
        v2.withdraw(1 ether);
        assertEq(USER.balance - before, 0.98 ether);
        assertEq(v2.accruedFees(), 0.02 ether);
        uint256 ownerBefore = OWNER.balance;
        vm.prank(OWNER);
        v2.claimFees();
        assertEq(OWNER.balance - ownerBefore, 0.02 ether);
        assertEq(address(v2).balance, 9 ether);
    }

    function test_rateAboveCapRejected() public {
        VaultV2 impl = new VaultV2();
        vm.prank(OWNER);
        vm.expectPartialRevert(VaultV2.FeeTooHigh.selector);
        vault.upgradeToAndCall(address(impl), abi.encodeCall(VaultV2.initializeV2, (501)));
        VaultV2 v2 = _upgrade(500);
        vm.prank(OWNER);
        vm.expectPartialRevert(VaultV2.FeeTooHigh.selector);
        v2.setFee(501);
    }

    function test_nonOwnerCannotSetFeeOrClaim() public {
        VaultV2 v2 = _upgrade(100);
        vm.prank(USER);
        vm.expectPartialRevert(bytes4(keccak256("OwnableUnauthorizedAccount(address)")));
        v2.setFee(0);
        vm.prank(USER);
        vm.expectPartialRevert(bytes4(keccak256("OwnableUnauthorizedAccount(address)")));
        v2.claimFees();
    }

    /// Splitting a withdrawal never pays less total fee than withdrawing it at once (fee rounds up).
    function testFuzz_splittingCannotAvoidFee(uint16 bps, uint32 total, uint8 parts) public {
        bps = uint16(bps % 501);
        parts = uint8(1 + (parts % 20));
        uint256 amount = uint256(total) % 10 ether;
        VaultV2 v2 = _upgrade(bps);

        vm.startPrank(USER);
        uint256 each = amount / parts;
        for (uint256 i; i < parts; i++) v2.withdraw(each);
        vm.stopPrank();
        uint256 splitFees = v2.accruedFees();

        uint256 singleFee = (each * parts * bps + 9_999) / 10_000;
        assertTrue(splitFees >= singleFee);
    }

    /// Fee never exceeds the cap share of the amount (+1 wei of rounding) and never exceeds the amount.
    function testFuzz_feeBounded(uint16 bps, uint96 amount) public {
        bps = uint16(bps % 501);
        vm.assume(amount <= 10 ether);
        VaultV2 v2 = _upgrade(bps);
        vm.prank(USER);
        v2.withdraw(amount);
        uint256 fee = v2.accruedFees();
        assertTrue(fee <= amount);
        assertTrue(fee <= (uint256(amount) * 500) / 10_000 + 1);
    }

    /// Extreme amounts do not overflow the fee calculation: amount * 500 would overflow a plain uint256 multiply.
    function test_hugeAmountFeeDoesNotOverflow() public {
        VaultV2 v2 = _upgrade(500);
        uint256 huge = type(uint256).max / 2;
        vm.deal(USER, huge);
        vm.prank(USER);
        v2.deposit{value: huge}();
        vm.prank(USER);
        v2.withdraw(huge);
        assertEq(v2.accruedFees(), Math.mulDiv(huge, 500, 10_000, Math.Rounding.Ceil));
    }
}
