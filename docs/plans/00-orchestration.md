# Keel — fan-out orchestration plan

**Target:** MVP demonstrable end-to-end — a published corpus report with a
grounding ratio and a crystallization curve, plus a live run that mints a probe.

**Read first:** `docs/handoffs/2026-07-24-keel-build-night.md` (thesis, research
chain, decisions). This document is *how to parallelize*, not *what to build* —
the why lives in the handoff.

---

## The structural fact that makes fan-out possible

`skills/keel/schemas/keel.ts` is **frozen**. `report.json` is the contract
between engine and every consumer.

Claude Code parallel agents are **fan-out/fan-in only — no peer-to-peer
communication during execution** (only the parent sees the whole team). So
every work unit below is written to be:

- **self-contained** — its inputs already exist on disk when it starts,
- **file-disjoint** — it writes files no other concurrent unit writes,
- **independently verifiable** — its acceptance command needs no other unit.

If a unit would need to talk to a sibling, the partition is wrong. Fix the
partition, do not add coordination.

### The one hard rule

> **No agent may modify `skills/keel/schemas/keel.ts`.**

A schema change mid-fan-out silently invalidates every parallel unit's work. If
a unit believes the schema is wrong, it **stops and reports** — the orchestrator
decides, re-freezes, and re-dispatches. This already happened once by hand
(adding `not_a_check` after running `gather`), and it was cheap only because
nothing was running in parallel yet.

Same rule, softer, for the shared prose hotspots: **`SKILL.md`, `README.md`, and
`site/index.html` are orchestrator-owned.** Units propose edits in their PR body
rather than making them.

---

## Wave 0 — the unblocker (BLOCKING, do alone, ~30 min)

Nothing parallelizes until a realistic `report.json` exists, because half the
units consume it and would otherwise have to wait for the engine.

| Unit | Deliverable |
|---|---|
| **W0** | `tests/fixtures/report.sample.json` — a hand-verified Report for a real target (use **this repo**; it is the only target every contributor can reproduce from a bare clone) |

Produce it semi-manually: run `gather`, classify ~15 nodes by hand across all
four classes (including at least two `unknown` and one `not_a_check`), fill
plausible `economics`. It does not need to be complete — it needs to be
**shape-correct and honest**.

**Acceptance:** `bun -e "import {groundingRatio} from './skills/keel/schemas/keel.ts'; ..."`
computes a ratio from the fixture without type errors.

Once W0 lands on `main`, dispatch Wave 1.

---

## Wave 1 — parallel (5 units)

All five start from `main` after W0. All are MVP-critical except **E**.

| Unit | Owns (writes only these) | Depends on |
|---|---|---|
| **A · classify engine** | `skills/keel/scripts/classify.ts`, `skills/keel/scripts/probe-loader.ts` | schema |
| **B · report renderer** | `skills/keel/scripts/render.ts`, `skills/keel/templates/` | schema + fixture |
| **C · probe mint + sandbox** | `skills/keel/scripts/mint-probe.ts`, `skills/keel/scripts/probe-sandbox.ts` | schema |
| **D · corpus runner** | `skills/keel/scripts/corpus.ts`, `corpus.json` | schema |
| **E · tests + CI** | `tests/**` (except W0's fixture), `.github/workflows/test.yml` | schema + fixture |

**Critical path is A → D.** B, C, E are genuinely independent of A because they
consume the fixture or the interface, never A's implementation.

---

## Wave 2 — parallel (4 units, after Wave 1 merges)

| Unit | Owns | MVP? |
|---|---|---|
| **F · ε-audit** | `skills/keel/scripts/audit.ts` | flourish — cut if behind |
| **G · crystallization curve** | `skills/keel/scripts/curve.ts` | **yes — this is the headline** |
| **H · site publish** | `site/reports/**`, `reports/**` | **yes — beat 1 of the demo** |
| **I · demo assets** | `docs/demo/**` | **yes — rehearsal + fallback** |

---

## Dispatch

```bash
# Wave 1 — one background agent + worktree per plan
bstack wave dispatch \
  docs/plans/w1-a-classify-engine.md \
  docs/plans/w1-b-report-renderer.md \
  docs/plans/w1-c-probe-mint-sandbox.md \
  docs/plans/w1-d-corpus-runner.md \
  docs/plans/w1-e-tests-ci.md
```

Per **P19** this is the N>1 / external-trigger / across-session cell: one
`claude --bg` per plan, worktree per plan, state under
`~/.cache/bstack/wave/<id>/`.

If `bstack wave` is unavailable, the same partition works with parallel `Agent`
calls using `isolation: "worktree"` — the plans are written to be
mechanism-agnostic.

---

## Merge protocol

1. Each unit opens its own PR. **File-disjoint ownership means no merge
   conflicts by construction** — if you hit one, the partition was violated;
   report it rather than resolving creatively.
2. CI green + **P20 cross-review** before merge. For a unit that writes code the
   agent also validates, the reviewer must be a *fresh context* (Strata B).
3. Merge order within a wave does not matter. Between waves it does — drain
   Wave 1 fully before dispatching Wave 2.
4. After each merge, `git pull` in remaining worktrees is **not** required
   (disjoint files), but is harmless.

---

## Definition of done (MVP)

The three demo beats, in priority order:

1. **Published corpus report** — `site/reports/` serves a ratio table across
   10–15 repos plus the crystallization curve. Static, precomputed, cannot fail
   live. *(Needs A, B, D, G, H.)*
2. **Live run mints a probe** — point Keel at an unseen repo; a novel shape gets
   judged and a probe lands in `~/.config/keel/probes/`. *(Needs A, C.)*
3. **`npx skills add broomva/keel`** — already working; verify with a
   clean-room install into an empty store before pitching.

**Degradation ladder (decide in this order if behind):** drop F, then I's
fallback video, then G's curve (report ratios only), then D's corpus down to
3 repos. **Never drop B** — a run with no visual is not demonstrable.

---

## Standing constraints for every unit

- **Bun + TypeScript + Biome.** No npm/yarn, no ESLint/Prettier.
- **Zero runtime dependencies** unless the plan names one. `gather.ts` parses
  YAML-ish text without a YAML library on purpose: carrying the literal snippet
  forward beats half-understanding it.
- **Agentic, not rule-based.** Scripts are *plumbing* — they locate, load,
  cache, render, and sandbox. **Judgment is the agent's.** A unit that finds
  itself writing a lookup table of "check → class" has misread the thesis and
  must stop.
- **`unknown` fails closed. `not_a_check` is shoppable and audited.** Any code
  path that defaults a node to `anchored` is a bug, not a convenience.
- **Validate by running, not reading (P11).** Every plan's acceptance criteria
  is a command with observable output. Both bugs found so far — the dropped
  YAML steps and the missing fourth class — were invisible to reading and
  obvious on execution.
