# Gas optimization: measured, not assumed

`contracts/gas/AirdropNaive.sol` vs `AirdropOptimized.sol`: same behaviour, same events, checked by
`test/Gas.test.js` (50 recipients, hardhat in-process, solc 0.8.28, optimizer 200 runs).

| Scenario | Naive | Optimized | Saved |
|---|---|---|---|
| 50 distinct recipients (cold slots) | 1,279,026 | 1,250,971 | 28,055 (2.2%) |
| 50 × the same recipient (warm slots) | 205,338 | 177,283 | 28,055 (13.7%) |

Scaling (cold slots, `test/Gas.test.js`):

| Recipients | Naive | Optimized | Saved |
|---|---|---|---|
| 1 | 70,729 | 68,356 | 2,373 |
| 2 | 95,388 | 92,491 | 2,897 |
| 10 | 292,660 | 285,571 | 7,089 |
| 50 | 1,279,026 | 1,250,971 | 28,055 |
| 100 | 2,511,991 | 2,457,721 | 54,270 |

The saving is roughly 2.4k gas fixed plus about 470 to 520 gas per recipient (it grows slightly with
n). In relative terms it is only ~2% when each recipient costs a fresh storage write (~22k gas), because
those writes dominate and cannot be removed. It is larger when slots are already warm (the 13.7% row).
The percentages depend on the workload, so the tables give both.

What changed. The effects below are the intended mechanisms; they were measured together, not one at a time:

| Change | Effect |
|---|---|
| `calldata` instead of `memory` for the array | no copy of the array into memory |
| `total += amount * n` once, instead of `n` read-modify-writes | removes n−1 SLOAD/SSTORE pairs on the same slot; the multiplication is still checked |
| `owner` is `immutable` | read from bytecode, not storage |
| custom error `NotOwner()` instead of `require(..., "not owner")` | smaller bytecode, cheaper revert |
| cached `n`, `++i` in `unchecked` | no repeated length reads, no overflow check on a bounded counter |

Not claimed: the optimizer, `via-ir` and EVM version also move these numbers. Always re-measure with
`npm run gas` after changing compiler settings.
