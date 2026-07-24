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

**`corpus.ts`** — a STEPPER THE AGENT DRIVES, not a standalone batch script.
Classification is agentic by design and the scripts are dependency-free with
no API key (host-subscription form factor) — **a script cannot produce
verdicts for pending nodes**, so the protocol has the agent in the loop:

```bash
bun scripts/corpus.ts next
#   clones the next unprocessed repo (shallow), runs gather + the sandbox
#   dispatch (A's classify.ts), samples nodes (cap below), writes
#   .keel-corpus/<name>.pending.json, prints the batched judgment payloads,
#   and STOPS.

# ... the agent judges the pending batches (10–20 nodes per call) and writes
#     .keel-corpus/<name>.verdicts.json ...

bun scripts/corpus.ts record <name>
#   merges probe + agent verdicts -> reports/<name>.json (ratio + anchored
#   count + coverageByKind, always together), updates
#   reports/corpus-summary.json + economics, cleans the temp clone, advances.
```

## Hard requirements

- **Sequential, not parallel, across repos.** The crystallization curve W1·G
  measures depends on probe-library growth being *ordered* — parallel runs race
  on `~/.config/keel/probes/` and destroy the signal being measured. Run order
  must be deterministic and recorded.
- **Resume is mandatory.** A repo with an existing `reports/<name>.json` is
  skipped by `next`. Without this, a crash at repo 8 re-judges repos 1–7 —
  burning tokens AND corrupting the ordered probe growth the curve measures.
- **Node cap, disclosed.** Sample ≤40 nodes per repo, preferring kind
  diversity; record `nodesTotal` AND `nodesSampled` in economics (schema v2).
  No silent caps — a capped report says so.
- Per-repo failure is **non-fatal**: record the error in the summary and
  continue. One unclonable repo must not lose the corpus.
- Record `RunEconomics` per repo — that is W1·G's input. `tokensEstimated:
  true`; estimate = ceil(chars/4) of payloads + responses. Wall-clock and
  probe-share are measured directly.
- **Repeatability check (cheap, do it):** `corpus.ts next --repeat <name>`
  re-classifies an already-done repo into a side file (ignoring its cached
  report, fresh judgment) and emits verdict agreement. One extra run buys the
  empirical stability number — "verdict agreement X% across independent
  runs" — publish it either way.
- Shallow clone (`--depth=1`), and clean up temp dirs.
- Never mutate the cloned targets.

## Acceptance

```bash
cd skills/keel
bun scripts/corpus.ts next               # emits pending payloads for repo 1, stops
# hand-write a tiny verdicts file for 3 nodes, then:
bun scripts/corpus.ts record <name>      # report written, summary updated
bun scripts/corpus.ts next               # SKIPS repo 1 (resume), moves to repo 2
cat ../../reports/corpus-summary.json    # entries carry ratio + anchored + coverage + economics
# a deliberately bad URL in corpus.json must be recorded and skipped, not fatal
```

## Do not touch

`schemas/keel.ts` · `gather.ts` · `classify.ts` · `render.ts` · `SKILL.md` ·
`README.md` · `site/**` (W2·H publishes)
