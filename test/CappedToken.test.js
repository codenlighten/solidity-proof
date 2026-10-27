const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("CappedToken (ERC-20)", () => {
  async function deploy() {
    const [admin, alice, bob] = await ethers.getSigners();
    const t = await ethers.deployContract("CappedToken", ["Cap", "CAP", 1000n, admin.address]);
    return { t, admin, alice, bob };
  }

  it("mints up to the cap and reverts beyond it", async () => {
    const { t, alice } = await loadFixture(deploy);
    await t.mint(alice.address, 1000n);
    await expect(t.mint(alice.address, 1n)).to.be.revertedWithCustomError(t, "CapExceeded").withArgs(1001n, 1000n);
  });

  it("must-fail: non-minter cannot mint", async () => {
    const { t, alice } = await loadFixture(deploy);
    await expect(t.connect(alice).mint(alice.address, 1n)).to.be.revertedWithCustomError(t, "AccessControlUnauthorizedAccount");
  });

  it("burn frees cap headroom", async () => {
    const { t, alice } = await loadFixture(deploy);
    await t.mint(alice.address, 1000n);
    await t.connect(alice).burn(400n);
    await t.mint(alice.address, 400n);
    expect(await t.totalSupply()).to.equal(1000n);
  });

  it("transfers and allowances behave per ERC-20", async () => {
    const { t, alice, bob } = await loadFixture(deploy);
    await t.mint(alice.address, 100n);
    await t.connect(alice).approve(bob.address, 60n);
    await t.connect(bob).transferFrom(alice.address, bob.address, 50n);
    expect(await t.balanceOf(bob.address)).to.equal(50n);
    expect(await t.allowance(alice.address, bob.address)).to.equal(10n);
    await expect(t.connect(bob).transferFrom(alice.address, bob.address, 11n)).to.be.revertedWithCustomError(t, "ERC20InsufficientAllowance");
  });

  it("EIP-2612 permit sets allowance and rejects replay", async () => {
    const { t, alice, bob } = await loadFixture(deploy);
    const { chainId } = await ethers.provider.getNetwork();
    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
    const domain = { name: "Cap", version: "1", chainId, verifyingContract: await t.getAddress() };
    const types = { Permit: [
      { name: "owner", type: "address" }, { name: "spender", type: "address" },
      { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] };
    const msg = { owner: alice.address, spender: bob.address, value: 5n, nonce: 0n, deadline };
    const { v, r, s } = ethers.Signature.from(await alice.signTypedData(domain, types, msg));
    await t.permit(alice.address, bob.address, 5n, deadline, v, r, s);
    expect(await t.allowance(alice.address, bob.address)).to.equal(5n);
    await expect(t.permit(alice.address, bob.address, 5n, deadline, v, r, s)).to.be.revertedWithCustomError(t, "ERC2612InvalidSigner");
  });

  it("fuzz-style: random mint/burn sequences never exceed the cap", async () => {
    const { t, admin, alice } = await loadFixture(deploy);
    let supply = 0n, seed = 12345n;
    for (let i = 0; i < 60; i++) {
      seed = (seed * 6364136223846793005n + 1442695040888963407n) % 2n ** 64n;
      const amt = seed % 400n;
      if (seed % 3n === 0n && supply > 0n) { const b = amt % (supply + 1n); await t.connect(alice).burn(b).catch(() => {}); }
      else { try { await t.mint(alice.address, amt); } catch {} }
      supply = await t.totalSupply();
      expect(supply).to.be.lte(1000n);
    }
  });
});
