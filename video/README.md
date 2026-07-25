# Keel — explainer video

A ~90 second Remotion explainer for how the Keel skill works. Seven scenes, one
component each, 1920×1080 at 30fps.

This project lives at the repo root and **not** inside `skills/keel/` — that
directory is the packaging boundary that ships to users via
`npx skills add broomva/keel`, and it stays clean.

## Preview

```bash
cd video
bun install
bunx remotion studio
```

The studio exposes eight compositions: `KeelExplainer` (the full cut) and
`scene-s1-problem` … `scene-s7-close`, so a single scene can be re-timed without
scrubbing through the other six.

## Render

```bash
bunx remotion render KeelExplainer out/keel-explainer.mp4 --concurrency=6
```

Stills, for checking a specific beat:

```bash
bunx remotion still KeelExplainer out/stills/f1510.png --frame=1510
```

Scene frame ranges (30fps):

| Scene | Frames | Duration |
|---|---|---|
| 1 · the problem | 0–359 | 12s |
| 2 · the question | 360–659 | 10s |
| 3 · the four classes | 660–1199 | 18s |
| 4 · the ratio | 1200–1559 | 12s |
| 5 · it gets cheaper | 1560–2009 | 15s |
| 6 · routing | 2010–2459 | 15s |
| 7 · close | 2460–2699 | 8s |

## Which numbers are real

This is a pitch about ungrounded claims, so the video holds itself to the
standard it argues for. Every figure on screen is one of two kinds, and the kind
is visible in the frame.

### Measured

| Figure | Where | Source |
|---|---|---|
| grounding ratio **0.421** | scene 4 | Keel's self-measurement: `8 / (8 + 11 + 0)` |
| anchored **8** | scene 4 | same run |
| self_referential **11** | scene 4 | same run |
| unknown **0** | scene 4 | same run |
| not_a_check **13** (excluded) | scene 4 | same run |
| **32** verification edges gathered | scene 4 | same run — `8 + 11 + 0 + 13` |

Scene 4 carries a `MEASURED` chip next to the caption *keel, measuring itself*,
and prints the absolute counts and the gathered surface beside the ratio. That
pairing is required by the skill: a bare ratio rewards *deleting* checks, so the
ratio never travels alone.

> **Provenance note.** `reports/keel.json` in this repo currently records an
> earlier run — `5 / 9 / 0 / 11`, ratio `0.357`, 25 edges — from a different
> revision. The video uses the `8 / 11 / 0 / 13` figures. Both are real
> measurements of Keel at different points; before the video is published
> anywhere durable, re-run `keel measure` and reconcile the two so a viewer who
> opens `reports/keel.json` sees the same number the video showed.

### Illustrative

| Figure | Where | How it is labelled |
|---|---|---|
| the cost-per-node decay curve | scene 5 | an explicit `illustrative — shape only, not measured data` chip above the chart, dashed and unticked axes, and no numeric scale on either axis |

Keel has not published a measured cost-per-node series, so scene 5 shows a
*shape*, not a dataset. Nothing about the chart is readable as a measurement,
because nothing about it was measured.

### Neither — mechanism, not measurement

`1 model call` / `0 model calls` in scene 5 are statements about how the
algorithm works (a novel shape is judged by the agent; a crystallized shape is
decided by a probe), not counts from a run. The two routing node ids in scene 6
— `Rakefile:24 tests` and `.circleci/config.yml:101` — and their arguments are
quoted from the README's worked routing example. No file contents are
reconstructed anywhere in the video; inventing a snippet to sit under a node id
would be exactly the kind of unbacked claim this video is about.

## Design rules this project is bound by

`src/theme.ts` mirrors `site/tokens.css`, which is the canonical source. If a
token changes there, change it here — nothing in `theme.ts` is invented.

- **No webfonts.** System stacks only (`--k-font-sans`, `--k-font-mono`). The
  invariant is inherited from the report artifact, which must open from
  `file://` and issue zero external requests.
- **Mono is quoted from the world, sans is Keel talking.** File paths, commands,
  exit codes, node names, class names → mono. Prose, headings, arguments →
  sans.
- **The accent `#7dd3fc` is the narrator's hue and never encodes a verdict**,
  and no verdict color is ever used as chrome. The progress rule, the route
  arrow, the illustrative chip, and the emphasized clause in each headline are
  accent — all of them are Keel annotating, none of them are Keel scoring.
- **Elevation is a background step plus a hairline, never a shadow.** There is
  no `box-shadow` in this project.
- **No check-mark glyphs.** Verdicts are square marks — a circle in a
  verification UI reads as a status dot, and a status dot is the unaccountable
  green light Keel exists to criticize.
- **`not_a_check` never looks attractive.** Inert slate, hollow dashed mark,
  dashed rule, prose one ink step dimmer than its neighbours. It is the one
  shoppable class; it must never look like a place you want your nodes to land.

One deliberate exception worth knowing about: scene 1 renders a passing pipeline
in `--k-anchored` green. That is the *pipeline's* verdict claim rendered in the
color a verdict is rendered in — it is not chrome, and the scene's whole move is
to take it away.

## Files

```
video/
├── package.json
├── remotion.config.ts
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts          # registerRoot
    ├── Root.tsx          # compositions: full cut + one per scene
    ├── Video.tsx         # scene sequence, durations, progress rule
    ├── theme.ts          # mirror of site/tokens.css
    ├── components.tsx    # Scene shell, Mark, ClassChip, TypeOn, KeelMark, …
    └── scenes/
        ├── S1Problem.tsx
        ├── S2Question.tsx
        ├── S3Classes.tsx
        ├── S4Ratio.tsx
        ├── S5Cheaper.tsx
        ├── S6Routing.tsx
        └── S7Close.tsx
```
