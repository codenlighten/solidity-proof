const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Gas: naive vs optimized airdrop", () => {
  const N = 50;
  const recipients = Array.from({ length: N }, (_, i) => ethers.getAddress(ethers.toBeHex(0x1000 + i, 20)));

  async function run(name) {
    const c = await ethers.deployContract(name);
    const tx = await c.distribute(recipients, 7n);
    const r = await tx.wait();
    return { c, gas: r.gasUsed };
  }

  it("optimized is behaviourally identical and cheaper", async () => {
    const a = await run("AirdropNaive");
    const b = await run("AirdropOptimized");
    expect(await a.c.total()).to.equal(await b.c.total());
    expect(await a.c.total()).to.equal(7n * BigInt(N));
    for (const r of recipients) expect(await b.c.credits(r)).to.equal(await a.c.credits(r));
    const saved = Number(a.gas - b.gas);
    console.log(`      naive ${a.gas}  optimized ${b.gas}  saved ${saved} (${((100 * saved) / Number(a.gas)).toFixed(1)}%)`);
    expect(b.gas).to.be.lt(a.gas);
  });

  it("repeated recipients (warm slots): the loop overhead is what remains", async () => {
    const same = Array.from({ length: N }, () => recipients[0]);
    const a = await ethers.deployContract("AirdropNaive");
    const b = await ethers.deployContract("AirdropOptimized");
    const ga = (await (await a.distribute(same, 7n)).wait()).gasUsed;
    const gb = (await (await b.distribute(same, 7n)).wait()).gasUsed;
    console.log(`      warm: naive ${ga}  optimized ${gb}  saved ${ga - gb} (${((100 * Number(ga - gb)) / Number(ga)).toFixed(1)}%)`);
    expect(await a.credits(recipients[0])).to.equal(await b.credits(recipients[0]));
    expect(gb).to.be.lt(ga);
  });

  it("scaling: saving vs number of recipients (cold slots)", async () => {
    const rows = [];
    for (const n of [1, 2, 10, 50, 100]) {
      const rs = Array.from({ length: n }, (_, i) => ethers.getAddress(ethers.toBeHex(0x9000 + i, 20)));
      const a = await ethers.deployContract("AirdropNaive");
      const b = await ethers.deployContract("AirdropOptimized");
      const ga = (await (await a.distribute(rs, 7n)).wait()).gasUsed;
      const gb = (await (await b.distribute(rs, 7n)).wait()).gasUsed;
      rows.push(`n=${n}: naive ${ga} optimized ${gb} saved ${ga - gb}`);
      expect(gb).to.be.lte(ga);
    }
    console.log("      " + rows.join("\n      "));
  });

  it("must-fail: both reject non-owner callers", async () => {
    const [, eve] = await ethers.getSigners();
    for (const name of ["AirdropNaive", "AirdropOptimized"]) {
      const c = await ethers.deployContract(name);
      await expect(c.connect(eve).distribute(recipients, 1n)).to.be.reverted;
    }
  });

  it("optimized still reverts on overflow of total", async () => {
    const c = await ethers.deployContract("AirdropOptimized");
    await expect(c.distribute(recipients, 2n ** 255n)).to.be.reverted;
  });
});
