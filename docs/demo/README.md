# Demo assets — W1·I

Stage material for the Platanus Build Night pitch. Two HTML sheets a human
reads under time pressure, and this file, which is the agent-readable index
(P18: format follows audience).

| File | Audience | What it is |
|---|---|---|
| [`run-sheet.html`](run-sheet.html) | presenter, on stage | pre-flight checklist, the three beats with timings and literal commands, the volunteer-repo picker, the RCS substrate table, the fallback ladder, the human-only tasks |
| [`objections.html`](objections.html) | presenter, during Q&A | seven cards, one question each, answerable in one breath, plus the numbers panel |

Both open from `file://` and issue **zero external requests**. They inline
`skills/keel/design/tokens.css` and `keel.css` verbatim into a single `<style>`
block, plus a stage-only `rs-*` layer that arranges `.k-*` components and adds
no palette of its own. That directory is canonical: this unit **consumes** the
design system and never edits it.

To re-sync after a design change: replace the two marked blocks in each file's
`<style>` with the current contents of `tokens.css` and `keel.css`. There is no
build step, on purpose — a stage asset that needs a toolchain to open is not a
fallback.

## What was executed, and what was not

Everything on the sheets marked "real output" was run:

- `bun scripts/gather.ts` against this repo (32 edges), `pallets/click`
  (54 edges), `sindresorhus/got` (9 edges), and an empty directory (0 edges).
- `npx skills@1.5.18 add broomva/keel --all` into a clean room — exit 0, 5.3 s
  on a warm npx cache, full directory copied to `./.agents/skills/keel`. Re-run
  from a fresh `/tmp` clean room after the review: the installer's **Security
  Risk Assessments** panel (`Gen: Med Risk` · `Socket: 0 alerts` ·
  `Snyk: High Risk`, plus a `Details:` URL) prints *before* the install summary
  on every run, and is transcribed into beat 3 with a prepared line; objections
  card 7 carries the Q&A version. The `universal:` roster inside the summary is
  truncated to terminal width (today: 5 named `+14 more`), so the sheet carries a
  placeholder there rather than a roster that will not match the screen.
- `bun scripts/classify.ts` over this repo's gathered nodes — 32 nodes, 0 decided
  by probe, 32 pending, exit 0. Re-run both with the shipped probe library and
  with `--probe-dir` pointed at an empty directory; output is identical and
  byte-for-byte what beat 2 transcribes. Both the plain and `--json` forms were
  run; the sheet shows the plain form, because `--json` is a wall of node
  objects and the beat-2 fallback prose promises the probe/agent split.
- `https://broomva.github.io/keel/` → 200. `…/keel/reports/` → **404** (W2·H
  had not shipped).
- `node -v` → `v22.14.0`, below the `skills` v1.5.19+ floor of 22.20.

Three further facts are on the sheets on the orchestrator's authority, not this
unit's execution — they come from the dogfood run recorded in
[`docs/handoffs/2026-07-24-keel-mvp-build.md`](../handoffs/2026-07-24-keel-mvp-build.md),
and each is sourced there rather than asserted here:

- **Keel's own grounding ratio, 0.421** — anchored 8 of 19 classified edges,
  `self_referential` 11, `unknown` 0, `not_a_check` 13 excluded and printed
  beside it. Run sheet beat 1 (the callout) and objections · numbers.
- **Keel's own `bun test` and `tsc --noEmit` are run by no CI workflow, so they
  gate nothing** — both downgraded `anchored` → `self_referential` by the
  adversarial reviewer. Run sheet beat 1 and objections card 6. This is the
  strongest line on either sheet and it is a finding *against* us.
- **Zero `unknown` in the fixture is a result, not a gap** — three independent
  judges converged on *inside* the write boundary for unpinned out-of-repo
  dependencies, because the resolution mechanism is itself committed
  (`Makefile:16-22` selects from four actor-writable roots). Objections card 2,
  as the concrete answer to "isn't this subjective?".

The sandbox behaviours on objections card 1 (loading runs in the child; a
`while(true)` probe is killed by the parent at ~10.0 s with all nodes falling
through to agent judgment and exit 0; a throwing probe is skipped and named; a
probe returning `unknown` is rejected at assess-time inside the child) are
likewise orchestrator-verified against W1·C, not run by this unit. The *network*
claim is deliberately still an open slot — see below.

**No timed rehearsal was performed.** Per `docs/plans/00-orchestration.md`
pre-dispatch correction #9, the timed dry runs are a human task, recorded in
the run sheet's "Human tasks" section rather than claimed as done here. Nothing
that depends on W1·A, W1·B, W1·C, W1·D, W1·G or W2·H has been executed — those
paths carry an explicit verify-before-the-pitch marker on the sheet.

## Open items the orchestrator must close

| Where | Item |
|---|---|
| run sheet · pre-flight | fallback video path (W2·I₂) |
| run sheet · pre-flight, beat 1 | corpus report URL returning 200 (W2·H) |
| run sheet · beat 1 | run both beat-1 fallbacks for real once W1·B and W2·H merge |
| run sheet · beat 2 | run beat 2 end to end; confirm a probe file appears in `~/.config/keel/probes/` |
| objections · card 1 | **the network line only.** The four kill-timer/subprocess behaviours are now stated as enforced. Network and filesystem confinement is platform-conditional (macOS `sandbox-exec` deny-default) and W1·C is correcting an overclaim there — read the final sentence W1·C ships in `probe-sandbox.ts` and say *that sentence*, not a paraphrase |
| objections · cards 2, 4 | repeatability % and ε-audit agreement rate, or "did not run" |
| objections · numbers | corpus size, ratio range across the corpus, crystallization-curve endpoints |
| run sheet · beat-close | which closing sentence — present tense only if W2·F shipped **and ran**; the weaker "that ships next" line is on the sheet verbatim and was correct at the time of writing |

Every one of these is a visible `[TODO]` block on the page, not a silent gap.

## Notes for whoever edits these

- **Claim only what shipped.** In a pitch about grounding, an overclaim is
  self-refuting. Card 1 is written so that a weaker sandbox outcome needs a
  deletion, not a correction — the network claim is a separate, clearly-marked
  slot precisely so it can be deleted without touching the four lines that hold.
- **Present tense is a claim.** Anything not yet shipped gets an `rs-todo` with
  the exact weaker sentence to say instead, written out in full. The beat-close
  ε-audit line is the reference example: closing a pitch about ungrounded
  assertions with an ungrounded assertion is the one unrecoverable failure here.
- **No verdict hues as chrome.** The four class colors are data; the stage
  layer uses the accent and the ink ramp only. A green fallback panel would
  read as a verdict.
- **No check glyphs**, including in quoted CLI output — the run sheet
  transcribes the `skills` install summary without the check mark the CLI
  prints, and says so on the page.
- Both pages print. Rung 5 of the fallback ladder is a paper run sheet.
