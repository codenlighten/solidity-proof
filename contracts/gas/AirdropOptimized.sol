// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Same behaviour as AirdropNaive, same events, fewer gas. Each change is listed in docs/GAS.md.
contract AirdropOptimized {
    address public immutable owner;
    uint256 public total;
    mapping(address => uint256) public credits;

    event Credited(address indexed to, uint256 amount);

    error NotOwner();

    constructor() { owner = msg.sender; }

    function distribute(address[] calldata recipients, uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        uint256 n = recipients.length;
        for (uint256 i; i < n;) {
            address to = recipients[i];
            credits[to] += amount;
            emit Credited(to, amount);
            unchecked { ++i; }
        }
        total += amount * n; // one SSTORE instead of n; checked, so overflow still reverts
    }
}
