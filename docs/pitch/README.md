# Pitch deck

Stage material for the Platanus Build Night pitch. The deck is the artifact a
human reads; this file is the agent-readable index (P18: format follows
audience).

| File | Audience | What it is |
|---|---|---|
| [`two-minute.html`](two-minute.html) | presenter, on stage | **the 2:00 stage sheet** — five segments, the full spoken script in **ES and EN**, cued against the video's frame beats, plus cut list and fallback ladder |
| [`index.html`](index.html) | the room, on a projector | 20-slide standalone deck — problem → insight → mechanism → proof → economics → routing → real output → business model → scope |

Companion material already in the repo:

| File | Use |
|---|---|
| [`../demo/run-sheet.html`](../demo/run-sheet.html) | if the live 3-beat demo runs instead of / alongside the deck |
| [`../demo/objections.html`](../demo/objections.html) | Q&A, seven cards answerable in one breath |

## The two-minute format

Different artifact, different clock. The deck is a four-minute walk; the stage
sheet is a two-minute performance built on the **60-second cut** of the Remotion
explainer (`KeelPitch` → `video/out/keel-pitch-60.mp4`).

The structural fact the format turns on: **the video has no audio track.** It is
silent motion graphics, so the presenter is not playing a video and then
talking — the presenter talks the whole way and the video is a deck that
advances itself. Both channels run for the full sixty seconds, which is the only
reason a two-minute slot fits a ninety-second story *plus* a live demo.

| | |
|---|---|
| 0:00 | cold open, screen black — the hook |
| 0:11 | the 60s cut, narrated live |
| 1:11 | the live corpus page — 15 repos, pooled 0.853, keel first row at 0.357 |
| 1:36 | the ε-audit catching its own drift — the peak |
| 1:52 | close |

`S5` (economics) and `S6` (routing) drop out of the cut. Selection is by **whole
scene** and this is load-bearing: every scene keys its animation to absolute
frames inside its own `Sequence`, so shortening `durationInFrames` truncates that
scene's last beats mid-move. Dropping a scene only shifts the offsets after it.
See the comment on `PITCH_SCENE_IDS` in `video/src/Video.tsx`.

Re-render after a scene change:

```bash
cd video && bun install && bun run render:pitch
```

**The demo is a browser tab, not a terminal.** Zero live model calls, zero
terminal switches — which deletes the whole `npx` failure surface the four-minute
run sheet has to carry: the Node version floor, the cold npx cache, and the
`Snyk: High Risk` panel that must be narrated before anyone reads it aloud. Those
stay in [`../demo/objections.html`](../demo/objections.html) for Q&A.

**Bilingual.** The sheet ships the spoken script in Spanish and English, toggled
with `E` (or the header buttons); the default is Spanish, because the room is.
Both languages are always in the DOM, so print and a JS-less browser show both
rather than losing one. Spanish runs roughly 15–20% longer than English for the
same content — the per-beat word budgets on the sheet are counted separately for
each language, and the beats with the least headroom are marked.

**The one number hazard.** The video's S4 shows **0.421** (full-population
dogfood, 8 of 19 classified edges); the corpus page shows **0.357** for the same
repo under the 25-node cap. Both are real and both are published on purpose. The
script's standing rule is therefore *never speak a number the screen
contradicts* — the presenter says no keel figure over S4, and introduces 0.357
only while standing in front of the page that prints it. The reconciliation is
the first Q&A card on the sheet.

## Operating it

| Key | Does |
|---|---|
| `→` `↓` `space` `PgDn` | next |
| `←` `↑` `PgUp` | previous |
| `Home` / `End` | first / last |
| `N` | presenter notes (every slide carries one) |
| `O` | overview grid — click any slide to jump |
| `P` | print / export PDF |
| `?` | key help |

Click advances; a click in the left 18% goes back. Horizontal swipe works on a
phone. The URL hash carries the slide number, so `index.html#8` opens directly
on the ratio slide.

**Fallback ladder.** The deck opens from `file://` and issues **zero external
requests** — verified, there are no `src`/`href` values pointing off-machine.
If the browser dies, a PDF export is 20 pages and was rendered end to end:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --print-to-pdf=keel-pitch.pdf --no-pdf-header-footer \
  docs/pitch/index.html
