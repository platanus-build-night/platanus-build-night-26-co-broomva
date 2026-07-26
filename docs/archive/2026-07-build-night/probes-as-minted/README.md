# The probe library exactly as the corpus run minted it

These 30 files are the **unmodified** output of the 15-repository corpus run of
2026-07-25 — the artifacts that produced the crystallization curve. They are kept
because the shipped library in `skills/keel/probes/` is no longer identical to
them, and the difference is the reviewable part.

They were gitignored until now (`.keel-probes-*/`, a fan-out worktree-isolation
rule from `docs/plans/00-orchestration.md:104` that swept up the corpus library
too), which meant the evidence behind the curve existed on exactly one laptop.

## What changed on the way to `skills/keel/probes/`

1. **Types.** Minted probes are untyped because they live outside the repo, where
   a relative import would not resolve. Inside the packaging boundary it does, so
   the compiler now holds the `Probe` contract — including that `assess` may
   never return `unknown`.

2. **The whole-body guard**, on 17 of the 18 `not_a_check` probes, each bumped to
   the next version. Their abstention was a denylist of runner names, which
   cannot enumerate the world; six were measured filing a step `not_a_check`
   whose body also ran `./scripts/verify-contract.sh --strict`. Since
   `not_a_check` leaves the denominator, that drift *raises* the ratio — the one
   direction this project must never move silently.

3. **`frozen-dependency-install.v1`** is not shipped; `v2` withdrew the `npm ci`
   token (a substring of `pnpm ci:<task>`) and supersedes it. Both are here.

Nothing here is loaded at runtime. This directory is a record, not a library.
