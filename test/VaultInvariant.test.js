const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, upgradeVault } = require("../scripts/lib");

// Seeded PRNG (mulberry32) so a failing sequence replays exactly.
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Conservation check over every account that interacts with the vault (5 accounts) across random
// operation sequences. Assumes no forced ETH (selfdestruct/coinbase): with it, equality would not hold.
// This is a seeded regression test, not a proof; Foundry-style invariant runs would explore far more.
describe("Vault conservation: ETH held == sum(balances of all interacting accounts) + accruedFees", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`random op sequence, seed ${seed}, with a mid-run V1 to V2 upgrade`, async () => {
      const signers = (await ethers.getSigners()).slice(0, 6);
      const users = signers.slice(1);
      const { vault: v1 } = await deployAll(signers[0].address);
      let vault = v1;
      const addr = await v1.getAddress();
      const rand = rng(seed);

      const check = async (step) => {
        let sum = 0n;
        for (const u of users) sum += await vault.balanceOf(u.address);
        const fees = (await vault.version()) === 2n ? await vault.accruedFees() : 0n;
        const held = await ethers.provider.getBalance(addr);
        expect(held, `seed ${seed} step ${step}`).to.equal(sum + fees);
      };

      for (let step = 0; step < 80; step++) {
        if (step === 40) { vault = await upgradeVault(v1, Math.floor(rand() * 501)); await check(step); }
        const u = users[Math.floor(rand() * users.length)];
        const op = rand();
        if (op < 0.5) {
          await vault.connect(u).deposit({ value: BigInt(Math.floor(rand() * 10_000)) });
        } else if (op < 0.9) {
          const bal = await vault.balanceOf(u.address);
          const amt = BigInt(Math.floor(rand() * Number(bal + 1n)));
          await vault.connect(u).withdraw(amt);
        } else {
          // over-withdraw must always revert and change nothing
          const bal = await vault.balanceOf(u.address);
          await expect(vault.connect(u).withdraw(bal + 1n)).to.be.revertedWithCustomError(vault, "InsufficientBalance");
        }
        await check(step);
      }
      if ((await vault.version()) === 2n) {
        await vault.connect(signers[0]).claimFees();
        expect(await vault.accruedFees()).to.equal(0n);
        await check("end");
      }
    });
  }
});
