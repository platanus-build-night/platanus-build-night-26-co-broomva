# Wave 2 — dispatch after Wave 1 fully merges

Four units. Split into separate files at dispatch time if your runner wants one
plan per agent; they are grouped here because each is small.

---

## W2·F · ε-audit (flourish — first to cut)

**Owns:** `skills/keel/scripts/audit.ts`

Probes drift. A generalization that over-matches mis-classifies silently
forever, and the failure is invisible *because it is cheap*.

Sample a fixed fraction (default 10%) of probe-decided verdicts and re-decide
them agentically **with the cached verdict hidden from the judging context** —
if the agent sees the prior class, the re-decision is not independent and the
audit measures nothing. Record into `Verdict.audit`. On disagreement, narrow the
probe's `match` or retire it.

Also sample `not_a_check` verdicts: that is the shoppable class, and an audit
that skips the shoppable class audits the wrong thing.

Emit the **probe-library agreement rate** — Keel's own counter-metric. Per the
handoff §2.4 this closes Gap 1 from `grounded-vs-ungrounded-improvement`
("a metric must never travel alone"), so state it plainly in the output.

**Acceptance:** run against a corpus report with ≥20 probe verdicts; confirm the
sampled subset is re-decided, the cached class is absent from the judging
payload (grep the prompt), and a deliberately-broken probe is caught and
retired.

---

## W2·G · Crystallization curve (MVP — the headline result)

**Owns:** `skills/keel/scripts/curve.ts`

The grounding ratio is the product. **The curve is the novel claim** — it shows
structure emerging from a small set of primitives, measured rather than
asserted.

Read `RunEconomics` across the ordered corpus runs and produce:
- tokens per node, by run index
- seconds per node, by run index
- probe-decided share, by run index
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

**Acceptance:** `bun scripts/curve.ts reports/ -o reports/curve.json` over ≥5
sequential runs; SVG renders standalone; a shuffled run order visibly changes
the curve (proving it measures order-dependent accumulation, not noise).

---

## W2·H · Site publish (MVP — demo beat 1)

**Owns:** `site/reports/**`, `reports/**` (publishing side), `site/index.html`
(**this unit only**, and only to add the results link)

Publish the corpus results to `broomva.github.io/keel/`:
- a results index: repo → grounding ratio → link to the full HTML report
- the curve, prominently
- each per-repo report as a static self-contained HTML file

Pages deploys from `site/` via `.github/workflows/pages.yml` (already wired).
**Verify by fetching deployed content, not by checking the workflow is green** —
a 200 with stale content is the exact failure `ground-truth-deploy-verify`
names, and this project cannot be the one that ships an unverified green check.

**Acceptance:**
```bash
curl -s https://broomva.github.io/keel/reports/ | grep -o "grounding\|ratio"
curl -s -o /dev/null -w "%{http_code}\n" https://broomva.github.io/keel/reports/keel.html
```

---

## W2·I · Demo assets (MVP — rehearsal + insurance)

**Owns:** `docs/demo/**`

- **Three-beat run sheet** with timings (handoff §6): published corpus → live
  run mints a probe → `npx skills add broomva/keel` and the room installs it.
- **Fallback video** of the full demo. Record it **before** you need it —
  MemorIA was blocked from presenting when prod broke minutes before pitching.
- **The volunteer-repo path**, rehearsed against a repo Keel has never seen, so
  beat 2 is genuinely live rather than staged.
- **Objection cards**, one line each: *you're running LLM-generated code?*
  (subprocess, no network, timeout; Firecracker later) · *isn't the classifier
  subjective?* (every verdict ships its causal path) · *does a high ratio mean
  well-tested?* (no — execution shape, not quality) · *the agent writes the
  probes, so who verifies the verifier?* (the probe-writer is not the measured
  system; and the ε-audit is the counter-metric).

**Acceptance:** a full timed dry run, twice, one of them with the network off to
prove the fallback path.
