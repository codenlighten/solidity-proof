# solidity-proof

Small, tested reference contracts that show each skill a senior Solidity role asks for.
Every claim below maps to a file you can run.

| Skill | Where |
|---|---|
| ERC-20 | `contracts/CappedToken.sol`: supply cap, role-gated mint, burn, EIP-2612 permit |
| ERC-721 | `contracts/Collectible.sol`: enumerable, EIP-2981 royalties, paid capped mint, owner withdraw |
| OpenZeppelin | v5.6.1 (pinned), standard and upgradeable packages |
| Upgradeable | `VaultV1.sol` to `VaultV2.sol` (UUPS), plugin-validated storage layout, reinitializer |
| Gas-efficient | measured naive vs optimized comparison in `docs/GAS.md` (`contracts/gas/`, `test/Gas.test.js`); custom errors, `immutable`, transient-storage reentrancy guard; `npm run gas` |
| Hardhat | `hardhat.config.js`, ethers v6 tests |
| Foundry | `foundry.toml`, `foundry/test/`: 1000-run fuzz tests, differential fuzzing (naive vs optimized airdrop), and a stateful invariant suite (256 runs × depth 100 = 25,600 calls) with an independent ledger model; 15 tests |
| Unit and integration tests | `test/`: 38 tests; upgrade flows, seeded stateful invariant tests of the vault across an upgrade, an event-driven indexer checked against chain state |
| Backend integration | `scripts/indexer.js`: rebuilds vault balances from events and verifies them against the chain; `scripts/deploy.js`, `scripts/upgrade.js` |
| Front-end dApp | `web/vault-client.js` (tested data layer, readable revert messages) and `web/index.html` (wallet UI), browser-tested end to end with `npm run e2e` (8 checks in headless Chrome against a local node) |
| Security tooling | Slither 0.11.6, solc 0.8.28; output in `docs/slither.txt`, dispositions below |
| Code review and decisions | `docs/DECISIONS.md` |

## Run

```
npm ci
npm test            # 38 passing
npm run coverage    # statements 92.5%, lines 100% (includes test helpers)
npm run gas
npm run test:foundry   # needs Foundry (forge 1.8.6 used); reads OpenZeppelin from node_modules
```

Slither (Python venv, 0.11.6): `npm run slither`.
Run `npx hardhat clean && npx hardhat compile` first: coverage leaves instrumented artifacts that break Slither's source maps.

## Must-fail tests

Each security property has a test that must fail loudly if the property breaks:
non-minter mint, cap overflow, wrong payment, sold-out, non-owner withdraw, re-initializing the
implementation and the proxy, reentrancy via `ReentrancyAttacker`, non-owner upgrade, non-owner
`initializeV2`, and a deliberately incompatible implementation (`contracts/test/BadLayout.sol`)
that the upgrades plugin must refuse.

## Does the test suite catch bugs? Mutation check

Deliberate breakages of the contracts were run against the suites in a throwaway copy (not committed).

Hardhat suite, vault mutants:

| Mutant | Caught |
|---|---|
| V2 stops accruing the fee | yes (6 failures) |
| V2 debits the net amount instead of the gross | yes (5 failures) |
| V1 skips the balance debit | yes (6 failures) |
| V1 loses `nonReentrant` | **no** |

The last survivor is real, not a gap in effort: V1 follows checks-effects-interactions (debit before the
send), so a re-entrant call fails the balance check even without the guard. The guard is defense in
depth. `contracts/test/VulnerableVault.sol` (send before debit, stale cached balance) is drained by the
same `ReentrancyAttacker`, which shows the harness would detect a real reentrancy bug.

Foundry suite, 14 mutants, all killed: V2 stops accruing the fee; V2 debits the net amount; V1 skips the
debit; token cap check off by one; NFT supply check off by one; optimized airdrop drops its last recipient;
`claimFees` pays 1 wei too much; `claimFees` pays half; V2 pays the gross amount instead of the net; the
upgrade stores the wrong fee rate; the fee rounds down; the fee uses a plain multiply that overflows.

