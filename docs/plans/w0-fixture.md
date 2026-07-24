# W0 · Report fixture (BLOCKING — run alone before Wave 1)

**Why this is first:** half of Wave 1 consumes `report.json` and would otherwise
block on the engine. A realistic fixture decouples them. This is the single
highest-leverage 30 minutes in the plan.

## Context

Read `docs/handoffs/2026-07-24-keel-build-night.md` §1 and §4.
Read `skills/keel/schemas/keel.ts` (frozen — do not modify).
Read `skills/keel/references/grounding-classes.md`.

## Deliverable

`tests/fixtures/report.sample.json` — a valid `Report` for a real target.

## Steps

1. `cd skills/keel && bun scripts/gather.ts ~/broomva/apps/maestro --json > /tmp/nodes.json`
   (~69 edges).
2. Pick **~15 nodes spanning all four classes**. Required coverage:
   - ≥4 `anchored` (a real test run, a typecheck)
   - ≥4 `self_referential` (an LLM review step, a doc-vs-doc check, a self-set status)
   - ≥2 `unknown` (something genuinely untraceable — an opaque action, a wrapper you cannot descend)
   - ≥2 `not_a_check` (a dev server, a help target)
   - ≥1 with low `confidence` (< 0.5) to exercise the "low confidence + anchored is a smell" render path
3. Classify each **by hand, honestly**. Fill `writeBoundary.argument` with the
   causal path — never a restatement of the class. These fifteen arguments are
   the reference examples every downstream agent will imitate, so their quality
   propagates.
4. Set `decidedBy: 'agent'` on all of them (no probes exist yet).
5. Fill `economics` plausibly: `decidedByProbe: 0`, `probesMinted: 0`,
   `probeLibrarySize: 0`, realistic token/ms values, and (schema v2)
   `nodesSampled` (= nodesTotal here — no cap on a hand-picked fixture) and
   `tokensEstimated: true`.
6. Compute `grounding` with `groundingRatio()` — do not hand-write it.

## Acceptance

```bash
bun -e "
import { groundingRatio } from './skills/keel/schemas/keel.ts';
const r = await Bun.file('tests/fixtures/report.sample.json').json();
const g = groundingRatio(r.verdicts);
console.log(g);
if (JSON.stringify(g) !== JSON.stringify(r.grounding)) throw new Error('grounding mismatch');
if (g.notACheck < 2 || g.unknown < 2) throw new Error('fixture lacks required class coverage');
console.log('fixture OK');
"
```

## Do not touch

`skills/keel/schemas/keel.ts` · `SKILL.md` · `README.md` · `site/**`