```

## Design system

The `<style>` block opens with a **verbatim copy** of
`skills/keel/design/tokens.css`, between the marked fences. That directory is
canonical: this deck **consumes** the design system and never edits it. The
`dk-*` layer after the fences arranges those tokens and introduces no palette
of its own — same contract the `rs-*` stage layer follows in `docs/demo/`.

Re-sync after a design change by replacing everything between the fences:

```bash
python3 - <<'PY'
import pathlib
deck = pathlib.Path('docs/pitch/index.html'); h = deck.read_text()
tok  = pathlib.Path('skills/keel/design/tokens.css').read_text().strip()
a = h.index('/* ══════════ KEEL TOKENS — VERBATIM COPY, DO NOT EDIT HERE ══════════ */')
b = h.index('/* ══════════ END TOKENS ══════════ */')
head = h[:a].rstrip('\n')
deck.write_text(head + '\n/* ══════════ KEEL TOKENS — VERBATIM COPY, DO NOT EDIT HERE ══════════ */\n'
                + tok + '\n' + h[b:])
PY
```

Rules the deck inherits and must keep obeying:

- **No webfonts.** System stacks only.
- **Mono is quoted from the world, sans is Keel talking.** Paths, commands,
  class names, exit codes → mono. Prose and argument → sans.
- **The accent is the narrator's hue.** It never encodes a verdict, and no
  verdict color is ever used as chrome. A green panel would read as a verdict.
- **Marks are squares, not circles.** A status dot is the unaccountable green
  light Keel exists to criticize.
- **No check glyphs.**

## The number rule

Every figure on a slide is either **measured, with the run that produced it
named on the slide**, or **visibly marked illustrative**. In a pitch about
ungrounded claims an overclaim is self-refuting, so this is the invariant to
preserve when editing.

**Measured** (provenance in `docs/handoffs/2026-07-24-keel-mvp-build.md`):

| Figure | Source |
|---|---|
| grounding ratio **0.421** — anchored 8, self_referential 11, unknown 0, not_a_check 13 | dogfood run against this repo, 2026-07-24 |
| the credibility slide's finding — `bun test` / `tsc --noEmit` gated nothing | **stated in the past tense on purpose.** `.github/workflows/test.yml` now gates both on every PR, so the present-tense version became false the moment that merged. The slide carries the fix, and the ratio has **not** been re-measured since — the number moves only when Keel re-measures from the target |
| **32** edges gathered from `keel` | `bun scripts/gather.ts` |
| corpus ratios — `keel` **0.357** · `anthropic-sdk-python` **0.667** · `openai-python` **0.769** | `reports/corpus-summary.json`, 3 of 15 targets run, 25-node cap per target, pinned shas. Keel scores **last**, which is the slide's whole point |
| **54** edges from `pallets/click` · **9** from `sindresorhus/got` | ad-hoc gather runs on screened backup repos — **not corpus members**, and the moat slide now says so |
| **15** corpus targets, pinned by 40-char sha | `corpus.json`, revisions verified with `git ls-remote` |
| the report image on the output slide — **0.44 → 0.56** | `reports/keel.bindings.html`, inlined as base64 so the deck stays self-contained. It is a real route report over the stratified 15-of-32-edge sample (`tests/fixtures/report.sample.json`), sample ratio 0.444 against a 0.421 population — the slide says so, because the sample being *representative rather than flattering* is the point |

**Illustrative, and labeled as such on the slide:**

- the cost-per-node curve on the economics slide — shape only, not measured
  data. `reports/curve.json` is a synthetic fixture and is **not** the source.
- all pricing on the revenue slide. Seat figures are anchored to published
  comparables (Semgrep Team, Snyk Team); engagement and annual figures are
  estimates and no sale has validated any of them.

**The `Rakefile:24` → `.circleci/config.yml:101` example is an illustrative
shape, and the slide is labeled as such.** It appears only in prose across this
repo — no report, repo, or sha backs it, and the one Ruby corpus target
(`sinatra`) uses Actions rather than CircleCI. The *real* routing output is the
slide immediately after it, rendered from `reports/keel.bindings.html`. If the
example is ever reproduced against a named target, replace the `dk-illus`
marker with a `dk-prov` line naming the run.

**Two different keel ratios are published on purpose.** Slide 8 carries
**0.421** — the full-population dogfood over all 19 classified edges. The
corpus slide carries **0.357** — the corpus run under a 25-of-32 node cap.
Different sampling, both real, both published. Picking the flattering one is
precisely the behavior this project exists to detect, so the presenter note on
the corpus slide carries the reconciliation verbatim.

## What is deliberately not claimed

The deck states both scope limits in the product's own words rather than
letting a judge find them: Keel measures the *shape* of verification and not
its quality, and a test's *execution* is anchored while its *oracle* may not
be. Do not remove that slide to save time — pre-empting the smartest objection
in the room is worth more than the twenty seconds it costs.