What mutation testing found about the tests themselves:

- Three mutants first survived the invariant suite: pays gross, wrong stored rate, wrong claim amount. The
  handler's payout assertions were reverting, but `fail_on_revert = false` made the fuzzer discard those
  calls and roll the state back, so the broken sequence never counted. Fixed by `fail_on_revert = true`
  (the handler never reverts on correct code, so this loses nothing) and by re-running the mutants.
- The fee model originally read the rate back from the contract under test, so a wrong stored rate was
  invisible. The handler now records the rate it requested and the suite asserts the contract stored it.

## Slither findings and disposition

6 results (full output in `docs/slither.txt`; `contracts/test/` helpers are excluded on purpose).

| Finding | Where | Disposition |
|---|---|---|
| `low-level-calls` ×4 | `Collectible.withdraw`, `VaultV1.withdraw`, `VaultV2.withdraw`, `VaultV2.claimFees` | Accepted. `.call{value:}` is the recommended way to send ETH (no 2300-gas stipend), the result is checked, state and events are written before the call (checks-effects-interactions), and the vault paths are `nonReentrant`. |
| `costly-loop` | `AirdropNaive.distribute` | Intended: it is the naive baseline. `AirdropOptimized` removes it (one SSTORE for `total`); see `docs/GAS.md`. |
| `immutable-states` | `AirdropNaive.owner` | Intended, same reason: the optimized version makes it `immutable`. |

Foundry's linter (`forge build`) also reports `arbitrary-send-eth` on `VaultV1.withdraw`. It is a false
positive: the destination is `msg.sender`, who is withdrawing their own balance.

## Mythril (open-source symbolic execution)

MythX is a hosted paid service and is not used here; Mythril 0.24.8 is its open-source engine. Run on the
compiled runtime bytecode of `VaultV1`, `VaultV2`, `CappedToken`, `Collectible` (100 s limit per contract,
transaction depth 3, so this is bounded evidence, not proof). Results: no issues for `VaultV1`, `VaultV2`,
`Collectible`. One informational finding for `CappedToken`: control flow depends on `block.timestamp` in
`permit` (SWC-116). Accepted: that is the EIP-2612 `deadline` check, which must use the block time.

## Off-chain code

- `scripts/indexer.js`: confirmation depth, reorg detection by block hash (rebuilds on mismatch), chunked
  log scans, serialized `sync()`. Not covered: persistence across restarts.
- `web/vault-client.js`: binds to an expected chain id, checks the address has code, walks nested wallet
  and ethers errors. The UI reloads on `accountsChanged` and `chainChanged`.
- Browser end-to-end test (`npm run e2e`, needs Chrome or Chromium): starts a local Hardhat node, deploys,
  loads the real `web/index.html` in headless Chrome with a mock wallet (`web/e2e/mock-wallet.js`, which
  forwards to the node and holds no keys), and clicks through connect, deposit, withdraw, over-withdraw,
  wallet rejection, wrong chain id and an address with no contract. What it found: the page could not
  load at all (the module imports the bare name `ethers`, which a browser cannot resolve without an import
  map), and errors from the client's own checks were shown as a generic message. Both are fixed; removing
  the import map makes the test fail. Not covered: a real wallet extension, mobile layouts, accessibility audits.

## Operational notes

- Deploy proxies with `upgrades.deployProxy(..., [owner])` so `initialize` runs in the same
  transaction. A proxy deployed without it can be initialized by anyone.
- Upgrade V1 to V2 with `upgradeProxy(..., { call: { fn: "initializeV2", args: [bps] } })`
  (`upgradeToAndCall`), so the upgrade and its initialization are atomic.
- `ReentrancyGuardTransient` needs EIP-1153 (Cancun). Target chains must support it; otherwise use
  the storage-backed upgradeable guard.
- Foundry tests declare the few cheatcodes they use in `foundry/test/Base.sol` instead of depending on forge-std, so there is no third-party test library to vendor.
- Not audited. Demonstration code, not for mainnet funds.
- Secrets: none in the repo. `.env` is ignored; `.env.example` lists the variable names only.
