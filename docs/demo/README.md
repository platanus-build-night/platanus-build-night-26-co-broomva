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
- `node -v` → `v22.14.0`, below the `skills` v1.5.19+ floor of 22.20.

**Closed since the first draft** (this is what replaced the sheets' 18 TODOs):

- **Four live URLs confirmed by fetching CONTENT, not a status code**: the
  landing page, `…/keel/reports/`, `…/keel/reports/keel.html`, and
  `…/keel/reports/openai-python.bindings.html`. Each page's `<title>` was read
  back. The earlier `404` on `…/reports/` is gone; W2·H shipped.
- **Beat 2 executed end to end on `sharkdp/fd`**, a repo Keel had never
  gathered and not one of the 15 corpus names: 33 nodes in 0.08 s, clone
  4.21 s, classify 0.11 s from an empty library, 9 nodes judged in ~150 s,
  2 probes minted, re-run decided 3 nodes by probe with zero model calls (one
  of them never judged by hand). Every timing on run sheet beat 2 comes from
  that run. Not confirmed by it: that a probe lands in the *default*
  `~/.config/keel/probes/`, since it minted into an explicit `/tmp` dir. The
  sheet says so.
- **The corpus**: pooled **0.853**, 122 anchored of 143 classified edges
  across 14 measured repositories; 15 pinned, judged sequentially from an empty
  library; `anthropic-courses` gathered zero nodes and is recorded
  `nothing_gathered` with a null ratio.
- **Keel's own grounding ratio, 0.357, the lowest in its own corpus**:
  anchored 5 of 14 classified edges, `self_referential` 9, `unknown` 0,
  `not_a_check` 11 excluded and printed beside it, 25 of 32 gathered nodes
  judged. This supersedes the 0.421 the first draft carried. Run sheet beat 1
  (the callout) and objections · numbers.
- **Keel's own `bun test` and `tsc --noEmit` were run by no workflow at the
  measured revision, so they gated nothing**: both downgraded `anchored` →
  `self_referential` by the adversarial reviewer. `.github/workflows/test.yml`
  is the fix and now exists; the published 0.357 has *not* been re-run, and both
  sheets say so. Run sheet beat 1 and objections card 6. This is still the
  strongest line on either sheet and it is a finding *against* us.
- **The ε-audit mechanism was run by hand on one target and found real drift**:
  two verdicts from our own probe filed toward the shoppable class, blast radius
  checked at 13 verdicts with only those 2 wrong, both confined to the audit
  side-file so no published report carried them, probe-vs-agent 3/5 → 3/3 after
  the match was narrowed. Objections card 4 and the run sheet's close.
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
slot is now filled from the sentence `skills/keel/scripts/probe-sandbox.ts`
actually prints, quoted verbatim, together with what that file says it does
**not** enforce (read confinement, exfiltration through verdict text, CPU or
memory bounds).

**No timed rehearsal was performed.** Per `docs/plans/00-orchestration.md`
pre-dispatch correction #9, the timed dry runs are a human task, recorded in
the run sheet's "Human tasks" section rather than claimed as done here. It is
now the *only* item left open on either sheet: the paths that depended on W1·A,
W1·B, W1·C and W2·H have since been executed or confirmed, and the two that will
not happen (W2·I₂, the fallback video, and W2·F, the scheduled ε-audit) are
recorded as cuts.

## Open items, all closed

Zero `[TODO]` blocks remain on either page. Each is now either a verified fact
in an `rs-fact` block or an explicitly recorded **cut**.

| Where | Was | Now |
|---|---|---|
| run sheet · pre-flight | fallback video path (W2·I₂) | **CUT.** No recording of any beat exists. The sheet names the per-beat fallbacks that do, and rungs 4–5 are rewritten to assume no video. A 90.0 s `video/out/keel-explainer.mp4` exists on disk and is explicitly *not* this |
| run sheet · pre-flight, beat 1 | corpus report URL returning 200 | **CONFIRMED by content**: title read back from four live pages, never a status code |
| run sheet · beat 1 | run both beat-1 fallbacks for real | **CONFIRMED**: site path live and on disk; `render.ts` over the fixture yields a self-contained artifact |
| run sheet · beat 2 | run beat 2 end to end | **EXECUTED** on `sharkdp/fd`; real timings folded in, plus three risks the run surfaced (see below) |
| objections · card 1 | the network line | **FILLED** with the sentence `probe-sandbox.ts` actually prints, verbatim, plus the macOS-only enforcement list, the three things not claimed, and the P20 finding that a probe could once force its own unconfined re-run |
| objections · card 2 | repeatability % | **No number, and the reason is the answer**: zero nodes were re-judged by an agent on the one re-run, so agent agreement is undefined. The pooled 10/10 is explicitly banned from the stage |
| objections · card 4 | ε-audit agreement rate | **Scheduled audit CUT**; the mechanism ran once by hand and found real drift in our own probe. The finding replaces the rate |
| objections · numbers | corpus size, ratio range, curve endpoints | **FILLED**, including the R² of every trend and the instruction never to present the curve as smooth |
| run sheet · beat-close | which closing sentence | **DECIDED.** W2·F was cut, so "we publish the agreement rate" is unavailable; the close says the audit ran once, by hand, on one target, and caught our own probe |

Three risks the beat-2 run surfaced, now on the sheet: judgment is ~15 s/node
against 0.22 s for all plumbing (bound the depth in the prompt); the 4.21 s
clone is the only network hop and the likeliest stall; and a **known defect**,
in which a probe verdict carries the *minting* node's evidence, so a citation points
at the wrong line. The sheet tells the presenter not to read probe-decided
evidence off the projector, and what to say if someone catches it.

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
