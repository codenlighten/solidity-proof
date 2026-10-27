# IP records

Evidence of authorship and of the date a state of this repository existed, recorded with iptrust.org.
A record is evidence, not a registered right. The signed statement in each record is the authoritative
description of what it covers; this table is a convenience copy.

| Date | Covers | Type | Record | Signer | Tag |
|---|---|---|---|---|---|
| 2026-10-27 | The whole repository at tag `ip-2026-10-27` (46 files): contracts, Hardhat and Foundry tests, scripts, web client and browser test, docs. Excludes OpenZeppelin and other npm dependencies (not in the tree). Commit `29309e2` | software | [`cd48d62f94b9c51b2d7089bafaa008f040d7c48b7be7e85ec13ec1c46ab52fe5`](https://iptrust.org/v/cd48d62f94b9c51b2d7089bafaa008f040d7c48b7be7e85ec13ec1c46ab52fe5) | Gregory J. Ward | `ip-2026-10-27` |

## Verifying

The private evidence (`opening.json`, `manifest.json`) is **not** in this repository: it is kept outside
git so that making the repository public never exposes it. It lives in `.iptrust/` in the author's working
copy and is backed up separately. To verify, copy it into a checkout of the tag:

```bash
git worktree add /tmp/at-tag-solidity-proof ip-2026-10-27 && cp -r .iptrust /tmp/at-tag-solidity-proof/
(cd /tmp/at-tag-solidity-proof && iptrust2 verify cd48d62f94b9c51b2d7089bafaa008f040d7c48b7be7e85ec13ec1c46ab52fe5 --fetch-headers)
git worktree remove --force /tmp/at-tag-solidity-proof
```

Expect `verdict: valid` and `content: matched` once both chains have anchored. Content matching is local
and needs no network; if `--fetch-headers` fails (rate limits are common), run it without the flag and
retry later.
