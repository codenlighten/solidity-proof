const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("Collectible (ERC-721)", () => {
  const price = ethers.parseEther("0.1");
  async function deploy() {
    const [owner, alice, bob] = await ethers.getSigners();
    const c = await ethers.deployContract("Collectible", ["ipfs://base/", 3n, price, owner.address, 500]);
    return { c, owner, alice, bob };
  }

  it("mints sequential ids for the exact price and sets tokenURI", async () => {
    const { c, alice } = await loadFixture(deploy);
    await c.connect(alice).mint({ value: price });
    expect(await c.ownerOf(0)).to.equal(alice.address);
    expect(await c.tokenURI(0)).to.equal("ipfs://base/0");
    expect(await c.tokenOfOwnerByIndex(alice.address, 0)).to.equal(0n);
  });

  it("must-fail: wrong payment, sold out", async () => {
    const { c, alice } = await loadFixture(deploy);
    await expect(c.connect(alice).mint({ value: price - 1n })).to.be.revertedWithCustomError(c, "WrongPayment");
    for (let i = 0; i < 3; i++) await c.connect(alice).mint({ value: price });
    await expect(c.connect(alice).mint({ value: price })).to.be.revertedWithCustomError(c, "SoldOut");
  });

  it("transfers, approvals and safe-transfer to non-receiver contracts", async () => {
    const { c, alice, bob } = await loadFixture(deploy);
    await c.connect(alice).mint({ value: price });
    await c.connect(alice).approve(bob.address, 0);
    await c.connect(bob).transferFrom(alice.address, bob.address, 0);
    expect(await c.ownerOf(0)).to.equal(bob.address);
    await expect(c.connect(bob)["safeTransferFrom(address,address,uint256)"](bob.address, await c.getAddress(), 0))
      .to.be.revertedWithCustomError(c, "ERC721InvalidReceiver");
  });

  it("EIP-2981 royalty is 5% to owner", async () => {
    const { c, owner } = await loadFixture(deploy);
    const [rcv, amt] = await c.royaltyInfo(0, 10_000n);
    expect(rcv).to.equal(owner.address);
    expect(amt).to.equal(500n);
    expect(await c.supportsInterface("0x2a55205a")).to.equal(true);
  });

  it("only owner withdraws proceeds", async () => {
    const { c, owner, alice } = await loadFixture(deploy);
    await c.connect(alice).mint({ value: price });
    await expect(c.connect(alice).withdraw()).to.be.revertedWithCustomError(c, "OwnableUnauthorizedAccount");
    await expect(c.withdraw()).to.changeEtherBalances([c, owner], [-price, price]);
  });
});
