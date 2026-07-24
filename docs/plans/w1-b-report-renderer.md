# W1·B · Report renderer (MVP-critical — NEVER cut)

A run with no visual is not demonstrable. This unit is the demo.

## Context

Read `docs/handoffs/2026-07-24-keel-build-night.md` §4.
Read `skills/keel/schemas/keel.ts` (frozen) — `Report`, `GroundingRatio`, `RunEconomics`.
Consume `tests/fixtures/report.sample.json`. **You never need the engine.**

**Read `skills/keel/design/README.md` before writing markup.** The design
system is frozen the same way the schema is: `design/tokens.css` and
`design/keel.css` are orchestrator-owned, and you consume them rather than
editing them. Do not author a palette, a verdict chip, a ratio block, or a node
mark — they exist, with the invariants already encoded (`not_a_check` outside
the denominator, the confidence-smell ring, the missing-argument defect state).

Inline both stylesheets verbatim into one `<style>` block. They are written to
be inlined: no `@import`, no webfont, no external reference — which is what
makes the zero-external-request requirement below achievable at all.

`make design-audit` gates your output surface. It fails on a raw hex or px, on
a `data-class` outside the frozen `GroundingClass`, on a ratio without its
counts or scope note, and on a verdict without its argument.

## You own (write only these)

- `skills/keel/scripts/render.ts`
- `skills/keel/templates/**`

Not yours: `skills/keel/design/**` (consume it; propose changes in the PR body).

## Deliverable

`render.ts`: `report.json` → **self-contained HTML** (zero external requests,
inline CSS/SVG — it must open from `file://` and survive being emailed).

Per **P18** this is Category-C: generatively authored, presentation carries
knowledge. Not a markdown projection.

Must show:

1. **The grounding ratio, huge.** Plus the raw counts. `not_a_check` printed
   *beside* the ratio, never folded into it — it is excluded from the
   denominator and it is the shoppable class, so hiding it would be dishonest.
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
cd ../.. && make design-audit                              # adherence gate
```

Also print it (⌘P → PDF). The stylesheet carries a print theme that inverts the
canvas and darkens the verdict hues; the report is expected to be emailed, and
an emailed artifact gets printed.

Also render a synthetic 200-node report to prove it does not break.

## Do not touch

`schemas/keel.ts` · `scripts/gather.ts` · `scripts/classify.ts` · `SKILL.md` ·
`README.md` · `site/**` (W1·H owns the site)
