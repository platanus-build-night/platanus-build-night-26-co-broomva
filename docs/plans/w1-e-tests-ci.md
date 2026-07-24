# W1·E · Tests + CI (cuttable if behind, but cheap)

Note the recursion: Keel's own CI is a verification edge Keel will classify.
Write checks that would score `anchored` — executed assertions, not assertions
about assertions. Keel publishing a poor grounding ratio for itself is a bad
look at a pitch about grounding ratios.

## Context

Read `docs/handoffs/2026-07-24-keel-build-night.md` §4.
Read `skills/keel/schemas/keel.ts` (frozen).
Consume `tests/fixtures/report.sample.json`.

## You own (write only these)

- `tests/**` (except `tests/fixtures/report.sample.json`, owned by W0)
- `.github/workflows/test.yml`

## Deliverable

**`bun test` suite** covering:

1. **`gather.ts` regression — the dropped-step bug.** A fixture workflow with
   single-line `- uses: x` steps AND multi-line steps must yield **all** of
   them. This bug shipped once (1 node found where there were 4) and was
   invisible to reading. Pin it.
2. **`gather.ts`** — `package.json` scripts, Makefile targets, `.PHONY`
   excluded (it is a directive, not a target).
3. **`groundingRatio()`** — `not_a_check` excluded from the denominator;
   `unknown` counted against; empty input → 0, not NaN.
4. **Probe contract** — a probe returning `'unknown'` is rejected; `null`
   abstains cleanly.
5. **Fixture validity** — `report.sample.json` parses as `Report` and its
   stored `grounding` matches a recomputation.

**`.github/workflows/test.yml`** — `oven-sh/setup-bun`, run `bun test` +
`bunx tsc --noEmit`. Path-filter to skip on `site/**`-only changes.

## Hard requirements

- Tests must **execute** the code. A test asserting a constant is
  `self_referential` by Keel's own definition — do not write one.
- No network in tests. Corpus cloning is not unit-tested; use fixtures.
- Fast: the whole suite under ~10s, so it stays in the inner loop tonight.

## Acceptance

```bash
bun test                    # all green
bunx tsc --noEmit           # clean
# mutation-prove the regression test: revert the `-?` in gather.ts's
# interesting-step regex and confirm test 1 FAILS. A regression test that
# passes against the reintroduced bug is theatre.
```

## Do not touch

`schemas/keel.ts` · any `skills/keel/scripts/*.ts` (other units own them — if a
test reveals a bug, **report it, do not fix it**; a cross-unit edit breaks the
file-disjoint guarantee that makes this fan-out conflict-free) ·
`.github/workflows/pages.yml` · `SKILL.md` · `README.md` · `site/**`
