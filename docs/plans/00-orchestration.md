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
decides, re-freezes, and re-dispatches. This has now happened twice by hand
(`not_a_check` after running `gather`; then the pre-dispatch v2 amendment
below), and it was cheap only because nothing was running in parallel yet.

**Schema v3 is the frozen version** (pre-dispatch). v2 added `ClassifyOutput`
(the dispatch↔judgment contract), `RunEconomics.nodesSampled` +
`tokensEstimated` (token counts are estimates — no API exposes session usage
to a skill; label chart axes accordingly), and `coverageByKind()`.

**v3 adds `ProbeVerdict`**, and it changes what units must build. Three plans
asserted that a probe returning `unknown` is *"rejected at load time"* / *"at
mint time"*. **That is not implementable** — a probe's return value is only
knowable by calling it, and calling it may only happen inside the sandbox
child. It is now a **type**: `Probe.assess` returns `ProbeVerdict | null`,
where `ProbeVerdict.class` is `Exclude<GroundingClass,'unknown'>`. A probe
returning `unknown` is a compile error (verified: `TS2322`).

Consequences, and units must follow them:
- **Delete "reject at load time" / "enforce at mint time"** from your plan's
  reading. The compiler holds it.
- Keep a **runtime check at assess-call time inside the sandbox child** — a
  probe can be plain JS and lie to the compiler. That is belt-and-braces, and
  it is the ONLY runtime enforcement point.
- The handoff's old claim that `Omit<Verdict,'nodeId'|'decidedBy'|'probeId'>`
  enforced this was **false** — that `Omit` retained `class: GroundingClass`,
  which includes `'unknown'`. It is true now.

Same rule, softer, for the shared prose hotspots: **`SKILL.md`, `README.md`, and
`site/index.html` are orchestrator-owned.** Units propose edits in their PR body
rather than making them. W2·H's "add the results link" edit to `site/index.html`
is the **one** carve-out, and it happens after Wave 1 has drained.

**Also orchestrator-owned — do not edit, do not "fix":**

- `package.json`, `tsconfig.json`, `bun.lock` — the toolchain baseline.
- `tests/grounding-ratio.test.ts` — the pre-flight smoke test. W1·E builds
  *on* it; W1·E does not replace it.
- `CLAUDE.md`, `AGENTS.md`, `METALAYER.md`, `.control/**` — **governance.**
  Editing these trips the L3 rate gate in `.githooks/pre-commit`, whose only
  documented escape is `git commit --no-verify` — which Gate (P2) blocks as
  G2. The result is an **unrecoverable commit deadlock**. No unit has any
  reason to touch them.

### Pre-flight state (already true on `main` — verify, do not rebuild)

`bun test` → **exit 0** (3 pass) · `bunx tsc --noEmit` → **exit 0** (clean).

Both were exit 1 before dispatch prep: there was no `tsconfig.json` and no test
files, so every unit running the loop-prompt's step 7 would have read a
pre-existing failure as its own damage. If either is non-zero when your unit
starts, something upstream broke — **report it, do not chase it.**

### Probe-directory isolation (MANDATORY — worktrees do not cover `$HOME`)

W1·A, W1·C and W1·D all read and write `~/.config/keel/probes/`. Worktrees
isolate the repo; they do **not** isolate the home directory. Left as-is, A's
deliberately-hostile probes (a thrower, a `while(true)`) would hang C's
acceptance run and poison D's corpus economics — which is the crystallization
curve, i.e. the headline result.

Every unit therefore resolves its probe dir as:

```
KEEL_PROBE_DIR="${KEEL_PROBE_DIR:-$HOME/.config/keel/probes}"
```

and every dispatched unit exports a worktree-local value before running
anything:

```bash
export KEEL_PROBE_DIR="$PWD/.keel-probes"   # per-worktree, git-ignored
mkdir -p "$KEEL_PROBE_DIR"
```

The dir may not exist — `loadProbes` MUST treat a missing dir as "no probes",
never as an error. `~/.config/keel/probes/` stays the user-facing default in
`SKILL.md`; it is only overridden during fan-out.

### `reports/` partition (three units write here)

`reports/**` is claimed wholesale by W2·H, but W1·D and W1·G write into it
during Wave 1. Filenames are disjoint, so the partition is by **file**:

| Path | Owner |
|---|---|
| `reports/<target>.json`, `reports/corpus-summary.json` | W1·D |
| `reports/curve.json` | W1·G |
| `site/reports/**` and publishing | W2·H (reads the above; writes neither) |

### B ↔ G insertion point (named, because units cannot talk)

W1·G emits the curve as a standalone SVG fragment to **`reports/curve.svg`**.
W1·B's template contains the literal marker line:

```html
<!-- KEEL:CURVE -->
```

B renders the marker whether or not the file exists; if `reports/curve.svg` is
absent B leaves the marker and renders nothing there. Neither unit waits for
the other, and the token is fixed here so they cannot disagree at merge.

**Class colours** (all four — `not_a_check` was missing):
`anchored #4ade80` · `self_referential #f87171` · `unknown #fbbf24` ·
`not_a_check #64748b` (slate — deliberately inert, it asserts nothing).

### The sandbox contract (orchestrator-owned interface between A and C)

Probe code — including **loading**, which executes the file — runs ONLY inside
one sandboxed child process per run. A synchronous `while(true)` in-process
cannot be preempted in JS, so an in-process "time guard" is fiction; the
kill-timer must hold a process handle.

