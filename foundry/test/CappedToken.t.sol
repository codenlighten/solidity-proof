// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Base} from "./Base.sol";
import {CappedToken} from "contracts/CappedToken.sol";

contract CappedTokenFuzz is Base {
    CappedToken token;
    uint256 constant CAP = 1_000_000e18;
    address constant ADMIN = address(0xA11CE);

    function setUp() public {
        token = new CappedToken("Cap", "CAP", CAP, ADMIN);
    }

    /// Any sequence of two mints never takes total supply past the cap; a mint that would revert.
    function testFuzz_mintNeverExceedsCap(uint256 a, uint256 b) public {
        vm.startPrank(ADMIN);
        uint256 supply;
        bool ok1;
        bool ok2;
        try token.mint(address(1), a) { supply += a; ok1 = true; } catch {}
        // a mint must succeed exactly when it fits under the cap (a token that rejects every mint fails here)
        assertTrue(ok1 == (a <= CAP));
        uint256 room = CAP - supply; // supply <= CAP here
        try token.mint(address(2), b) { supply += b; ok2 = true; } catch {}
        assertTrue(ok2 == (b <= room));
        vm.stopPrank();
        assertEq(token.totalSupply(), supply);
        assertTrue(token.totalSupply() <= CAP);
    }

    /// A mint over the cap reverts with CapExceeded.
    function testFuzz_overCapReverts(uint256 over) public {
        vm.assume(over > 0 && over <= type(uint128).max);
        vm.startPrank(ADMIN);
        token.mint(address(1), CAP);
        vm.expectPartialRevert(CappedToken.CapExceeded.selector);
        token.mint(address(1), over);
        vm.stopPrank();
    }

    /// Transfers conserve total supply and the two balances.
    function testFuzz_transferConserves(uint128 minted, uint128 sent) public {
        vm.assume(minted <= CAP && sent <= minted);
        vm.prank(ADMIN);
        token.mint(address(1), minted);
        vm.prank(address(1));
        token.transfer(address(2), sent);
        assertEq(token.balanceOf(address(1)) + token.balanceOf(address(2)), minted);
        assertEq(token.totalSupply(), minted);
    }

    /// Only the minter role can mint, whatever the caller and amount.
    function testFuzz_nonMinterCannotMint(address caller, uint256 amount) public {
        vm.assume(caller != ADMIN);
        vm.prank(caller);
        vm.expectRevert();
        token.mint(caller, amount);
    }
}
