# Handoff — Keel, corpus complete

**Predecessors:** [`2026-07-24-keel-build-night.md`](2026-07-24-keel-build-night.md)
(thesis, research chain, rejected alternatives) ·
[`2026-07-24-keel-mvp-build.md`](2026-07-24-keel-mvp-build.md) (the build, the
orchestrator rulings, the first P20 findings).

**Written:** 2026-07-25, 23:05 COT.

---

## TL;DR

Keel is built, measured, published, and live. The engine runs end to end, fifteen
real repositories have been measured, and the results are served at
**<https://broomva.github.io/keel/reports/>** — verified by fetching the content,
not by a green check.

> **Pooled grounding ratio 0.853** — 122 anchored of 143 classified edges across
> 14 measured repositories, plus one that measured to nothing and says so.
>
> **Keel scores 0.357 — the lowest number in its own corpus.**

---

## 1 · State (P15 snapshot)

| Thing | State |
|---|---|
| `main` | all engine work merged (PR #3), corpus in PR #8 |
| Live site | `broomva.github.io/keel/reports/` — content-verified |
| `bun test` | 153 pass |
| `tsc --noEmit` | clean |
| `make design-audit` | clean |
| `portability-check` | clean |
| CI | green on ubuntu **and** macOS |

**Remotes.** `origin` fetches from the judging org repo and pushes to both. But
`gh pr merge` acts on the **org** repo only, so after a merge the mirror's `main`
is stale and Pages does not redeploy. Fix:

```bash
git push https://github.com/broomva/keel.git origin/main:refs/heads/main
```

---

## 2 · The corpus

Fifteen targets, each pinned to a verified revision, judged **sequentially** from
an **empty** probe library so every probe hit later in the run was earned by
minting during it.

| # | target | ratio | lib | free | tok/node |
|---|---|---|---|---|---|
| 0 | keel | **0.357** | 0 | 0 | 498 |
| 1 | anthropic-sdk-python | 0.667 | 3 | 0 | 369 |
| 2 | openai-python | 0.769 | 5 | 4 | 398 |
| 3 | vercel-ai | 0.800 | 8 | 2 | 410 |
| 4 | aider | 1.000 | 10 | 14 | 204 |
| 5 | browser-use | 1.000 | 12 | 8 | 378 |
| 6 | mcp-python-sdk | 1.000 | 13 | 0 | 592 |
| 7 | simonw-llm | 0.750 | 15 | 14 | 189 |
| 8 | tiktoken | 1.000 | 17 | 7 | 240 |
| 9 | requests | 0.917 | 19 | 7 | 290 |
| 10 | flask | 1.000 | 22 | 0 | 408 |
| 11 | sinatra | 0.875 | 23 | 7 | 265 |
| 12 | commander-js | 1.000 | 26 | 4 | 316 |
| 13 | anthropic-quickstarts | 1.000 | 29 | 6 | 310 |
| 14 | anthropic-courses | *nothing gathered* | 29 | 0 | — |

### The curve — stated as measured, not as hoped

| series | change | R² |
|---|---|---|
| probe library size | 0 → 29 | **0.99** |
| probe-decided share | +145% | 0.21 |
| estimated tokens/node | −66.5% | 0.28 |
| seconds/node | −72.9% | 0.04 |

Crystallization is real. **Every cost series is noisy**, and `curve.ts` prints
that on the chart rather than in a footnote: *"the line explains less than half
the variance — read the raw squares."* Run 6 (592 tok/node at 0% probe share) and
run 10 (408 at 0%) are visible in the data. Repositories differ in shape more
than a 15-run library compounds. **A fitted line without its R² would have been
the dishonest version of this result.**

`curve.ts` also refuses to call a run "measured" until provenance is declared
(*"provenance is declared, never inferred"*), records that the declaration
arrived on the command line rather than in a committed `corpus.meta.json`, and
reports its own shuffle check as **INCOMPLETE** — the curve direction ran, the
ratio direction did not, because no independent re-run was supplied.

---

## 3 · The ε-audit caught real drift — the counter-metric working

Re-running `tiktoken` became an audit: by then the library decided every node.
Two disagreements, both in the direction that matters.

```
check-manifest: anchored (agent) → not_a_check (probe)
build sdist:    anchored (agent) → not_a_check (probe)
```

`unfrozen-dependency-install` matched `pip install` inside a multi-line `run:`
block and filed the **whole step** `not_a_check` — but those steps also run
`check-manifest -v` and `python -m build --sdist`. **Drift into the shoppable
class shrinks the denominator and inflates the ratio**: the exact failure this
project names, produced by its own machinery, invisible precisely because a probe
verdict is cheap.

Blast radius was **checked, not assumed** — 13 verdicts from that probe, only
these 2 wrong, both confined to the audit side-file. No published report carries
them, because in the original run those nodes were agent-judged and came back
`anchored`. **The audit caught the drift before it reached a published number.**

Response was the one SKILL.md prescribes — narrow the match, don't retire. A step
is an install only if installing is all it does. Re-ran: **probe-vs-agent 3/5 →
3/3**, and the two swallowed nodes correctly report `pending for you: 2`.

The recorder also declined a stability number it could not defend: *"no node was
judged by the AGENT in both runs — no independent-re-judgment number is
defensible"*, and labels probe-vs-probe 7/7 *"deterministic by construction, NOT
evidence of stable judgment"*.

---

## 4 · What P20 caught that would have shipped

Both BLOCKERs were verified in **both** directions — a fix that closes an escape
by deleting the fallback is worse than the bug.

**A probe could force its own unconfined re-execution.** The degrade path read
"confined child produced zero bytes of stdout" as "the kernel rejected the
profile" and re-ran the same probe code with the seatbelt off. That signature is
under the probe's control: `process.exit(0)` at module load produces it exactly,
so hostile probe code could select its own unconfined pass with credential reads
and network access. Degradation now requires a non-zero exit **and**
`sandbox-exec` naming itself on stderr — the one signal confined code cannot
forge. Measured: rejected profile → exit 65 + `sandbox-exec: syntax error`; clean
probe exit → 0 and silence. Negative control confirms a genuinely rejected
profile still degrades.

**The shipped probe matched `env:` and `if:` blocks.** Its header claimed it read
`uses:`/`run:`/`with:` "and nothing else"; it read the whole step. A step carrying
`OPENAI_API_KEY` in `env:` while running `pytest -q` was called
`self_referential` with a false argument. Now block-parsed. The first fix closed
all three false positives and silently broke both true positives — in `- name: X`
the dash sits at column 0 while siblings align at 2, so `uses:` read as a child of
`name:`. Only running both harnesses caught it.

---

## 5 · Verified by execution (P11), not inferred

- `while(true)` probe → killed by the **parent** at 10,016 ms, all nodes pend,
  exit 0, warning names the budget
- throwing probe → skipped and named, non-fatal
- probe returning `unknown` → rejected at assess-time **inside the child**
- zero-probe path → `decided=0, pending=32, exit 0`
- clean-room `npx skills@1.5.18 add` → **runnable** skill (`--list` would not
  have proven this)
- deployed site → verified by fetching content
- design-audit exemption, portability exemption, and the gather regression are
  each **mutation-proven**: reintroduce the defect, confirm the check FAILS

---

## 6 · Honesty work on the published surface

- **Thin ratios look thin.** `aider` renders `1.000 thin — 7 classified edges`.
- **Sampling reads as a fraction.** `vercel-ai` renders `25 of 1014 — 2% of the
  surface`. "25 of 1014" is a footnote; "2%" is the claim.
- **"nothing gathered" is a result, not a failure.** Three states — measured / no
  verification surface / failed — because collapsing any two of them lies.
- **Our machine paths scrubbed at publish; quoted evidence preserved.**
  openai-python's real `/home/codex` stays, because redacting it would falsify
  what a reader checks the verdict against.

---

## 6b · Units CUT, explicitly, per the degradation ladder

The ladder's order is: drop **F**, then **I₂**'s fallback video, then G's curve,
then the corpus down to 3 repos. The first two were taken; the last two were not
needed.

| Unit | Status | Why, and what stands in for it |
|---|---|---|
| **W2·F — ε-audit (`skills/keel/scripts/audit.ts`)** | **CUT — not built** | First on the ladder by design. **The mechanism it would automate was exercised by hand** through `corpus.ts next --repeat tiktoken`, and it found real drift (§3). What is missing is the *script* — a sampled, scheduled, agent-blind re-decision across all deciders including agent verdicts (the injection surface). The counter-metric exists as a measurement, not yet as a loop. |
| **W2·I₂ — fallback video** | **CUT — not recorded** | Second on the ladder, and not agent-executable: it is a screen recording of a human giving the demo. The run sheet (`docs/demo/run-sheet.html`) carries the beats, the commands, and a per-beat fallback, so the recording is a human task with a written script waiting for it. |
| W1·I's timed rehearsal | **Not done — human task** | Recorded as such per pre-dispatch correction #9, not claimed as a unit gate. |

Everything else in `docs/plans/w*.md` is **built and merged**: W0, W1·A, W1·B,
W1·C, W1·D, W1·E, W1·G, W1·I, W1·R, W2·H.

---

## 7 · Known gaps, stated rather than buried

- **Shuffle check incomplete.** Ratio-stability under reordering was never
  verified; it needs an independent re-run in a different order (`--shuffled`).
  The curve direction passed (81% of 400 permutations move the slope).
- **No independent re-judgment number.** Every repeat-run node was probe-decided,
  so agent-vs-agent stability is unmeasured. Pick a repo whose nodes the library
  does *not* cover.
- **W2·F (standalone ε-audit script) was never built** — the audit ran through
  `corpus.ts --repeat` instead. It is first on the degradation ladder and the
  mechanism it would automate has now been exercised by hand.
- **The cap is 25 nodes/repo.** Real sampling decision, disclosed everywhere it
  appears. `vercel-ai` gathered 1014.
- **Six of eight anchored verdicts on anthropic-sdk-python are pyproject
  `[tool.*]` sub-tables** — the gatherer's granularity spreads one ruff
  invocation across four nodes, which weights the numerator. Flagged by the
  judging agent rather than collapsed.

---

## 8 · Next

1. Merge PR #8, then **sync the mirror** (§1) or Pages will not redeploy.
2. Fill the shuffle gap: `corpus.ts next --repeat <repo>` on a target the library
   does not cover, then `curve.ts --shuffled`.
3. Post-event: correct `research/entities/tool/skills-sh.md`, file the Keel arc
   to the KG, and take the ontology call on Assay-as-parent.

---

*Keel measures the shape of verification, not its quality. A repo can be 100%
anchored with terrible tests. Anchoring says the signal comes from outside; it
does not say the signal is enough.*
