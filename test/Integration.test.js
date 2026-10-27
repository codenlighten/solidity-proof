const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, upgradeVault } = require("../scripts/lib");
const { VaultIndexer } = require("../scripts/indexer");

describe("Integration: deploy, upgrade, index, client", () => {
  it("deploy script wiring produces working token, NFT and vault", async () => {
    const [admin, alice] = await ethers.getSigners();
    const { token, nft, vault } = await deployAll(admin.address);
    await token.mint(alice.address, 10n);
    await nft.connect(alice).mint({ value: await nft.mintPrice() });
    await vault.connect(alice).deposit({ value: 5n });
    expect(await token.balanceOf(alice.address)).to.equal(10n);
    expect(await nft.ownerOf(0)).to.equal(alice.address);
    expect(await vault.balanceOf(alice.address)).to.equal(5n);
  });

  it("indexer rebuilds balances from events across the V1 to V2 upgrade and matches the chain", async () => {
    const [admin, alice, bob] = await ethers.getSigners();
    const { vault } = await deployAll(admin.address);
    const idx = new VaultIndexer(await vault.getAddress(), ethers.provider, { confirmations: 0, maxRange: 3 });

    await vault.connect(alice).deposit({ value: 1000n });
    await vault.connect(bob).deposit({ value: 300n });
    await vault.connect(alice).withdraw(100n);
    await idx.sync();

    const v2 = await upgradeVault(vault, 200); // 2% fee
    await v2.connect(alice).deposit({ value: 50n });
    await v2.connect(alice).withdraw(500n); // fee 10, gross 500 debited
    await v2.connect(bob).withdraw(300n);
    await idx.sync();
    await idx.sync(); // idempotent when nothing new

    expect(idx.balanceOf(alice.address)).to.equal(450n);
    expect(idx.balanceOf(bob.address)).to.equal(0n);
    expect(await idx.verify()).to.deep.equal([]);
  });

  it("must-fail: respects confirmations (does not index unconfirmed blocks)", async () => {
    const [admin, alice] = await ethers.getSigners();
    const { vault } = await deployAll(admin.address);
    const idx = new VaultIndexer(await vault.getAddress(), ethers.provider, { confirmations: 2, maxRange: 5 });
    await vault.connect(alice).deposit({ value: 10n });
    await idx.sync();
    expect(idx.balanceOf(alice.address)).to.equal(0n); // deposit block is only 0 deep
    await ethers.provider.send("hardhat_mine", ["0x2"]);
    await idx.sync();
    expect(idx.balanceOf(alice.address)).to.equal(10n);
  });

  it("must-fail: detects a reorg and rebuilds from the new chain", async () => {
    const [admin, alice, bob] = await ethers.getSigners();
    const { vault } = await deployAll(admin.address);
    const idx = new VaultIndexer(await vault.getAddress(), ethers.provider, { confirmations: 0, maxRange: 4 });
    await vault.connect(alice).deposit({ value: 10n });
    await idx.sync();
    const snap = await ethers.provider.send("evm_snapshot", []);
    await vault.connect(bob).deposit({ value: 99n }); // will be reorged out
    await idx.sync();
    expect(idx.balanceOf(bob.address)).to.equal(99n);

    await ethers.provider.send("evm_revert", [snap]); // chain rolls back past bob's deposit
    await vault.connect(alice).deposit({ value: 5n }); // different block at the same height
    await ethers.provider.send("hardhat_mine", ["0x1"]);
    await idx.sync();
    expect(idx.reorgs).to.equal(1);
    expect(idx.balanceOf(bob.address)).to.equal(0n);
    expect(idx.balanceOf(alice.address)).to.equal(15n);
    expect(await idx.verify()).to.deep.equal([]);
  });

  it("serializes overlapping sync() calls", async () => {
    const [admin, alice] = await ethers.getSigners();
    const { vault } = await deployAll(admin.address);
    const idx = new VaultIndexer(await vault.getAddress(), ethers.provider, { confirmations: 0, maxRange: 2 });
    for (let i = 0; i < 4; i++) await vault.connect(alice).deposit({ value: 1n });
    await Promise.all([idx.sync(), idx.sync(), idx.sync()]);
    expect(idx.balanceOf(alice.address)).to.equal(4n); // not double-counted
  });

  it("must-fail: a wrong index is detected by verify()", async () => {
    const [admin, alice] = await ethers.getSigners();
    const { vault } = await deployAll(admin.address);
    const idx = new VaultIndexer(await vault.getAddress(), ethers.provider, { confirmations: 0, maxRange: 3 });
    await vault.connect(alice).deposit({ value: 10n });
    await idx.sync();
    idx.balances.set(alice.address, 11n);
    const bad = await idx.verify();
    expect(bad).to.have.length(1);
    expect(bad[0].onChain).to.equal(10n);
  });
});

describe("Front-end client", () => {
  let friendlyError;
  before(async () => ({ friendlyError } = await import("../web/vault-client.js")));

  it("maps custom errors and wallet rejection to readable messages", async () => {
    const [admin, alice] = await ethers.getSigners();
    const { vault } = await deployAll(admin.address);
    let caught;
    try { await vault.connect(alice).withdraw(1n); } catch (e) { caught = e; }
    expect(friendlyError(caught)).to.equal("Amount is more than your vault balance.");
    expect(friendlyError({ code: "ACTION_REJECTED" })).to.equal("Transaction rejected in wallet.");
    expect(friendlyError({ info: { error: { code: 4001 } } })).to.equal("Transaction rejected in wallet.");
    // an outer data string that is not ours must not hide a decodable inner error
    expect(friendlyError({ data: "0xdeadbeef", info: { error: { data: caught.data } } }))
      .to.equal("Amount is more than your vault balance.");
    expect(friendlyError({})).to.equal("The transaction failed. Check the amount and try again.");
  });

  it("VaultClient reads and writes through an ethers signer", async () => {
    const [admin, alice] = await ethers.getSigners();
    const { vault } = await deployAll(admin.address);
    const { VaultClient, VAULT_ABI } = await import("../web/vault-client.js");
    const c = new VaultClient(new ethers.Contract(await vault.getAddress(), VAULT_ABI, alice), alice.address);
    await c.deposit("0.5");
    expect(await c.balance()).to.equal("0.5");
    await c.withdraw("0.2");
    expect(await c.balance()).to.equal("0.3");
  });
});
