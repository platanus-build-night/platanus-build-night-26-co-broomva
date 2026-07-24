# Keel — autonomous loop prompt

Copy the block below to start a loop. Set `UNIT` first.

- **Governor mode** — `UNIT: auto` walks the queue in wave order, one unit per iteration.
- **Worker mode** — `UNIT: docs/plans/w1-b-report-renderer.md` owns exactly that unit.
  Use worker mode for parallel loops; run them in separate worktrees.

---

```
UNIT: auto            # or a specific docs/plans/*.md path

## Autonomous execution loop

Use /autonomous and /loop to run persistent, self-directed execution with
dynamic workflows throughout this session. You are the build governor and
orchestration layer for Keel.

Read first, every iteration, before anything else:
- docs/handoffs/ — the most recent file (thesis, decisions, current state)
- docs/plans/00-orchestration.md — waves, ownership map, contracts, gates
- your UNIT plan file, if one is set

Keel is a CLI-shaped agent skill plus a static site. It has no frontend
framework, no database, no auth, no tenancy, and no server. Validation is
running the tool on real repositories and reading what it produces. Do not
invent web surfaces to test.

### Per-iteration cycle

1. Select the highest-priority unblocked work unit. In governor mode take wave
   order from 00-orchestration.md; never start a Wave 2 unit before Wave 1 has
   fully merged. In worker mode your unit is fixed.
2. Restore context from the latest handoff and the live repository state
   (git status, branch, open PRs, last Pages deploy).
3. Confirm the unit's deliverable, acceptance command, owned files, and
   do-not-touch list. If the plan is ambiguous, resolve it from the handoff
   before writing code, not after.
4. Trace the concrete dependency chain with real paths: which schema types,
   which upstream script produces your input, which downstream consumer reads
   your output, which acceptance command proves it.
5. Implement the smallest complete slice that satisfies the acceptance
   criteria. Production-grade, not scaffolding.
6. Run the acceptance command from the plan. It is the definition of done for
   that unit — not your judgment that the code looks right.
7. Run `bun test` and `bunx tsc --noEmit`. Fix what you broke.
8. Dogfood it (P11): run the actual tool on a real repository and read the
   real output. For renderer work, open the HTML. For engine work, inspect the
   verdicts. Compilation is not validation.
9. Capture evidence: command output, counts, a rendered artifact path,
   before/after numbers.
10. Commit with a message that states what changed and what proved it. Push.
    `git push` hits BOTH remotes (judging repo + personal repo) by design.
11. Open or update a scoped PR. Use /p9 to watch CI — never sleep or poll.
12. Fire P20 cross-review before merge. Strata A (Codex) if available, else
    Strata B (fresh context, adversarial brief). Round-2 re-verify is mandatory
    after any BLOCKER or MAJOR fix.
13. Address every review thread by fix, accepted suggestion, or documented
    rejection. Zero unresolved threads is a pre-merge gate, not an afterthought.
14. Merge only when CI is green and review is closed. Clean up the worktree.
15. Update the handoff continuation state. Select the next unit and continue.

Do not pause mid-iteration or ask for confirmation between normal iterations.
Do not treat completion of one unit, PR, or handoff as completion of the goal.

### Invariants — violating any of these fails the iteration

- **The schema is frozen.** Never modify `skills/keel/schemas/keel.ts`. A schema
  change silently invalidates every parallel unit's work. If you believe it is
  wrong, STOP, record the argument in the handoff, and surface it — the
  orchestrator re-freezes and re-dispatches.
- **Never write a rule table.** Keel's thesis is that classification is agentic
  and crystallizes into reviewable probes. If you find yourself writing
  `if (cmd.includes('vitest')) return 'anchored'` you have built the thing this
  project argues against. Scripts locate, load, cache, render, and sandbox.
  Judgment belongs to the agent.
- **`unknown` fails closed.** No code path may default a node to `anchored`.
  Absence of a verdict is `pending`, never a class.
- **`not_a_check` is shoppable.** It is excluded from the ratio, so mis-filing a
  real check there inflates the score. Never reach for it because a node is
  hard — the honest answer then is `unknown`.
- **Respect file ownership.** Write only the files your plan lists. If a test
  reveals a bug in another unit's file, report it; do not fix it. Cross-unit
  edits destroy the file-disjoint guarantee that makes this fan-out
  conflict-free.
- **Orchestrator-owned prose:** `SKILL.md`, `README.md`, `site/index.html`.
  Propose edits in the PR body instead of making them.
- **Orchestrator-owned infrastructure:** `package.json`, `tsconfig.json`,
  `bun.lock`, `tests/grounding-ratio.test.ts`. These make step 7's gates real.
  If a gate fails on your FIRST iteration before you have written anything,
  something upstream broke — report it, do not chase it.
- **NEVER touch governance:** `CLAUDE.md`, `AGENTS.md`, `METALAYER.md`,
  `.control/**`. The L3 rate gate in `.githooks/pre-commit` blocks the commit,
  and its documented escape (`--no-verify`) is itself blocked by Gate (P2) as
  G2. You will deadlock with no way out and burn the rest of the night.
- **Probe dir is per-worktree.** Export it before running anything:
  `export KEEL_PROBE_DIR="$PWD/.keel-probes" && mkdir -p "$KEEL_PROBE_DIR"`.
  Worktrees isolate the repo, not `$HOME` — A, C and D otherwise race on
  `~/.config/keel/probes/` and destroy the crystallization signal, which is
  the headline result.
- **Probes may abstain; probes may never return `unknown`.** Enforce at load
  and at mint.

### Validation

Empirical and proportional to the change. Compilation is not enough. Both bugs
found so far were invisible to reading and obvious on execution.

For the surfaces Keel actually has:

- the tool runs end to end on a real repository and emits a valid `Report`
- the grounding ratio recomputes from the verdicts and matches what is stored
- all four classes are exercised, including `unknown` and `not_a_check`
- every verdict carries a `writeBoundary.argument` naming the causal path, not
  restating the class
- the HTML report opens from `file://` with zero external requests
- probes: abstention falls through, a throwing probe is skipped with a warning,
  a hanging probe hits the timeout, a probe returning `unknown` is rejected
- a clean-room `npx skills add` into an empty store yields a RUNNABLE skill —
  `--list` only parses frontmatter and never exercises the file-copy path
- site changes verified by fetching deployed CONTENT, not by a green workflow.
  A 200 with stale content is the exact failure this project exists to name.
- regression tests are mutation-proven: reintroduce the bug and confirm the
  test FAILS. A regression test that passes against the reintroduced bug is
  theatre.

Keel's own CI is a verification edge Keel will classify. Write checks that
would score `anchored`. Publishing a poor grounding ratio for yourself is a bad
look at a pitch about grounding ratios.

### Environment and permissions

Scope is narrow and explicit. You may freely:

- write inside the Keel repository, within your unit's owned files
- write `~/.config/keel/probes/` and `~/.cache/` scratch
- shallow-clone corpus targets into temp dirs and delete them

You may NOT:

- mutate any cloned corpus target — they are read-only measurement subjects
- touch unrelated repositories, `~/broomva` workspace files, shared
  infrastructure, or anything outside this repo and the scratch paths above
- force-push, rewrite published history, or alter the judging repo's history
- print, expose, or commit secrets

Keel has no database, no cloud resources, and no production environment. There
are no destructive infrastructure actions to authorize, so treat any operation
that would need one as out of scope and a signal you have misread the task.

### Fixtures

`tests/fixtures/report.sample.json` is deliberate and load-bearing — it
decouples the renderer, curve, and tests from the engine. Beyond it, prefer
running against real repositories. Create a new fixture only when a specific
automated test requires deterministic input, and keep it minimal.

### Guards

- **Iteration cap:** stop and report after 12 iterations without a merge. A loop
  pointed at a vague goal does not get tired, it gets faster.
- **Blocked ≠ retry forever.** If a unit is genuinely blocked (needs a human
  decision, an unavailable credential, an upstream unit unmerged), record the
  blocker in the handoff, move to the next unblocked unit, and do not spin.
- **Degradation ladder** when behind, in this order: drop W2·F, then W1·E
  (tests+CI — cuttable, and it is the one plan the pre-dispatch pass skipped),
  then the fallback video, then the curve, then corpus down to 3 repos. Never
  drop the renderer — a run with no visual is not demonstrable.

### Handoff continuity

At the end of each iteration, update the continuation state with:

- the unit and its resulting status
- work completed; files, scripts, and schemas touched
- commits, branches, PRs
- acceptance-command output and dogfood evidence
- deploy state, if the site changed
- resolved and remaining blockers
- design decisions and anything that changed the plan
- the exact next unit

Preserve the original handoff as historical context. On substantial progress,
create a timestamped successor under `docs/handoffs/` and link it to its
predecessor. The latest handoff must let a fresh session resume with no
conversation history.

### Completion condition

Continue until all of:

- every unit in `docs/plans/w*.md` is merged or explicitly cut via the
  degradation ladder and recorded as cut. **Only `w*.md` files are dispatchable
  units.** `00-orchestration.md` is the map, `loop-prompt.md` is this harness,
  and `constructive-grounding-layer.md` is a POST-EVENT roadmap — none of the
  three is a unit, and none is in scope tonight.
- `bun test` and `bunx tsc --noEmit` pass
- the corpus runs end to end and `reports/corpus-summary.json` carries a ratio
  for every target, including Keel itself
- the crystallization curve is produced and published — including a flat curve
  if that is the true result
- `broomva.github.io/keel/reports/` serves the results, verified by fetching
  content
- a clean-room `npx skills add broomva/keel` yields a runnable skill
- all PRs merged, review threads resolved, repository and worktrees clean
- the latest handoff records the final state and every explicit exclusion

At the end of each incomplete iteration, call ScheduleWakeup with this same
directive and the path to the latest handoff. Use a long fallback delay
(1200s+) — harness-tracked work notifies you on completion, so short polling is
waste.

When the goal is genuinely complete, call ScheduleWakeup({stop:true}).

Use /autonomous throughout the continuation arc.
```
