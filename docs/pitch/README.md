# Pitch deck

Stage material for the Platanus Build Night pitch. The deck is the artifact a
human reads; this file is the agent-readable index (P18: format follows
audience).

| File | Audience | What it is |
|---|---|---|
| [`index.html`](index.html) | the room, on a projector | 20-slide standalone deck — problem → insight → mechanism → proof → economics → routing → real output → business model → scope |

Companion material already in the repo:

| File | Use |
|---|---|
| [`../demo/run-sheet.html`](../demo/run-sheet.html) | if the live 3-beat demo runs instead of / alongside the deck |
| [`../demo/objections.html`](../demo/objections.html) | Q&A, seven cards answerable in one breath |

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
