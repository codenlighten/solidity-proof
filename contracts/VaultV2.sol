// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {VaultV1} from "./VaultV1.sol";

/// @notice V2 adds a withdrawal fee. New state is appended after V1's variables only.
/// @custom:oz-upgrades-from VaultV1
/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract VaultV2 is VaultV1 {
    uint256 public feeBps;
    uint256 public accruedFees;

    event FeeCharged(address indexed account, uint256 fee);
    event FeeUpdated(uint256 feeBps);
    event FeesClaimed(address indexed to, uint256 amount);

    error FeeTooHigh();

    function initializeV2(uint256 feeBps_) external onlyOwner reinitializer(2) {
        _setFee(feeBps_);
    }

    function setFee(uint256 bps) external onlyOwner {
        _setFee(bps);
    }

    function claimFees() external nonReentrant onlyOwner {
        uint256 amount = accruedFees;
        accruedFees = 0;
        emit FeesClaimed(owner(), amount);
        (bool ok,) = owner().call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function withdraw(uint256 amount) external override nonReentrant {
        uint256 bal = balanceOf[msg.sender];
        if (bal < amount) revert InsufficientBalance();
        // Rounded UP in the vault's favour: rounding down would let a user avoid the fee by splitting
        // a withdrawal into many small ones. mulDiv also avoids overflow in amount * feeBps.
        uint256 fee = Math.mulDiv(amount, feeBps, 10_000, Math.Rounding.Ceil);
        unchecked { balanceOf[msg.sender] = bal - amount; }
        accruedFees += fee;
        emit Withdrawn(msg.sender, amount);
        emit FeeCharged(msg.sender, fee);
        (bool ok,) = msg.sender.call{value: amount - fee}("");
        if (!ok) revert TransferFailed();
    }

    function version() external pure override returns (uint256) { return 2; }

    function _setFee(uint256 bps) private {
        if (bps > 500) revert FeeTooHigh();
        feeBps = bps;
        emit FeeUpdated(bps);
    }
}
