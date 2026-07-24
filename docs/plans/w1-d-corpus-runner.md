# W1·D · Corpus runner (MVP-critical — produces the headline number)

The corpus is the Themis-shaped result: a number about real systems that does
not currently exist.

## Context

Read `docs/handoffs/2026-07-24-keel-build-night.md` §4, §6 (demo beat 1).
Read `skills/keel/scripts/gather.ts`.
Read `skills/keel/schemas/keel.ts` (frozen) — `Report`, `RunEconomics`.

## You own (write only these)

- `skills/keel/scripts/corpus.ts`
- `corpus.json` (repo list at repo root)

## Deliverable

**`corpus.json`** — 10–15 targets. Selection criteria, in priority order:

1. **Well-known agent/AI repos** — the audience recognises them, and the thesis
   bites hardest where agents maintain the code.
2. **A spread of verification cultures** — a heavily-tested infra project, an
   LLM-wrapper app, a docs-heavy repo. A corpus that is all one shape produces
   one number and no insight.
3. **Small enough to clone shallow.** Record each entry as
   `{ name, url, revision }` — **pin the revision**, or the corpus is not
   reproducible and the number is not defensible.

Include **`keel` itself.** Self-measurement is the most honest thing the tool
can do on stage, and refusing to publish your own number is the failure this
project names.

**`corpus.ts`** — for each target: shallow clone to a temp dir → `gather` →
`classify` → write `reports/<name>.json`. Then emit
`reports/corpus-summary.json` with per-repo ratios and aggregate stats.

## Hard requirements

- **Sequential, not parallel, across repos.** The crystallization curve W1·G
  measures depends on probe-library growth being *ordered* — parallel runs race
  on `~/.config/keel/probes/` and destroy the signal being measured. Run order
  must be deterministic and recorded.
- Per-repo failure is **non-fatal**: record the error in the summary and
  continue. One unclonable repo must not lose the corpus.
- Record `RunEconomics` per repo — that is W1·G's input.
- Shallow clone (`--depth=1`), and clean up temp dirs.
- Never mutate the cloned targets.

## Acceptance

```bash
cd skills/keel
bun scripts/corpus.ts --limit 3          # smoke: 3 repos end-to-end
cat ../../reports/corpus-summary.json    # 3 entries, each with a ratio + economics
bun scripts/corpus.ts                    # full run
# a deliberately bad URL in corpus.json must be recorded and skipped, not fatal
```

## Do not touch

`schemas/keel.ts` · `gather.ts` · `classify.ts` · `render.ts` · `SKILL.md` ·
`README.md` · `site/**` (W1·H publishes)
