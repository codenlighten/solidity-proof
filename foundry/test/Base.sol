// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev The subset of Foundry cheatcodes these tests use. Declared here so the repo has no
/// third-party test library: https://book.getfoundry.sh/cheatcodes/
interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function deal(address, uint256) external;
    function expectRevert(bytes4) external;
    function expectRevert() external;
    function expectPartialRevert(bytes4) external;
    function assume(bool) external pure;
}

abstract contract Base {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error AssertEq(uint256 left, uint256 right);
    error AssertTrue();

    function assertEq(uint256 a, uint256 b) internal pure {
        if (a != b) revert AssertEq(a, b);
    }

    function assertTrue(bool c) internal pure {
        if (!c) revert AssertTrue();
    }
}
