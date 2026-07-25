# Handoff — Keel MVP build (successor)

**Predecessor:** [`2026-07-24-keel-build-night.md`](2026-07-24-keel-build-night.md) —
thesis, research chain, rejected alternatives. Read it for *why*; this file is *where we
are*.

**Arc:** Keel — grounding-ratio measurement for agent-maintained systems
**Session:** 2026-07-24, build night, Bogotá · deadline 03:00 COT
**This file written:** 19:30 COT

---

## TL;DR

The engine is built and dogfooded. Keel has measured **itself** end to end and published
an honest number.

> **Keel's own grounding ratio: 0.421** — anchored 8 of 19 classified edges,
> self_referential 11, unknown 0, not_a_check 13 (excluded from the ratio and printed
> beside it).

The most useful thing it found is about us: **`bun test` and `tsc --noEmit` are not run by
any CI workflow**, so they gate nothing. Per `grounding-classes.md` ("classify the edge
that actually blocks the merge, not the file that could have") both were downgraded from
`anchored` to `self_referential` by the adversarial reviewer. That is Keel working.

---

## 1 · State of the world (P15 snapshot)

| Thing | State |
|---|---|
| Branch | `build/w0-fixture` (off `main` @ `44f7e8d`) |
| Merged tonight | PR #1 governance bootstrap + design system |
| Pages | **live and content-verified** — `mark.svg`/`tokens.css`/`keel.css` served |
| Toolchain gates | `bun test` 3 pass · `bunx tsc --noEmit` clean · `make design-audit` clean |
| Schema | v3, **frozen**, untouched |

### Remotes — important
`origin` fetches from the **judging org repo** and pushes to **both** org and
`broomva/keel`. But `gh pr merge` acts on the **org** repo only, so after a merge the
mirror's `main` is stale and Pages does not redeploy. Fix:

```bash
git push https://github.com/broomva/keel.git origin/main:refs/heads/main
```

Pages now only runs on the mirror (`if: github.repository == 'broomva/keel'` in
`pages.yml`) — the org repo cannot host Pages, so it was failing on every push and
producing a permanently red check that said nothing.

---

## 2 · Orchestrator rulings made tonight (these settle open questions)

The orchestration plan explicitly left two to "the orchestrator on the night". Both are
now decided and implemented by A, C and D consistently:

1. **`--probe-dir` REPLACES the default set.** With no flag, dirs are
   `[shipped, $KEEL_PROBE_DIR]`. With one or more flags, dirs are exactly those, in order.
   Append-only would make fan-out isolation impossible.
2. **Probe files are `<id>.v<n>.ts`.** Minting never overwrites; it writes the next
   version. The loader takes the highest version per id and warns about each shadowed one.

Two further calls made during the build:

3. **Confidence-smell threshold is `< 0.6`** on `anchored` verdicts. The fixture's honest
   minimum confidence is 0.50, so the spec'd `< 0.5` would never fire on real data.
   Loosening a smell threshold catches more, which is the conservative direction.
4. **The corpus runs with `--probe-dir` at an initially EMPTY library.** This excludes the
   shipped example probe (see §4) and means every probe hit later in the corpus was earned
   by minting during the run. Run index 0 records `probe library 0 (+0 this run)`.

---

## 3 · What was delivered

### W0 · Fixture — `tests/fixtures/report.sample.json` (committed `e37a140`)

A real Report of this repository, not a hand-authored shape. Pipeline: 4 independent
classifiers over disjoint node groups → 1 adversarial reviewer per group (cross-assigned,
none reviewed its own work) → 3-judge tie-break on the disputed `unknown` question.

- 15 of 32 edges, **proportional stratified** in gatherer order — sample ratio 0.444 vs
  population 0.421, so the sample is representative rather than flattering.
- `nodesTotal` 32 ≠ `nodesSampled` 15 — this is the no-silent-caps disclosure path.
- 0 verdicts missing an argument; 0 arguments that open by restating their class.

**Deliberate deviation from the plan:** the plan required ≥2 `unknown`; the fixture has
**zero**, and none was fabricated. A dedicated tie-break asked three independent judges
whether unpinned out-of-repo dependencies establish a fork point. Unanimously they do —
and it lands *inside* the write boundary, because the resolution mechanism is itself
committed (`Makefile:16-22` selects from four actor-writable roots), so any copy it can
select is actor-writable. That is strictly more informative than `unknown`. The `unknown`
render path is exercised synthetically instead.

### Wave 1 units

| Unit | Owns | State |
|---|---|---|
| **A** classify engine | `classify.ts`, `probe-loader.ts` | built, reviewed, dogfooded |
| **C** probe mint + sandbox | `mint-probe.ts`, `probe-sandbox.ts`, `probes/*.ts` | built, **3 BLOCKERs found**, fixing |
| **D** corpus runner | `corpus.ts`, `corpus.json` | built, 3 MAJORs found, fixing |
| **I** demo assets | `docs/demo/**` | built (`run-sheet.html`, `objections.html`) |
| **B** report renderer | `render.ts`, `templates/**` | in flight |
| **E** tests + CI | `tests/**`, `test.yml` | in flight |
| **G** crystallization curve | `curve.ts`, `reports/curve.*` | in flight |

### Corpus — `corpus.json`, 15 targets

All 15 pinned SHAs verified to resolve via the GitHub API. Deliberate spread of
verification cultures: generated SDKs (anthropic/openai), agent tools (aider,
browser-use), infra (requests, flask, sinatra), docs-heavy (anthropic-courses), and keel
itself first.

`gather` validated against real targets before the run: requests 106 nodes, flask 59,
sinatra 59, aider 62, commander.js 21 — good kind diversity across Python, Ruby, JS.

---

## 4 · The P20 gate earned its keep — read this before trusting a probe

The adversarial review found a **BLOCKER in the one shipped probe**
(`example-llm-review-gate.v1.ts`): `haystack()` folded `node.source` into the matched
text, so **every step in a file named `.github/workflows/claude-code-review.yml` matched**
— it contains "claude" and "review" in its *path*. Reproduced concretely:

```
match on a genuinely ANCHORED pytest step: true  → classified self_referential
```

`aider` and `anthropic-quickstarts` plausibly ship exactly such workflows, so this would
have silently corrupted the headline corpus number. The corpus run was **stopped
mid-flight** and restarted against an empty probe library.

Repro kept at `scratchpad/probe-overmatch-repro.ts` — run it after the fix; expected
`victim=false, legit=true`. It also asserts `assess()` has a reachable `null` path, since
the same review found minted probes where `assess` re-ran `match`'s exact predicate and so
could never abstain.

Other confirmed findings: an **overclaimed sandbox** (a warning claiming "stripped env"
on a path that did not strip it — self-refuting in this product), and zero-node targets
emitting `ratio: 0` instead of "nothing gathered".

**Lesson for the probe library generally:** a probe must match on what a step *does* (its
command, its action ref), never on where it lives. File names are attacker-adjacent input.

---

## 5 · Verified empirically (P11) — not inferred

- **Kill-timer is real.** A probe whose `match()` is `while(true)` is killed by the
  **parent** at 10,016ms; all 32 nodes fall through to `pending`; exit 0; warning names the
  budget. An in-process guard could not do this.
- **Throwing probe** → skipped, named in warnings, non-fatal.
- **Probe returning `unknown`** → rejected at assess-time *inside the child*, skipped,
  nodes → pending. This is what keeps `unknown` unshoppable even against a probe that lies
  to the compiler.
- **Zero-probe path** → `decided=0, pending=32, exit 0`. The pure-agentic path is complete.
- **Corpus stepper** → clones, gathers, caps at 40 of 41 **with the cap disclosed**,
  resumes (skips recorded repos), records with ratio + anchored count + coverage + scope
  note.
- **Clean-room `npx skills@1.5.18 add`** into an empty store yields a **runnable** skill:
  `gather.ts` executes and `schemas/keel.ts` imports. (`--list` alone would not have
  proven this.)
- **Deployed site** verified by fetching *content*, not by a green check.

---

## 6 · Orchestration mistake worth not repeating

The corpus was dispatched into the same file space as unit D's fixer, which legitimately
**owns and exercises `corpus.ts`** — running it as part of its acceptance wiped
`reports/`, destroying a recorded keel entry. File-disjoint ownership covers *authoring*,
not *execution side effects*. **A unit that runs its own tool must be serialized against
any orchestrator job that consumes that tool's output directory.**

Cost was low only because the expensive artifact (32 reviewed verdicts) was backed up
outside `reports/` and `.keel-corpus/`.

---

## 7 · Next actions, in order

1. Drain Wave 1 fixes (A/C/D/I, then B/E/G). Verify C's probe fix with
   `scratchpad/probe-overmatch-repro.ts` **before** anything reads the probe library.
2. Re-record `keel` (verdicts already exist at `.keel-corpus/keel.verdicts.json` — cheap),
   then restart the corpus for the 14 remaining targets, sequentially, `--probe-dir` at
   `.keel-probes-corpus`.
3. `curve.ts` over `reports/` → `reports/curve.json` + `reports/curve.svg`. **Publish a
   flat curve if that is the true result.**
4. Render every report, publish `site/reports/`, verify by fetching deployed content.
5. Commit, PR, cross-review, merge; sync mirror `main`; update this handoff.

**Degradation ladder if behind:** drop W2·F (ε-audit), then the fallback video, then the
curve, then the corpus down to 3 repos. **Never drop B** — a run with no visual is not
demonstrable. The corpus is resumable and every recorded repo is independently valuable,
so cutting it is a clean cut: record what was cut, do not silently shrink.

---

## 8 · Concurrent human edits (do not revert)

A brand redesign (SVG mark family → PNG) and a `SKILL.md` description change landed in the
working tree from outside this build. They are **not staged by the build** and were left
untouched; `make design-audit` still passes against them. Commit them separately.

---

*Keel measures the shape of verification, not its quality. A repo can be 100% anchored
with terrible tests. Anchoring says the signal comes from outside; it does not say the
signal is enough.*
