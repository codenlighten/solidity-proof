// Backend-service example: rebuilds per-account vault balances purely from events so a service
// can answer balance queries without a chain call per read.
//
// Event semantics (VaultV1 and VaultV2): Deposited.amount is credited to the account;
// Withdrawn.amount is the GROSS amount debited from the account (V2 reports its fee separately in
// FeeCharged, so the fee is already inside Withdrawn). These are the only events that change a balance.
//
// Safety properties:
//   - only blocks at least `confirmations` deep are indexed;
//   - the hash of the last indexed block is remembered; if the chain no longer contains it
//     (a reorg deeper than `confirmations`), the index is discarded and rebuilt from `startBlock`;
//   - scans run in chunks of `maxRange` blocks (RPC providers cap log ranges);
//   - overlapping sync() calls are serialized.
// Not covered: persistence across restarts (a production service would store balances and the
// checkpoint atomically in a database).
const { ethers } = require("ethers");

const ABI = [
  "event Deposited(address indexed account, uint256 amount)",
  "event Withdrawn(address indexed account, uint256 amount)",
  "event FeeCharged(address indexed account, uint256 fee)",
  "function balanceOf(address) view returns (uint256)",
];

class VaultIndexer {
  constructor(vaultAddress, provider, { startBlock = 0, confirmations = 12, maxRange = 2000 } = {}) {
    this.vault = new ethers.Contract(vaultAddress, ABI, provider);
    this.provider = provider;
    this.startBlock = startBlock;
    this.confirmations = confirmations;
    this.maxRange = maxRange;
    this.reorgs = 0;
    this._reset();
    this._queue = Promise.resolve();
  }

  _reset() {
    this.balances = new Map();
    this.nextBlock = this.startBlock;
    this.lastHash = null;
  }

  /** Indexes new confirmed blocks. Safe to call concurrently and repeatedly. */
  sync() {
    const run = this._queue.then(() => this._sync());
    this._queue = run.catch(() => {});
    return run;
  }

  async _sync() {
    if (this.lastHash !== null) {
      const tip = await this.provider.getBlock(this.nextBlock - 1);
      if (!tip || tip.hash !== this.lastHash) {
        this.reorgs++;
        this._reset();
      }
    }
    const head = await this.provider.getBlockNumber();
    const to = head - this.confirmations;
    while (this.nextBlock <= to) {
      const end = Math.min(this.nextBlock + this.maxRange - 1, to);
      const logs = (
        await Promise.all(
          ["Deposited", "Withdrawn"].map((e) => this.vault.queryFilter(this.vault.filters[e](), this.nextBlock, end)),
        )
      ).flat();
      logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
      for (const { eventName, args } of logs) {
        const cur = this.balances.get(args.account) ?? 0n;
        this.balances.set(args.account, eventName === "Deposited" ? cur + args.amount : cur - args.amount);
      }
      this.lastHash = (await this.provider.getBlock(end)).hash;
      this.nextBlock = end + 1;
    }
  }

  balanceOf(account) {
    return this.balances.get(ethers.getAddress(account)) ?? 0n;
  }

  /** Cross-checks every indexed account against chain state at the indexed height; returns disagreements. */
  async verify() {
    const bad = [];
    const blockTag = this.nextBlock - 1;
    for (const [account, bal] of this.balances) {
      const onChain = await this.vault.balanceOf(account, { blockTag });
      if (onChain !== bal) bad.push({ account, indexed: bal, onChain });
    }
    return bad;
  }
}

module.exports = { VaultIndexer };
