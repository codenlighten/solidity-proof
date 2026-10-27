// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Base} from "./Base.sol";
import {Collectible} from "contracts/Collectible.sol";

contract CollectibleFuzz is Base {
    uint256 constant MAX = 5;
    uint256 constant PRICE = 0.1 ether;
    Collectible nft;
    address constant OWNER = address(0xB0B);

    function setUp() public {
        nft = new Collectible("ipfs://x/", MAX, PRICE, OWNER, 500);
    }

    /// However many mints are attempted, supply stops at MAX and ETH held equals price * minted.
    function testFuzz_supplyCapAndProceeds(uint8 attempts) public {
        address minter = address(0xCAFE);
        vm.deal(minter, 1000 ether);
        uint256 minted;
        for (uint256 i; i < attempts; i++) {
            vm.prank(minter);
            try nft.mint{value: PRICE}() { minted++; } catch {}
        }
        assertEq(nft.totalSupply(), minted);
        assertTrue(minted <= MAX);
        assertEq(address(nft).balance, PRICE * minted);
    }

    /// Any payment other than the exact price reverts.
    function testFuzz_wrongPaymentReverts(uint256 pay) public {
        vm.assume(pay != PRICE && pay <= 1000 ether);
        vm.deal(address(this), pay);
        vm.expectPartialRevert(Collectible.WrongPayment.selector);
        nft.mint{value: pay}();
    }

    /// Royalty is always salePrice * 5%, rounded down, for any sale price.
    function testFuzz_royalty(uint128 salePrice) public view {
        (address rcv, uint256 amt) = nft.royaltyInfo(0, salePrice);
        assertEq(amt, (uint256(salePrice) * 500) / 10_000);
        assertTrue(rcv == OWNER);
    }
}
