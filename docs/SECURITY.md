# Security analysis

Status: **not audited.** Demonstration code. The analysis below is what was run, what it said and why each
result was accepted or fixed.

## Tools run

| Tool | Version | Scope | Limits |
|---|---|---|---|
| Slither | 0.11.6 | All production contracts and the gas pair (`contracts/test/` excluded on purpose), 102 detectors | Static; no knowledge of intent |
| Mythril | 0.24.8 | Runtime bytecode of `VaultV1`, `VaultV2`, `Collectible`, `CappedToken` (`npm run mythril`) | 90 to 100 s per contract, transaction depth 3: bounded evidence, not a proof. MythX itself was not run (hosted service); standalone Mythril is a related tool, not an equivalent run |
| Foundry linter | forge 1.8.6 | Every `forge build` | Style and a few security patterns |
| Fuzz and invariants | see [TESTING.md](TESTING.md) | Behavioural properties | Finds bugs; does not prove their absence |
| AI-assisted review | four passes | Contracts; then the indexer, client, gas write-up and first invariant test; then the Foundry suite and V2; then this documentation | An independent model's opinion, not a human audit; each point was checked against the code before acting |

## Slither: 6 results, all dispositioned

Full output in [slither.txt](slither.txt).

| Finding | Where | Disposition |
|---|---|---|
| `low-level-calls` ×4 | `Collectible.withdraw`, `VaultV1.withdraw`, `VaultV2.withdraw`, `VaultV2.claimFees` | Accepted. `.call{value:}` is the recommended way to send ETH (no 2300-gas stipend). The result is checked, state and events are written before the call (checks-effects-interactions), and the vault paths are also `nonReentrant` |
| `costly-loop` | `AirdropNaive.distribute` | Intended: the naive baseline. `AirdropOptimized` removes it (one SSTORE for `total`) |
| `immutable-states` | `AirdropNaive.owner` | Intended, same reason; the optimized version is `immutable` |

Foundry's linter also reports `arbitrary-send-eth` on `VaultV1.withdraw`: a false positive, since the
destination is `msg.sender` withdrawing their own balance. It reported and led to fixes for events emitted
after external calls, `nonReentrant` not being the first modifier, and a fee change without an event.

## Mythril

No issues for `VaultV1`, `VaultV2` (rerun after the fee-rounding change) and `Collectible`. One
informational note for `CappedToken`: control flow depends on `block.timestamp` in `permit` (SWC-116).
Accepted: that is the EIP-2612 `deadline` check, which must use block time.

## Review findings (each checked against the code; all valid, fixed or documented)

Contracts, first pass:

1. An uninitialized proxy can be initialized by anyone. Documented: deploy with `deployProxy(..., [owner])`
   so `initialize` runs in the creation transaction; the implementation itself calls `_disableInitializers()`.
2. `initializeV2` was callable by anyone after a non-atomic upgrade. Fixed: owner-only, and the upgrade
   uses `upgradeToAndCall`.
3. `ReentrancyGuardTransient` needs EIP-1153. Documented; target chains must support Cancun.
4. V2's `Withdrawn` carried the net amount, so an indexer would drift. Fixed: gross in `Withdrawn`, fee in
   `FeeCharged`.

Later passes (off-chain code; the Foundry suite and V2; this documentation):

5. The fee rounded down, so splitting withdrawals avoided it. Fixed: round up via `Math.mulDiv`, which also
   removes an overflow in `amount * feeBps`.
6. The invariant model took the fee rate from the contract under test. Fixed.
7. Conservation checks do not show who was paid. Added payout checks for the withdrawer and for the owner's
   `claimFees`.
8. The indexer was not reorg-safe, scanned from genesis in one call, and could double-count on overlapping
   polls. Fixed: confirmations, block-hash reorg detection, chunked scans, serialized `sync()`.
9. The client could hide a decodable revert behind an outer data field and missed nested wallet rejection
   codes. Fixed; added an expected-chain check and a code-at-address check.
10. A reentrancy-guard mutant was wrongly called equivalent: re-entering to withdraw the rest of a legitimate
    balance is observable. Added `PartialReentrancyAttacker` and tests for V1 and V2; see TESTING.md.

## Properties the design relies on

- Only the owner can upgrade (`_authorizeUpgrade`), and the implementation cannot be initialized directly.
- Storage layout is append-only; the upgrades plugin refuses an incompatible implementation (tested with
  `BadLayout`).
- Vault ETH balance = sum of account balances + accrued fees, and each account's balance matches an
  independent ledger (tested by invariants).
- The fee rate is capped at 5% and set only by the owner; a withdrawal cannot owe more than it takes.
- No external call precedes the state write or the event in `withdraw` and `claimFees`.

## Assumptions and exclusions

- No forced ETH: a `selfdestruct` or coinbase payment would break exact-equality accounting, by design of
  the check, not of the contract's balances.
- The owner is trusted. A malicious or compromised owner can upgrade to anything. A production system would
  put the owner behind a multisig and a timelock; this repo does not.
- No oracle, no cross-contract composability, no signature scheme beyond EIP-2612 `permit`.
- Single-chain, EIP-1153-capable EVM only.
