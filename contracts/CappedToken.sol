// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @notice ERC-20 with a hard supply cap, role-gated minting, burning and EIP-2612 permits.
contract CappedToken is ERC20, ERC20Permit, ERC20Burnable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint256 public immutable cap;

    error CapExceeded(uint256 attempted, uint256 cap);

    constructor(string memory name_, string memory symbol_, uint256 cap_, address admin)
        ERC20(name_, symbol_)
        ERC20Permit(name_)
    {
        cap = cap_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        uint256 newSupply = totalSupply() + amount;
        if (newSupply > cap) revert CapExceeded(newSupply, cap);
        _mint(to, amount);
    }
}
