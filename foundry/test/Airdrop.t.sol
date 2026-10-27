// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Base} from "./Base.sol";
import {AirdropNaive} from "contracts/gas/AirdropNaive.sol";
import {AirdropOptimized} from "contracts/gas/AirdropOptimized.sol";

/// Differential fuzzing: the optimized contract must match the naive one on arbitrary input,
/// including duplicate recipients and overflowing totals.
contract AirdropDifferential is Base {
    function testFuzz_sameStateOrSameRevert(address[] calldata recipients, uint256 amount) public {
        AirdropNaive a = new AirdropNaive();
        AirdropOptimized b = new AirdropOptimized();

        (bool okA, bytes memory outA) = _try(address(a), recipients, amount);
        (bool okB, bytes memory outB) = _try(address(b), recipients, amount);
        assertEq(okA ? 1 : 0, okB ? 1 : 0);
        if (!okA) {
            // both fail, and for the same class of reason: arithmetic overflow (Panic) is the only expected one
            assertTrue(bytes4(outA) == bytes4(outB));
            return;
        }

        assertEq(a.total(), b.total());
        for (uint256 i; i < recipients.length; i++) {
            assertEq(a.credits(recipients[i]), b.credits(recipients[i]));
        }
    }

    function _try(address target, address[] calldata recipients, uint256 amount) private returns (bool ok, bytes memory out) {
        (ok, out) = target.call(abi.encodeWithSignature("distribute(address[],uint256)", recipients, amount));
    }
}
