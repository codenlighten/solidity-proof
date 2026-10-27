# Design decisions and review notes

1. **UUPS over transparent proxy.** Upgrade logic lives in the implementation, so calls skip the
   admin-slot check and cost less gas. Cost: a bad `_authorizeUpgrade` can brick upgrades; it is
   `onlyOwner` and tested.
2. **No storage gap in leaf contracts.** `VaultV2` appends variables after `VaultV1`'s. Gaps matter
   only for base contracts that others inherit. (An earlier draft had a gap and a wrong comment
   claiming V2 consumed it; removed.)
3. **Reinitializer for V2** is `onlyOwner` and meant to run inside `upgradeToAndCall`. Unrestricted,
   anyone could consume version 2 after a non-atomic upgrade and pick the first fee. Found in review.
4. **V2 events.** `Withdrawn` carries the gross amount debited; the fee is a separate `FeeCharged`
   event, so an indexer can rebuild `balanceOf` exactly. Found in review.
5. **Transient reentrancy guard** (EIP-1153) is cheaper than a storage guard; it limits target chains.
6. **Custom errors, immutables** for gas and clear failure data.
7. **Fee cap 5%** hard-coded; rounding favours the user (fee floors to 0 on tiny withdrawals).
8. **Review process:** the contracts were reviewed by an independent model; all four findings were
   valid or documentation points and are reflected above. Slither results are kept with dispositions.
9. **Events before the external call** in `withdraw` and `claimFees`. A failed send reverts the whole
   transaction, logs included, so nothing is lost, and no log can be emitted after a re-entrant call.
   Prompted by Foundry's `reentrancy-events` lint.
10. **`nonReentrant` is the first modifier** (`claimFees`), per the linter: modifiers run in order, so an
    earlier one could otherwise run before the guard is taken.
11. **`FeeUpdated` and `FeesClaimed` events**: every parameter change and payout is observable off-chain.
12. **Foundry without forge-std**: the tests declare the dozen cheatcodes they use. One less vendored
    dependency; the cost is a small `Base.sol` to maintain.
13. **Invariant handler owns the vault**, so the fuzzer can exercise owner-only paths (upgrade, claim),
    and keeps its own ledger so the invariants compare the contract to an independent model rather than
    to itself.
14. **The V2 fee rounds UP, via `Math.mulDiv`.** Found by review: with round-down, withdrawing 1 wei at a
    time pays no fee, so a user avoids the fee by splitting. Rounding up in the vault's favour means
    splitting never costs less than one withdrawal (`testFuzz_splittingCannotAvoidFee`). Cost: a 1 wei
    withdrawal at a nonzero rate pays 1 wei of fee. `mulDiv` also removes an overflow in `amount * feeBps`
    for huge amounts (`test_hugeAmountFeeDoesNotOverflow`).
15. **Invariant handler checks payouts and uses its own rate.** The withdrawer's ETH received and the owner's
    ETH from `claimFees` are asserted, because conservation alone cannot tell who got paid. The fee rate
    comes from what the handler requested, not from the contract.
16. **`fail_on_revert = true`** in the invariant profile; see the README's mutation notes for why.
