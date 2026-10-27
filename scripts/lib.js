const { ethers, upgrades } = require("hardhat");

/** Deploys the token, NFT and vault proxy. The proxy is initialized in the same transaction. */
async function deployAll(admin) {
  const token = await ethers.deployContract("CappedToken", ["Demo Token", "DEMO", ethers.parseEther("1000000"), admin]);
  const nft = await ethers.deployContract("Collectible", ["ipfs://demo/", 100n, ethers.parseEther("0.01"), admin, 500]);
  const Vault = await ethers.getContractFactory("VaultV1");
  const vault = await upgrades.deployProxy(Vault, [admin], { kind: "uups" });
  await Promise.all([token, nft, vault].map((c) => c.waitForDeployment()));
  return { token, nft, vault };
}

/** Upgrades the vault proxy to V2 and initializes V2 atomically. */
async function upgradeVault(vault, feeBps) {
  const V2 = await ethers.getContractFactory("VaultV2");
  return upgrades.upgradeProxy(vault, V2, { call: { fn: "initializeV2", args: [feeBps] } });
}

module.exports = { deployAll, upgradeVault };
