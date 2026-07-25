# W1·R — the router (`keel route`)

**Deliverable:** `keel route` — a working mode of the Keel skill that reads a
`Report` and emits `Binding[]`: for every ungrounded node, a proposed route to
an anchored signal **that already exists in the same report**.

**Read first:** `docs/plans/00-orchestration.md` (contracts, ownership, the
pre-dispatch corrections block) and `docs/adrs/2026-07-24-ai-native-platform-reframe.html`
(why construction is permitted at all, and what bounds it).

---

## Why this unit exists

Measurement alone produces a number nobody can act on. The route turns
`0.61` into *"four of your seven ungrounded checks can read a signal you
already own, here is the exact change for each."*

The thesis it implements, in one line:

> **Independence cannot be manufactured, but it can be routed.**

The router never invents an anchor. It connects an ungrounded check to an
anchored producer already present in the measured graph.

---

## Owns (writes only these)

- `skills/keel/scripts/route.ts`
- `skills/keel/schemas/route.ts`
- `tests/separation.test.ts`
- `reports/<target>.bindings.json`, `reports/<target>.bindings.html`

## Do not touch

`skills/keel/schemas/keel.ts` (frozen, W0 is holding it) · `render.ts` (W1·B) ·
`classify.ts` / `probe-loader.ts` (W1·A) · `SKILL.md` (orchestrator) ·
`report.json` — **read-only, always**.

---

## The contract

Define the FULL control-layer shape now, in the unfrozen file, so `construct`
never needs a schema change later. This unit populates only the first group.

```ts
export interface Binding {
  /** the node that is not anchored today */
  loop: string;
  /** current class, carried from the Report */
  from: 'self_referential' | 'unknown' | 'not_a_check';

  // ---- W1·R fills these ----
  /**
   * Node id of an `anchored` node IN THE SAME REPORT, or null.
   * null is a first-class answer and is often correct.
   */
  anchoredOn: string | null;
  /** one line: what you would actually change */
  change?: string;
  /** the causal path — why that producer sits outside the write boundary */
  argument: string;
  /** how invasive the change is; used to rank */
  effort?: 'config' | 'wiring' | 'process';
  /** required when anchoredOn is null */
  noRouteReason?: string;

  // ---- `keel construct` fills these later. Declared, not implemented. ----
  pairedWith?: string;
  arbitratedBy?: string;
  auditEvery?: string;

  /** an agent may NEVER emit 'applied'. */
  status: 'proposed';
}

export interface BindingReport {
  target: string;
  revision: string;
  generatedAt: string;
  /** provenance — which Report this was derived from */
  sourceReport: string;
  bindings: Binding[];
  summary: {
    currentRatio: number;
    /** what the ratio WOULD be if every proposal were applied.
     *  A projection. Labelled as such. NEVER written back to any Report. */
    projectedRatio: number;
    routable: number;
    unroutable: number;
  };
}
```

---

## Invariants — violating any of these fails the unit

1. **`anchoredOn` must resolve to a node id present in the source report AND
   classified `anchored`.** Validate in code. A proposal that fails this check
   becomes `null` with a `noRouteReason`. This is what makes hallucinated
   anchors mechanically impossible rather than merely discouraged.
2. **`null` is first-class.** "No route found" is correct whenever the fix
   needs a policy decision rather than a rewiring. Report `unroutable` beside
   `routable`, always.
3. **The router receives verdicts, never a target.** *What is ungrounded and
   why* is data. *Make this number go up* is an objective, and an objective is
   what turns the score into a selection signal and kills it. Nothing in this
   unit may take the ratio as an input to optimize.
4. **`projectedRatio` is a projection.** Never written to a `Report`, never
   fed back into `groundingRatio`, always rendered as a conditional.
5. **`status` is always `'proposed'`.** Applying a change is out of scope for
   this unit and for any agent.
6. **Locate mechanically, judge agentically.** `route.ts` indexes the anchored
   nodes and assembles candidate pairs; the *argument* is the agent's. A lookup
   table of "self-referential check → canned fix" has misread the thesis.

---

## Acceptance

Three commands, all observable.

```bash
# 1. Emits bindings from the fixture, every anchoredOn resolves or is null
bun skills/keel/scripts/route.ts tests/fixtures/report.sample.json \
  --out /tmp/b.json
bun -e '
const r = await Bun.file("/tmp/b.json").json();
const ok = new Set(r.bindings.map(b=>b.loop));
const anchored = new Set(); // ids classified anchored in the source report
for (const b of r.bindings) {
  if (b.anchoredOn === null && !b.noRouteReason) throw new Error("null route with no reason: "+b.loop);
  if (b.status !== "proposed") throw new Error("agent emitted non-proposed status");
}
if (r.summary.routable + r.summary.unroutable !== r.bindings.length) throw new Error("summary does not sum");
console.log("bindings", r.bindings.length, "routable", r.summary.routable, "projected", r.summary.projectedRatio);
'
```

```bash
# 2. THE SEPARATION TEST — the score must be unreachable from routing
bun test tests/separation.test.ts
```

`tests/separation.test.ts` must: measure a target with no bindings file
present; write an **adversarial** bindings file claiming everything is
routable; measure again; assert `verdicts` and `grounding` are identical.
If they differ, the constructor is reaching the scorer and the unit has failed.

```bash
# 3. Renders standalone, offline
bun skills/keel/scripts/route.ts tests/fixtures/report.sample.json --html /tmp/b.html
# assert no off-origin fetches: no <script src=, <link href=, @import pointing out
grep -E '<script[^>]+src=|<link[^>]+href=|@import' /tmp/b.html || echo "self-contained OK"
```

---

## The page

One row per ungrounded node, cheapest wins on top:

| what's ungrounded | route to | why that's anchored | effort |
|---|---|---|---|

Header carries the pair: **`0.61 today · 0.78 if applied`** — the second
number visibly labelled a projection.

Render the `construct` columns (`pairedWith`, `arbitratedBy`, `auditEvery`)
as **visibly empty, headed "Construct — not yet."** The architecture should be
legible on the page rather than promised in a slide.

---

## Degradation

R sits **below F** in the ladder: drop `F` (ε-audit) first, then R. R must
never endanger B (renderer) or G (curve). If R is behind at 23:00, ship the
JSON without the HTML page — the bindings file alone still demonstrates the
mode.
