// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice DELIBERATELY VULNERABLE. Caches the balance, sends ETH, then writes the stale value back.
/// Exists only to prove the reentrancy test harness can detect a real bug. Never deploy.
contract VulnerableVault {
    mapping(address => uint256) public balanceOf;

    function deposit() external payable { balanceOf[msg.sender] += msg.value; }

    function withdraw(uint256 amount) external {
        uint256 bal = balanceOf[msg.sender];
        require(bal >= amount, "insufficient");
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "send failed");
        balanceOf[msg.sender] = bal - amount;
    }
}
