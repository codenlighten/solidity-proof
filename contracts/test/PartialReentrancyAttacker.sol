// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IVaultLike {
    function deposit() external payable;
    function withdraw(uint256) external;
}

/// @notice Test helper: deposits 2x, withdraws x, and re-enters once from its receive hook to take the
/// remaining x. Checks-effects-interactions does not stop this (the balance is still legitimately there);
/// only a reentrancy guard does.
contract PartialReentrancyAttacker {
    IVaultLike public immutable vault;
    bool private reentered;

    constructor(IVaultLike v) { vault = v; }

    function attack() external payable {
        vault.deposit{value: msg.value}();
        vault.withdraw(msg.value / 2);
    }

    receive() external payable {
        if (!reentered) {
            reentered = true;
            vault.withdraw(msg.value);
        }
    }
}
