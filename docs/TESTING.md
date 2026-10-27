# Testing

## Layers

| Layer | Where | What it establishes |
|---|---|---|
| Unit | `test/*.test.js` | Each contract's behaviour and its must-fail cases (see below) |
| Integration | `test/Integration.test.js` | Deploy script wiring, V1→V2 upgrade, the event indexer rebuilt from logs and checked against `balanceOf`, the front-end data layer |
| Conservation (seeded, random) | `test/VaultInvariant.test.js` | ETH held = sum of balances + accrued fees, across 5 seeded 80-step sequences with a mid-run upgrade. A regression test, not a proof |
| Fuzz | `foundry/test/*.t.sol` | 1000 runs per property: cap never exceeded, a mint succeeds exactly when it fits, transfers conserve, royalty arithmetic, exact-price mint, splitting a withdrawal never beats a single fee, fee bounded, huge amounts do not overflow |
| Differential fuzz | `foundry/test/Airdrop.t.sol` | The optimized airdrop matches the naive one on arbitrary input, including duplicates and overflow, and fails with the same revert class |
| Stateful invariants | `foundry/test/VaultInvariant.t.sol` | 256 runs × depth 100 of deposit / withdraw / over-withdraw / upgrade / claim, compared with an independent ledger; payouts checked in actual ETH received |
| Directed V2 paths | same file | Deposit → upgrade → fee-bearing withdrawal → claim; rate cap; owner-only calls |
| Browser end to end | `web/e2e/`, `scripts/e2e.sh` | The real page in headless Chrome with a mock wallet: connect, deposit, withdraw, over-withdraw, wallet rejection, wrong chain, no contract |

Must-fail tests (a property that has to fail loudly if it breaks): non-minter mint, cap overflow, wrong
payment, sold out, non-owner withdraw, re-initializing the implementation and the proxy, reentrancy
(`ReentrancyAttacker`), non-owner upgrade, non-owner `initializeV2`, an incompatible storage layout
(`contracts/test/BadLayout.sol`) that the upgrades plugin must refuse, and a deliberately vulnerable vault
(`contracts/test/VulnerableVault.sol`) that the same attacker must be able to drain, which shows the
attack harness works.

## Testing the tests: mutation checks

Deliberate bugs were planted in the contracts, one at a time, in a throwaway copy, and the suites run.
A suite that stays green on a broken contract is not testing that property.

| # | Planted bug | Caught by |
|---|---|---|
| 1 | V2 stops accruing the fee | Hardhat, Foundry invariants |
| 2 | V2 debits the net amount instead of the gross | Hardhat, Foundry |
| 3 | V1 skips the balance debit | Hardhat, Foundry invariants |
| 4 | Token cap check off by one | Foundry |
| 5 | NFT supply check off by one | Foundry |
| 6 | Optimized airdrop drops its last recipient | Foundry (differential) |
| 7 | `claimFees` pays 1 wei too much | Foundry |
| 8 | `claimFees` pays half | Foundry invariants |
| 9 | The fee rounds down | Foundry (splitting test) |
| 10 | The upgrade stores the wrong fee rate | Foundry |
| 11 | V2 pays the gross amount instead of the net | Foundry |
| 12 | The fee uses a plain multiply that overflows | Foundry |
| 13 | V1 loses `nonReentrant` | Hardhat (partial-withdrawal re-entry test) |
| 14 | V2 loses `nonReentrant` | Hardhat (same test against the upgraded vault) |

**A mislabel that review corrected.** #13 first survived, and was written up here as an "equivalent
mutant" on the argument that `VaultV1.withdraw` debits before sending (checks-effects-interactions), so a
re-entrant overdraw fails the balance check without the guard. That argument was right about overdraws and
wrong about the conclusion: a caller can deposit 2x, withdraw x, and re-enter from its receive hook to take
the remaining x, which really is its balance. Without the guard that succeeds; with it, the send fails. The
first attacker only tried overdrawing, so it could not tell. `PartialReentrancyAttacker` and two tests
(V1 and V2) now cover it, and #13 and #14 are caught. `VulnerableVault` (sends first, caches a stale
balance) is still drained by the original attacker, which shows that harness works too.

## What mutation testing found about the tests

- Three mutants first survived the invariant suite (#8, #10, #11). The handler's payout assertions were
  reverting, but `fail_on_revert = false` made the fuzzer discard those calls and roll the state back,
  so the broken sequence never counted. Fixed with `fail_on_revert = true`; the handler never reverts on
  correct code, so nothing is lost.
- The fee model first read the rate back from the contract under test, so a wrong stored rate was
  invisible. The handler now records the rate it requested and the suite asserts the contract stored it.
- Conservation alone cannot say who was paid, so the handler also checks the withdrawer's ETH received
  and the owner's ETH from `claimFees`.

## Coverage

`npm run coverage` (Hardhat suite only): all files 96.3% statements, 78.6% branches, 90% functions, 100%
lines. The four production contracts are at 100% of statements; branch gaps remain in `Collectible`
(87.5%) and `VaultV2` (75%). Coverage says which lines ran, not that the assertions on them were good;
that is what the mutation checks are for.

## Reproducing

CI runs the Hardhat tests, the Foundry tests, Slither (report only), gitleaks and the browser test.
Coverage (`npm run coverage`), Mythril (`npm run mythril`) and the mutation runs are manual: for a mutation,
copy the repo, apply one change from the table, run `npm test` and `npm run test:foundry`. Automating the
mutation runs is future work.
