# W1·G · Crystallization curve (MVP — the headline result)

Pulled forward from Wave 2: this unit consumes only the schema and synthetic
`RunEconomics` fixtures, so it can build in parallel with the engine. Real
corpus data plugs in at ~00:30.

**Owns:** `skills/keel/scripts/curve.ts` (and its own synthetic fixtures under
`tests/fixtures/economics/**`)

## Context

Read `docs/handoffs/2026-07-24-keel-build-night.md` §TL;DR, §6.
Read `skills/keel/schemas/keel.ts` (frozen, v2) — `RunEconomics` now carries
`nodesSampled` and `tokensEstimated`.

The grounding ratio is the product. **The curve is the novel claim** — it shows
structure emerging from a small set of primitives, measured rather than
asserted. It is also an RSI instance with a ceiling: crystallization is
self-improvement of the classifier, probes are selected to agree with past
judgment (independence is *spent* by selection), and the ε-audit is the paired
watcher. The curve and the audit are one mechanism, not two features.

## Deliverable

Read `RunEconomics` across the ordered corpus runs and produce:
- estimated tokens per node, by run index (**axis labeled "estimated"** —
  `tokensEstimated` is true tonight; no API exposes session usage to a skill)
- seconds per node, by run index (measured)
- probe-decided share, by run index (measured)
- probe library size, by run index

Emit `reports/curve.json` **and** an inline-SVG chart fragment that W1·B's
renderer inserts at its marked insertion point.

**Honesty requirements — these are the difference between a result and a
demo trick:**
- Corpus run order must be recorded and shown. The curve is meaningless without
  it, since it is a function of ordering.
- If cost per node does **not** fall, **publish that.** A flat curve is a real
  finding about probe generality, and faking a downward slope in a talk about
  verification integrity would be self-refuting on stage.
- Never plot a fitted trend without the raw points.
- **Shuffle check, both directions:** a shuffled run order must visibly change
  the *curve* (proving it measures order-dependent accumulation, not noise) —
  and must **not** materially change the *ratios*. Order-dependent cost is the
  thesis; order-dependent verdicts would be a probe-generality bug. If ratios
  move under shuffle, that is a finding to surface, not hide.

## Acceptance

```bash
cd skills/keel
bun scripts/curve.ts ../../tests/fixtures/economics -o /tmp/curve.json
# ≥5 synthetic sequential runs; SVG renders standalone; shuffle check passes
# both directions (curve changes, ratios stable)
```

## Do not touch

`schemas/keel.ts` · `scripts/*.ts` owned by other units · `SKILL.md` ·
`README.md` · `site/**` · `tests/fixtures/report.sample.json`
