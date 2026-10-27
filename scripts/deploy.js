// npx hardhat run scripts/deploy.js [--network sepolia]
// Reads keys from .env only (see .env.example). Use a throwaway testnet key, never a funded mainnet key.
const { ethers, network } = require("hardhat");
const { deployAll } = require("./lib");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`network ${network.name}, deployer ${deployer.address}`);
  const { token, nft, vault } = await deployAll(deployer.address);
  console.log({ token: await token.getAddress(), nft: await nft.getAddress(), vaultProxy: await vault.getAddress() });
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
