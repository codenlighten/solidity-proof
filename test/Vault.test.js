const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Vault (UUPS upgradeable)", () => {
  async function deployV1() {
    const [owner, alice, mallory] = await ethers.getSigners();
    const V1 = await ethers.getContractFactory("VaultV1");
    const vault = await upgrades.deployProxy(V1, [owner.address], { kind: "uups" });
    return { V1, vault, owner, alice, mallory };
  }

  it("V1: deposit and withdraw", async () => {
    const { vault, alice } = await deployV1();
    await vault.connect(alice).deposit({ value: 10n });
    await expect(vault.connect(alice).withdraw(4n)).to.changeEtherBalance(alice, 4n);
    expect(await vault.balanceOf(alice.address)).to.equal(6n);
    await expect(vault.connect(alice).withdraw(7n)).to.be.revertedWithCustomError(vault, "InsufficientBalance");
  });

  it("must-fail: implementation cannot be initialized directly; proxy cannot be re-initialized", async () => {
    const { vault, V1, mallory } = await deployV1();
    const impl = V1.attach(await upgrades.erc1967.getImplementationAddress(await vault.getAddress()));
    await expect(impl.initialize(mallory.address)).to.be.revertedWithCustomError(impl, "InvalidInitialization");
    await expect(vault.initialize(mallory.address)).to.be.revertedWithCustomError(vault, "InvalidInitialization");
  });

  it("must-fail: reentrancy on withdraw is blocked", async () => {
    const { vault, alice } = await deployV1();
    await vault.connect(alice).deposit({ value: 100n });
    const atk = await ethers.deployContract("ReentrancyAttacker", [await vault.getAddress()]);
    await expect(atk.attack({ value: 10n })).to.be.reverted;
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(100n);
  });

  it("harness check: the same attacker DOES drain a vault that sends before debiting", async () => {
    const [, alice] = await ethers.getSigners();
    const bad = await ethers.deployContract("VulnerableVault");
    await bad.connect(alice).deposit({ value: 100n });
    const atk = await ethers.deployContract("ReentrancyAttacker", [await bad.getAddress()]);
    await atk.attack({ value: 10n });
    // attacker put in 10 and took 40 (initial + 3 re-entries); vault went 110 -> 70
    expect(await ethers.provider.getBalance(await bad.getAddress())).to.equal(70n);
    expect(await ethers.provider.getBalance(await atk.getAddress())).to.equal(40n);
  });

  it("upgrade to V2 preserves state and adds new state", async () => {
    const { vault, alice, owner } = await deployV1();
    await vault.connect(alice).deposit({ value: 500n });
    const V2 = await ethers.getContractFactory("VaultV2");
    const v2 = await upgrades.upgradeProxy(vault, V2, { call: { fn: "initializeV2", args: [100] } });
    expect(await v2.version()).to.equal(2n);
    expect(await v2.balanceOf(alice.address)).to.equal(500n);
    expect(await v2.owner()).to.equal(owner.address);
    expect(await v2.feeBps()).to.equal(100n);
    await expect(v2.connect(alice).withdraw(200n)).to.changeEtherBalance(alice, 198n);
    expect(await v2.accruedFees()).to.equal(2n);
    await expect(v2.claimFees()).to.changeEtherBalance(owner, 2n);
    await expect(v2.connect(alice).setFee(1)).to.be.revertedWithCustomError(v2, "OwnableUnauthorizedAccount");
    await expect(v2.setFee(501)).to.be.revertedWithCustomError(v2, "FeeTooHigh");
  });

  it("must-fail: initializeV2 is owner-only, and runs once", async () => {
    const { vault, alice, owner } = await deployV1();
    const V2 = await ethers.getContractFactory("VaultV2");
    const v2 = await upgrades.upgradeProxy(vault, V2);
    await expect(v2.connect(alice).initializeV2(500)).to.be.revertedWithCustomError(v2, "OwnableUnauthorizedAccount");
    await v2.connect(owner).initializeV2(500);
    await expect(v2.initializeV2(1)).to.be.revertedWithCustomError(v2, "InvalidInitialization");
  });

  it("V2 emits gross Withdrawn and a separate FeeCharged", async () => {
    const { vault, alice } = await deployV1();
    await vault.connect(alice).deposit({ value: 500n });
    const V2 = await ethers.getContractFactory("VaultV2");
    const v2 = await upgrades.upgradeProxy(vault, V2, { call: { fn: "initializeV2", args: [100] } });
    await expect(v2.connect(alice).withdraw(200n)).to.emit(v2, "Withdrawn").withArgs(alice.address, 200n)
      .and.to.emit(v2, "FeeCharged").withArgs(alice.address, 2n);
  });

  it("must-fail: non-owner cannot upgrade", async () => {
    const { vault, mallory } = await deployV1();
    const V2 = await ethers.getContractFactory("VaultV2", mallory);
    const impl = await V2.deploy();
    await expect(vault.connect(mallory).upgradeToAndCall(await impl.getAddress(), "0x"))
      .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
  });

  it("must-fail: layout-incompatible upgrade is rejected by the plugin", async () => {
    const { vault } = await deployV1();
    const Bad = await ethers.getContractFactory("BadLayout");
    await expect(upgrades.upgradeProxy(vault, Bad)).to.be.rejectedWith(/storage layout|incompatible/i);
  });
});
