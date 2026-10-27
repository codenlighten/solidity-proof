// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Baseline for the gas comparison. Written the obvious way; see AirdropOptimized for the diff.
contract AirdropNaive {
    address public owner;
    uint256 public total;
    mapping(address => uint256) public credits;

    event Credited(address indexed to, uint256 amount);

    constructor() { owner = msg.sender; }

    function distribute(address[] memory recipients, uint256 amount) external {
        require(msg.sender == owner, "not owner");
        for (uint256 i = 0; i < recipients.length; i++) {
            credits[recipients[i]] = credits[recipients[i]] + amount;
            total = total + amount;
            emit Credited(recipients[i], amount);
        }
    }
}
