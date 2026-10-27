// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice ERC-721 with enumeration, EIP-2981 royalties and a paid, supply-limited public mint.
contract Collectible is ERC721Enumerable, ERC2981, Ownable {
    uint256 public immutable maxSupply;
    uint256 public immutable mintPrice;
    uint256 private _nextId;
    string private _baseTokenURI;

    error SoldOut();
    error WrongPayment(uint256 sent, uint256 required);
    error WithdrawFailed();

    constructor(string memory baseURI_, uint256 maxSupply_, uint256 mintPrice_, address owner_, uint96 royaltyBps)
        ERC721("Collectible", "COL")
        Ownable(owner_)
    {
        maxSupply = maxSupply_;
        mintPrice = mintPrice_;
        _baseTokenURI = baseURI_;
        _setDefaultRoyalty(owner_, royaltyBps);
    }

    function mint() external payable returns (uint256 id) {
        if (msg.value != mintPrice) revert WrongPayment(msg.value, mintPrice);
        id = _nextId;
        if (id >= maxSupply) revert SoldOut();
        unchecked { _nextId = id + 1; }
        _safeMint(msg.sender, id);
    }

    function withdraw() external onlyOwner {
        (bool ok,) = owner().call{value: address(this).balance}("");
        if (!ok) revert WithdrawFailed();
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function supportsInterface(bytes4 id) public view override(ERC721Enumerable, ERC2981) returns (bool) {
        return super.supportsInterface(id);
    }
}
