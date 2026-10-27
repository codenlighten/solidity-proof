// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IVault {
    function deposit() external payable;
    function withdraw(uint256) external;
}

/// @notice Test helper: tries to re-enter Vault.withdraw from its receive hook.
contract ReentrancyAttacker {
    IVault public immutable vault;
    uint256 public reentered;

    constructor(IVault v) { vault = v; }

    function attack() external payable {
        vault.deposit{value: msg.value}();
        vault.withdraw(msg.value);
    }

    receive() external payable {
        if (address(vault).balance >= msg.value && reentered < 3) {
            reentered++;
            vault.withdraw(msg.value);
        }
    }
}
