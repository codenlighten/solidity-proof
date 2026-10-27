// VAULT_PROXY=0x... FEE_BPS=100 npx hardhat run scripts/upgrade.js --network <name>
const { ethers } = require("hardhat");
const { upgradeVault } = require("./lib");

async function main() {
  const proxy = process.env.VAULT_PROXY;
  if (!ethers.isAddress(proxy)) throw new Error("set VAULT_PROXY to the vault proxy address");
  const vault = await ethers.getContractAt("VaultV1", proxy);
  const v2 = await upgradeVault(vault, Number(process.env.FEE_BPS ?? 0));
  console.log("upgraded; version", (await v2.version()).toString());
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