- `classify.ts` (W1·A, parent): spawns `bun scripts/probe-sandbox.ts
  <nodes.json> [--probe-dir <dir>]...`, holds a **wall-clock kill-timer on the
  whole batch** (~10s default). Child dead or hung → all nodes `pending`,
  warning recorded, run still valid.
- `probe-sandbox.ts` (W1·C, child): loads probes via W1·A's
  `probe-loader.ts` (exports
  `loadProbes(dirs: string[]): Promise<{probes: Probe[]; warnings: string[]}>`),
  runs `match`/`assess` over all nodes, writes `ClassifyOutput` JSON to stdout.
  Per-probe try/catch inside the child; a throwing probe is skipped with a
  warning.
- Both units code to THIS contract, not to each other's implementation.
  Integration happens at merge; neither blocks on the other.

### Cross-cutting: the ratio never travels alone

Every surface that shows a grounding ratio (B's renderer, D's summary, H's
site) shows the **absolute anchored count** and **coverage by kind** beside
it, and renders zero-node targets as "nothing gathered", never as a ratio.
This is Gap-1 applied to our own headline metric.

---

## Wave 0 — the unblocker (BLOCKING, do alone, ~30 min)

Nothing parallelizes until a realistic `report.json` exists, because half the
units consume it and would otherwise have to wait for the engine.

| Unit | Deliverable |
|---|---|
| **W0** | `tests/fixtures/report.sample.json` — a hand-verified Report for a real target (use `~/broomva/apps/maestro`, 69 edges) |

Produce it semi-manually: run `gather`, classify ~15 nodes by hand across all
four classes (including at least two `unknown` and one `not_a_check`), fill
plausible `economics`. It does not need to be complete — it needs to be
**shape-correct and honest**.

**Acceptance:** `bun -e "import {groundingRatio} from './skills/keel/schemas/keel.ts'; ..."`
computes a ratio from the fixture without type errors.

Once W0 lands on `main`, dispatch Wave 1.

---

## Wave 1 — parallel (7 units)

All start from `main` after W0. G and I were pulled forward from Wave 2 —
both consume only the fixture/schema, so waiting for Wave 1 to merge was
pure lost wall-clock.

| Unit | Owns (writes only these) | Depends on |
|---|---|---|
| **A · classify engine** | `skills/keel/scripts/classify.ts`, `skills/keel/scripts/probe-loader.ts` | schema + sandbox contract |
| **B · report renderer** | `skills/keel/scripts/render.ts`, `skills/keel/templates/` | schema + fixture |
| **C · probe mint + sandbox** | `skills/keel/scripts/mint-probe.ts`, `skills/keel/scripts/probe-sandbox.ts`, `skills/keel/probes/*.ts` | schema + sandbox contract |
| **D · corpus runner** | `skills/keel/scripts/corpus.ts`, `corpus.json` | schema |
| **E · tests + CI** | `tests/**` — **except** `tests/fixtures/report.sample.json` (W0), `tests/fixtures/economics/**` (G), and `tests/grounding-ratio.test.ts` (pre-flight) — plus `.github/workflows/test.yml` | schema + fixture |
| **G · crystallization curve** | `skills/keel/scripts/curve.ts`, **`tests/fixtures/economics/**`**, `reports/curve.json` | schema + fixture (synthetic economics) |
| **I · demo assets (minus video)** | `docs/demo/**` | handoff + plans only |

**Critical path is A → D.** B, C, E, G, I are genuinely independent of A
because they consume the fixture or the interface, never A's implementation.

---

## Wave 2 — parallel (after Wave 1 merges)

| Unit | Owns | MVP? |
|---|---|---|
| **F · ε-audit** | `skills/keel/scripts/audit.ts` | flourish — cut if behind |
| **H · site publish** | `site/reports/**`, `reports/**` | **yes — beat 1 of the demo** |
| **I₂ · fallback video** | `docs/demo/**` (recording) | **yes — record at ~01:00, once beats work** |

---

## Dispatch

```bash
# Wave 1 — one background agent + worktree per plan
bstack wave dispatch \
  docs/plans/w1-a-classify-engine.md \
  docs/plans/w1-b-report-renderer.md \
  docs/plans/w1-c-probe-mint-sandbox.md \
  docs/plans/w1-d-corpus-runner.md \
  docs/plans/w1-e-tests-ci.md \
  docs/plans/w1-g-curve.md \
  docs/plans/w1-i-demo-assets.md
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

1. **Published corpus report** — `site/reports/` serves a ratio table (each
   ratio paired with anchored count + coverage) across 10–15 repos plus the
   crystallization curve. Static, precomputed, cannot fail live.
   *(Needs A, B, D, G, H.)*
2. **Live run mints a probe** — point Keel at an unseen repo; a novel shape gets
   judged and a probe lands in `~/.config/keel/probes/`. *(Needs A, C.)*
3. **`npx skills add broomva/keel`** — already working; verify with a
   clean-room install into an empty store before pitching.

**Honesty extras (cheap, do not cut silently):** the repeatability number
(classify one repo twice, publish verdict agreement — the empirical
stability-of-the-loop claim) and the ratio-stability-under-shuffle check in G.

**Degradation ladder (decide in this order if behind):** drop F, then I₂'s
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
