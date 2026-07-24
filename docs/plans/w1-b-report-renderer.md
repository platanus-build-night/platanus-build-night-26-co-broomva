# W1·B · Report renderer (MVP-critical — NEVER cut)

A run with no visual is not demonstrable. This unit is the demo.

## Context

Read `docs/handoffs/2026-07-24-keel-build-night.md` §4.
Read `skills/keel/schemas/keel.ts` (frozen) — `Report`, `GroundingRatio`, `RunEconomics`.
Consume `tests/fixtures/report.sample.json`. **You never need the engine.**
Match the visual language of `site/index.html` (dark, `#07090c`, accent
`#7dd3fc`, anchored `#4ade80`, self-referential `#f87171`, unknown `#fbbf24`).

## You own (write only these)

- `skills/keel/scripts/render.ts`
- `skills/keel/templates/**`

## Deliverable

`render.ts`: `report.json` → **self-contained HTML** (zero external requests,
inline CSS/SVG — it must open from `file://` and survive being emailed).

Per **P18** this is Category-C: generatively authored, presentation carries
knowledge. Not a markdown projection.

Must show:

1. **The grounding ratio, huge — but never alone.** Beside it, always: the
   **absolute anchored count**, the **coverage by kind**
   (`coverageByKind(nodes)`), and the raw counts. A 1.0 over one edge and a
   0.7 over fifty are different claims, and a bare ratio rewards deleting
   checks. `not_a_check` printed *beside* the ratio, never folded into it —
   it is excluded from the denominator and it is the shoppable class, so
   hiding it would be dishonest. A report with **zero nodes renders an
   explicit "nothing gathered" state**, never a ratio — "unverified" and
   "unreadable" must be visually distinct.
2. **The node graph** — inline SVG, one mark per node, coloured by class.
   Legible at 70 nodes.
3. **Per-verdict detail** — for every node: name, source, class, and the
   `writeBoundary.argument`. **The argument is the evidence**; a report that
   shows a class without its causal path is exactly the unaccountable green
   check Keel exists to criticise. Make it scannable, not buried.
4. **Confidence smell** — flag `anchored` verdicts with `confidence < 0.5`
   visually. High-confidence-low-evidence is the pattern that matters.
5. **Economics footer** — probe vs agent decision counts, tokens, wall clock.
   W1·G will extend this into the cross-run curve; leave a clearly-marked
   insertion point rather than building the curve yourself.

## Style constraints

- No frameworks, no build step, no CDN. One `.html` file out.
- Readable at 15 nodes and at 200. Degrade the graph gracefully, do not clip.
- The scope note must appear in the artifact: *"Keel measures the shape of
  verification, not its quality. A repo can be 100% anchored with terrible
  tests."*

## Acceptance

```bash
cd skills/keel
bun scripts/render.ts ../../tests/fixtures/report.sample.json -o /tmp/keel-report.html
open /tmp/keel-report.html   # ratio, graph, every argument visible
grep -c "http://\|https://\|cdn\." /tmp/keel-report.html   # expect 0 external refs
```

Also render a synthetic 200-node report to prove it does not break.

## Do not touch

`schemas/keel.ts` · `scripts/gather.ts` · `scripts/classify.ts` · `SKILL.md` ·
`README.md` · `site/**` (W1·H owns the site)
