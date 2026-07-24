# Wave 2 — dispatch after Wave 1 fully merges

Two units plus the video slot. G (curve) and I (demo assets minus video) moved
to Wave 1 — they consume only the fixture/schema.

---

## W2·F · ε-audit (flourish — first to cut)

**Owns:** `skills/keel/scripts/audit.ts`

Probes drift. A generalization that over-matches mis-classifies silently
forever, and the failure is invisible *because it is cheap*.

Sample a fixed fraction (default 10%) of verdicts and re-decide them
agentically **with the cached verdict hidden from the judging context** — if
the agent sees the prior class, the re-decision is not independent and the
audit measures nothing. Record into `Verdict.audit`. On disagreement, narrow
the probe's `match` or retire it.

**Sample across ALL deciders, not just probes:**

- **probe-decided** verdicts — the drift detector; this is the counter-metric.
- **agent-decided** verdicts — this is the injection surface. A target that
  prompt-injects the judging context lands on agent verdicts, which a
  probes-only audit never re-examines. Sampling here is what makes "bounded
  influence with detection probability" true rather than aspirational.
- **`not_a_check`** verdicts — the shoppable class; an audit that skips the
  shoppable class audits the wrong thing.

The audit's legitimacy is **query provenance**, not model diversity: the probe
(and the target) cannot select which verdicts get re-judged, and the cached
class is hidden. What it detects is probe drift and injected verdicts; what it
cannot detect — shared-model bias — is disclosed, not defended.

Emit the **probe-library agreement rate** — Keel's own counter-metric. Per the
handoff §2.4 this closes Gap 1 from `grounded-vs-ungrounded-improvement`
("a metric must never travel alone"), so state it plainly in the output.

**Acceptance:** run against a corpus report with ≥20 probe verdicts; confirm
the sample includes probe-decided, agent-decided, and `not_a_check` verdicts;
the cached class is absent from the judging payload (grep the prompt); a
deliberately-broken probe is caught and retired.

---

## W2·H · Site publish (MVP — demo beat 1)

**Owns:** `site/reports/**`, `reports/**` (publishing side), `site/index.html`
(**this unit only**, and only to add the results link)

Publish the corpus results to `broomva.github.io/keel/`:
- a results index: repo → grounding ratio **paired with anchored count and
  coverage** (never a bare ratio; zero-node targets say "nothing gathered") →
  link to the full HTML report
- the curve, prominently — token axis labeled "estimated"
- the repeatability number (verdict agreement across independent runs), if
  W1·D produced it
- each per-repo report as a static self-contained HTML file
- the `keel` self-report carries its disclosed asterisk: self-measurement is
  the one run where query-independence collapses; say so on the page.

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

## W2·I₂ · Fallback video (MVP — insurance)

**Owns:** `docs/demo/**` (the recording only; W1·I owns the rest)

Record the full three-beat demo **at ~01:00, as soon as the beats work** — not
at 02:45. MemorIA was blocked from presenting when prod broke minutes before
pitching. One take that works beats three takes that are polished.
