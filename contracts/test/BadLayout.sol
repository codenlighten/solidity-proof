// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @notice Deliberately incompatible with VaultV1 (inserts a slot before `balanceOf`); tests assert the upgrade is refused.
/// @custom:oz-upgrades-from VaultV1
contract BadLayout is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    uint256 public inserted;
    mapping(address => uint256) public balanceOf;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address o) external initializer { __Ownable_init(o); }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
