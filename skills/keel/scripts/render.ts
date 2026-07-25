#!/usr/bin/env bun
/**
 * Keel — report renderer.
 *
 *   bun scripts/render.ts <report.json> [-o out.html] [--curve reports/curve.svg]
 *
 * One `report.json` in, one self-contained HTML file out: inline styles, inline
 * marks, zero external requests. It has to open from `file://` and survive
 * being emailed, so nothing here may reference a CDN, a webfont, or an image
 * host — the artifact's argument is that it depends on nothing, and an artifact
 * that fetches a stylesheet to make that argument has already lost it.
 *
 * WHAT THIS FILE IS ALLOWED TO DO. It locates, loads, and renders. It contains
 * no judgment: no map from a check name to a `GroundingClass`, no heuristic
 * that promotes a node, no default class. Every class shown here was decided
 * upstream by a probe or an agent and arrives in the report. The one number
 * this file computes is the ratio, and it computes it by calling the frozen
 * schema's `groundingRatio` over the report's own verdicts — then prints a
 * disclosure if that disagrees with the ratio the report carried, rather than
 * trusting a field the producer could have written by hand.
 *
 * THE FOUR REFUSALS, all of them load-bearing:
 *   - a ratio never renders alone (absolute anchored count, coverage by kind,
 *     and the raw counts sit beside it, always),
 *   - `not_a_check` prints beside the fraction, never inside it,
 *   - zero gathered nodes renders "nothing gathered", never 0.00,
 *   - an empty denominator renders "no denominator", never 0.00.
 * The last two matter most: 0.00 reads as a measurement, and neither of those
 * states measured anything.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { GroundingClass, Node, Report, Verdict } from '../schemas/keel.ts';
import { coverageByKind, groundingRatio } from '../schemas/keel.ts';

// ---------------------------------------------------------------------------
// Constants that encode a ruling, each with the ruling attached.
// ---------------------------------------------------------------------------

/**
 * An `anchored` verdict asserted below this confidence is flagged.
 *
 * The design system's prose says 0.5; the orchestrator raised it to 0.6 on the
 * evidence that a real, adversarially-reviewed run bottoms out at exactly 0.50,
 * so a strict `< 0.5` test can never fire on honest data — a smell detector
 * that cannot fire is decoration. The threshold is printed in the artifact
 * rather than left implicit here, because a reader cannot audit a number they
 * cannot see.
 */
const SMELL_THRESHOLD = 0.6;

/** Schema order. Rendering order for sections, counts, the meter and the legend. */
const CLASS_ORDER: GroundingClass[] = [
  'anchored',
  'self_referential',
  'unknown',
  'not_a_check',
];

/** Classes inside the denominator. `not_a_check` is deliberately absent. */
const DENOMINATOR_CLASSES: GroundingClass[] = [
  'anchored',
  'self_referential',
  'unknown',
];

const CLASS_NOTE: Record<GroundingClass, string> = {
  anchored:
    'The producer sits outside the write boundary of the actor being verified.',
  self_referential:
    'The producer sits inside the write boundary of the actor being verified.',
  unknown:
    'The fork point could not be established. Fails closed — counts against the ratio exactly like self_referential.',
  not_a_check:
    'Asserts nothing about correctness, so it is excluded from the denominator. This is the one shoppable class: mis-filing a real check here shrinks the denominator and inflates the score, so each row carries the same burden of argument as any other verdict.',
};

/**
 * Off-origin document references. This is the acceptance assertion, executed
 * on our own output before it is written: content may legitimately *mention* a
 * URL (a gathered `raw` snippet routinely does), but the DOCUMENT must fetch
 * nothing. Matching on fetch-shaped markup rather than on the substring
 * "https://" is the difference between a real check and one that fires on the
 * data it is measuring.
 *
 * `@import` is matched as an at-RULE (`@import url(` / `@import "`), not as the
 * word: `tokens.css` explains in a comment why the system is one file and not
 * five "behind an @import entry point", and a check that fires on that sentence
 * is measuring its own prose. This renderer's entire subject is checks that
 * read something other than what they claim to read, so the distinction is not
 * a convenience.
 */
const EXTERNAL_REF =
  /<script[^>]+\bsrc\s*=|<link[^>]+\bhref\s*=|@import\s+(?:url\(|["'])|<img[^>]+\bsrc\s*=\s*["']https?:/i;

/** The same question asked of an SVG fragment we did not write. */
const SVG_EXTERNAL_REF =
  /<script\b|<image\b|xlink:href\s*=\s*["']https?:|\bhref\s*=\s*["']https?:|@import\s+(?:url\(|["'])|url\(\s*["']?https?:/i;

// ---------------------------------------------------------------------------
// Template engine — substitution only, on purpose.
// ---------------------------------------------------------------------------

type Slots = Record<string, string>;

export type Template = Record<string, string>;

const BLOCK =
  /<!--@block\s+([a-zA-Z0-9_-]+)\s*-->\n?([\s\S]*?)<!--@endblock\s*-->/g;

export function parseTemplate(text: string): Template {
  const blocks: Template = {};
  for (const m of text.matchAll(BLOCK)) blocks[m[1] as string] = m[2] as string;
  return blocks;
}

export function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Fill a block. `{{{RAW}}}` is inserted verbatim (already-rendered markup);
 * `{{SLOT}}` is HTML-escaped. An unfilled slot throws — a `{{NAME}}` shipped
 * into the artifact is a silent defect, and this renderer's whole subject is
 * silent defects.
 *
 * The completeness check runs over the TEMPLATE, before substitution, never
 * over the result. A gathered snippet legitimately contains `${{ ... }}` (every
 * GitHub Actions expression does, and the fixture carries one), so scanning the
 * filled output for a leftover slot would fail on the target's text rather than
 * on our own defect — a check reading something other than what it claims to
 * read, which is the thing this tool exists to name.
 */
function fill(block: string, slots: Slots): string {
  for (const [, raw, esc_] of block.matchAll(/\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g)) {
    const key = raw ?? esc_;
    if (key !== undefined && !(key in slots)) {
      throw new Error(`unfilled template slot {{${key}}}`);
    }
  }
  // ONE pass. Two chained replaces would rescan the text the first pass
  // inserted, so a gathered snippet containing `{{something}}` would be read as
  // a slot in the template that carried it.
  return block.replace(
    /\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g,
    (_, raw: string | undefined, escaped: string) =>
      raw !== undefined ? (slots[raw] as string) : esc(slots[escaped] as string),
  );
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const num = (n: number): string => n.toLocaleString('en-US');

function duration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return `${ms} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : (part / whole) * 100;
}

const plural = (n: number, one: string, many: string): string =>
  `${num(n)} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export interface RenderOptions {
  /** Inlined verbatim at the `<!-- KEEL:CURVE -->` marker when present. */
  curveSvg?: string;
  /** Shown when a curve was found but refused for referencing something off-origin. */
  curveRejectedPath?: string;
  /** Overrides the on-disk template + stylesheets (tests). */
  template?: Template;
  styles?: string;
}

function isGroundingClass(value: string): value is GroundingClass {
  return (CLASS_ORDER as string[]).includes(value);
}

function smellsOf(v: Verdict): boolean {
  return v.class === 'anchored' && v.confidence < SMELL_THRESHOLD;
}

export function render(report: Report, opts: RenderOptions = {}): string {
  const t = opts.template ?? loadTemplate();
  const styles = opts.styles ?? loadStyles();

  const nodes: Node[] = report.nodes ?? [];
  const verdicts: Verdict[] = report.verdicts ?? [];
  const byNode = new Map(verdicts.map((v) => [v.nodeId, v]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Recomputed from the verdicts rather than read off `report.grounding`. The
  // stated field is a claim by the producer; the recomputation is a signal the
  // producer cannot write to, which is the whole thesis applied to ourselves.
  const g = groundingRatio(verdicts);
  const denominator = g.anchored + g.selfReferential + g.unknown;

  const body: string[] = [];
  const disclosures: string[] = [];

  body.push(
    fill(t.header as string, {
      TARGET: report.target,
      REVISION: report.revision,
      GENERATED: report.generatedAt,
    }),
  );

  // ── The headline, and the two states that are not one ────────────────────
  const coverage = coverageByKind(nodes);
  const coverageBlock = fill(t.coverage as string, {
    ROWS: Object.entries(coverage)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([kind, n]) =>
        fill(t['coverage-row'] as string, { KIND: kind, N: num(n) }),
      )
      .join(''),
    JUDGED: num(nodes.length),
  });

  if (nodes.length === 0 && verdicts.length === 0) {
    body.push(t['nothing-gathered'] as string);
  } else if (denominator === 0) {
    body.push(
      `<div class="kr-split">${fill(t['no-denominator'] as string, {
        JUDGED: num(verdicts.length),
      })}${coverageBlock}</div>`,
    );
  } else {
    const meter = DENOMINATOR_CLASSES.map((c) =>
      fill(t['meter-seg'] as string, {
        CLASS: c,
        WIDTH: pct(countOf(g, c), denominator).toFixed(4),
      }),
    ).join('');

    const counts =
      DENOMINATOR_CLASSES.map((c) =>
        fill(t.count as string, { CLASS: c, N: num(countOf(g, c)) }),
      ).join('') +
      fill(t['count-excluded'] as string, { N: num(g.notACheck) });

    const ratioBlock = fill(t.ratio as string, {
      VALUE: g.ratio.toFixed(2),
      ANCHORED: num(g.anchored),
      DENOMINATOR: num(denominator),
      METER: meter,
      COUNTS: counts,
    });
    body.push(`<div class="kr-split">${ratioBlock}${coverageBlock}</div>`);
  }

  // ── Disclosures: every place a number is narrower than it looks ──────────
  const econ = report.economics;
  if (econ && econ.nodesSampled !== econ.nodesTotal) {
    const skipped = econ.nodesTotal - econ.nodesSampled;
    disclosures.push(
      `This run judged <span class="k-mono">${num(econ.nodesSampled)}</span> of ` +
        `<span class="k-mono">${num(econ.nodesTotal)}</span> gathered edges. ` +
        `Every number on this page describes that sample, not the whole surface — ` +
        `${plural(skipped, 'gathered edge is', 'gathered edges are')} absent from all of it. ` +
        `A cap is disclosed rather than smoothed: an undisclosed sample is how a ratio gets shopped.`,
    );
  }
  if (econ && nodes.length !== econ.nodesSampled) {
    disclosures.push(
      `The report carries <span class="k-mono">${num(nodes.length)}</span> node(s) but ` +
        `economics reports <span class="k-mono">${num(econ.nodesSampled)}</span> sampled. ` +
        `The graph and coverage below describe the nodes actually present.`,
    );
  }
  const unjudged = nodes.filter((n) => !byNode.has(n.id));
  if (unjudged.length > 0) {
    disclosures.push(
      `${plural(unjudged.length, 'node carries', 'nodes carry')} no verdict. ` +
        `They are drawn unfilled in the graph and excluded from every count — ` +
        `absence of a verdict is not <span class="k-mono">anchored</span>, and it is not ` +
        `<span class="k-mono">unknown</span> either, because nobody looked.`,
    );
  }
  const orphans = verdicts.filter((v) => !nodeById.has(v.nodeId));
  if (orphans.length > 0) {
    disclosures.push(
      `${plural(orphans.length, 'verdict names a node', 'verdicts name nodes')} ` +
        `that is not in this report. The verdict is still listed below, with its ` +
        `node id in place of a source.`,
    );
  }
  const stated = report.grounding;
  if (
    stated &&
    (stated.anchored !== g.anchored ||
      stated.selfReferential !== g.selfReferential ||
      stated.unknown !== g.unknown ||
      stated.notACheck !== g.notACheck)
  ) {
    disclosures.push(
      `The ratio shown is recomputed from the verdicts in this report and ` +
        `disagrees with the <span class="k-mono">grounding</span> block the report carried ` +
        `(<span class="k-mono">${num(stated.anchored)}/${num(stated.selfReferential)}/${num(stated.unknown)}/${num(stated.notACheck)}</span> ` +
        `stated versus <span class="k-mono">${num(g.anchored)}/${num(g.selfReferential)}/${num(g.unknown)}/${num(g.notACheck)}</span> ` +
        `counted). The counted figure is shown, because a stated total is a claim by ` +
        `the thing being measured.`,
    );
  }
  for (const text of disclosures) {
    body.push(fill(t.disclosure as string, { TEXT: text }));
  }

  body.push(t.scope as string);

  // ── Node graph ───────────────────────────────────────────────────────────
  if (nodes.length > 0) {
    const marks = nodes
      .map((n) => {
        const v = byNode.get(n.id);
        if (!v) {
          return fill(t['mark-unjudged'] as string, {
            TITLE: `${n.name} — ${n.source} — no verdict recorded`,
          });
        }
        return fill(t.mark as string, {
          CLASS: v.class,
          SMELL: smellsOf(v) ? ' data-smell' : '',
          TITLE: `${n.name} — ${n.source} — ${v.class} (confidence ${v.confidence})`,
        });
      })
      .join('');

    const legend =
      CLASS_ORDER.filter((c) => countOf(g, c) > 0)
        .map((c) =>
          fill(t['legend-item'] as string, { CLASS: c, N: num(countOf(g, c)) }),
        )
        .join('') +
      (unjudged.length > 0
        ? fill(t['legend-item-unjudged'] as string, { N: num(unjudged.length) })
        : '');

    const smellCount = verdicts.filter(smellsOf).length;
    body.push(
      fill(t.graph as string, {
        COUNT: num(nodes.length),
        MARKS: marks,
        LEGEND: legend,
        SMELL_NOTE:
          smellCount > 0
            ? `${plural(smellCount, 'mark is', 'marks are')} ringed in the unknown hue: an anchored verdict asserted below confidence ${SMELL_THRESHOLD}. The ring says the claim is closer to unknown than its colour suggests. Hover a mark for its node.`
            : `No anchored verdict falls below confidence ${SMELL_THRESHOLD}. Hover a mark for its node.`,
      }),
    );
  }

  // ── Verdicts, grouped by class, argument first ───────────────────────────
  const order = new Map(nodes.map((n, i) => [n.id, i]));
  const sorted = [...verdicts].sort(
    (a, b) =>
      (order.get(a.nodeId) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b.nodeId) ?? Number.MAX_SAFE_INTEGER),
  );

  for (const c of CLASS_ORDER) {
    const rows = sorted.filter((v) => v.class === c);
    if (rows.length === 0) continue;
    body.push(
      fill(t['verdict-section'] as string, {
        LABEL: c,
        N: num(rows.length),
        NOTE: CLASS_NOTE[c],
        VERDICTS: rows.map((v) => renderVerdict(t, v, nodeById)).join(''),
      }),
    );
  }

  const unrecognized = sorted.filter((v) => !isGroundingClass(v.class));
  if (unrecognized.length > 0) {
    body.push(
      fill(t['verdict-section'] as string, {
        LABEL: 'not a GroundingClass',
        N: num(unrecognized.length),
        NOTE: 'These verdicts carry a class the frozen schema does not define. They render unstyled on purpose: an unrecognised class must look wrong rather than default to something plausible.',
        VERDICTS: unrecognized
          .map((v) => renderVerdict(t, v, nodeById))
          .join(''),
      }),
    );
  }

  // ── Curve insertion point ────────────────────────────────────────────────
  let curveInner = '';
  if (opts.curveSvg) {
    curveInner = fill(t.curve as string, { SVG: opts.curveSvg });
  } else if (opts.curveRejectedPath) {
    curveInner = fill(t['curve-rejected'] as string, {
      PATH: opts.curveRejectedPath,
    });
  }
  body.push(fill(t['curve-slot'] as string, { CURVE: curveInner }));

  // ── Economics ────────────────────────────────────────────────────────────
  if (econ) body.push(renderEconomics(t, econ));

  const html = fill(t.document as string, {
    TITLE: `Keel — grounding report — ${report.target}`,
    STYLES: `${styles}\n\n/* ── renderer-local layout (kr-*), tokens only ── */\n${t['layout-css'] as string}`,
    BODY: body.join('\n'),
  });

  // Executed, not asserted: the invariant is checked against the bytes about to
  // be written, so a regression fails the run instead of shipping quietly.
  const offending = html.match(EXTERNAL_REF);
  if (offending) {
    throw new Error(
      `refusing to write: output contains an off-origin document reference (${offending[0]})`,
    );
  }
  return html;
}

function countOf(
  g: ReturnType<typeof groundingRatio>,
  c: GroundingClass,
): number {
  switch (c) {
    case 'anchored':
      return g.anchored;
    case 'self_referential':
      return g.selfReferential;
    case 'unknown':
      return g.unknown;
    case 'not_a_check':
      return g.notACheck;
  }
}

function renderVerdict(
  t: Template,
  v: Verdict,
  nodeById: Map<string, Node>,
): string {
  const node = nodeById.get(v.nodeId);
  const wb = v.writeBoundary;
  const actor =
    wb?.actorCanWrite === true
      ? 'yes'
      : wb?.actorCanWrite === false
        ? 'no'
        : 'not established';

  const evidence = (v.evidence ?? []).length
    ? (v.evidence as string[])
        .map((e) => fill(t['evidence-item'] as string, { TEXT: e }))
        .join('')
    : (t['evidence-empty'] as string);

  // A verdict that arrived without its causal path is rendered through the
  // defect variant, which OMITS `.k-argument` entirely. Emitting an empty
  // paragraph would satisfy `keel.css`'s `:not(:has(.k-argument))` selector and
  // silence the defect banner — a renderer quietly papering over a missing
  // argument is the unaccountable green check, produced by the tool that exists
  // to name it. No placeholder text either: inventing prose here would be worse
  // than a blank, because it would read as an argument someone made.
  const argument = wb?.argument?.trim() ?? '';
  const block = argument ? (t.verdict as string) : (t['verdict-defect'] as string);

  return fill(block, {
    NAME: node ? node.name : v.nodeId,
    CLASS: v.class,
    SMELL: smellsOf(v) ? ' data-smell' : '',
    SOURCE: node ? node.source : `${v.nodeId} (node not in report)`,
    KIND: node ? node.kind : 'unknown kind',
    ARGUMENT: argument,
    PRODUCER: wb?.producer ?? 'not recorded',
    ACTOR_CAN_WRITE: actor,
    EVIDENCE: evidence,
    DECIDED_BY: v.decidedBy,
    PROBE: v.probeId
      ? fill(t['probe-id'] as string, { ID: v.probeId })
      : '',
    CONFIDENCE: String(v.confidence),
    SMELL_NOTE: smellsOf(v)
      ? fill(t['smell-note'] as string, { THRESHOLD: String(SMELL_THRESHOLD) })
      : '',
  });
}

function renderEconomics(t: Template, e: Report['economics']): string {
  const stat = (VALUE: string, LABEL: string) =>
    fill(t['econ-stat'] as string, { VALUE, LABEL });

  const decisions = e.decidedByProbe + e.decidedByAgent;
  const tokenLabel = e.tokensEstimated ? 'estimated tokens' : 'tokens';

  const stats = [
    stat(num(e.decidedByProbe), 'decided by probe'),
    stat(num(e.decidedByAgent), 'decided by agent'),
    stat(
      decisions === 0 ? 'n/a' : `${pct(e.decidedByProbe, decisions).toFixed(0)}%`,
      'probe-decided share',
    ),
    stat(`${num(e.nodesSampled)} / ${num(e.nodesTotal)}`, 'nodes judged / gathered'),
    stat(num(e.tokensIn), `${tokenLabel} in`),
    stat(num(e.tokensOut), `${tokenLabel} out`),
    stat(duration(e.wallClockMs), 'wall clock'),
    stat(num(e.probesMinted), 'probes minted'),
    stat(num(e.probeLibrarySize), 'probe library size'),
  ].join('');

  const notes: string[] = [];
  if (e.tokensEstimated) {
    notes.push(
      'Token counts are estimated, and labelled so: a skill running inside an agent session has no API for its own usage, so the figure is ceil(chars/4) over the judgment payloads and responses. Wall clock and probe-decided share are measured directly.',
    );
  }
  if (e.nodesSampled !== e.nodesTotal) {
    notes.push(
      `${num(e.nodesSampled)} of ${num(e.nodesTotal)} gathered edges were judged — the cap is printed here and beside the ratio, never applied silently.`,
    );
  }
  if (e.probeLibrarySize === 0) {
    notes.push(
      'The probe library is empty, so every decision on this run cost a model call. That is the left-hand end of the crystallization curve, not a defect.',
    );
  }

  return fill(t.econ as string, { STATS: stats, NOTE: notes.join(' ') });
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

const HERE = import.meta.dir;

export function loadTemplate(path = join(HERE, '..', 'templates', 'report.html')): Template {
  const blocks = parseTemplate(readFileSync(path, 'utf8'));
  const required = ['document', 'header', 'ratio', 'verdict', 'scope', 'econ'];
  const missing = required.filter((b) => !(b in blocks));
  if (missing.length > 0) {
    throw new Error(`${path}: template is missing block(s): ${missing.join(', ')}`);
  }
  return blocks;
}

/**
 * Both stylesheets, verbatim, in one string. They are written to be inlined —
 * no `@import`, no webfont, no external reference — which is the only reason
 * the zero-external-request invariant is reachable at all.
 */
export function loadStyles(dir = join(HERE, '..', 'design')): string {
  const tokens = readFileSync(join(dir, 'tokens.css'), 'utf8');
  const keel = readFileSync(join(dir, 'keel.css'), 'utf8');
  return `${tokens}\n${keel}`;
}

/** Read a curve fragment, refusing it if inlining would break the invariant. */
export function loadCurve(
  path: string,
): { svg: string } | { rejected: string } | null {
  if (!existsSync(path)) return null;
  const svg = readFileSync(path, 'utf8');
  if (SVG_EXTERNAL_REF.test(svg)) return { rejected: path };
  return { svg };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `usage: bun scripts/render.ts <report.json> [-o <out.html>] [--curve <curve.svg>] [--no-curve]

  <report.json>   a Report (see schemas/keel.ts)
  -o, --out       write here instead of stdout
  --curve         inline this SVG fragment at the KEEL:CURVE marker
  --no-curve      do not look for reports/curve.svg

With no --curve, reports/curve.svg is used if it exists (relative to the
current directory, then to the repo root). The KEEL:CURVE marker is emitted
either way.`;

function main(argv: string[]): number {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    console.log(USAGE);
    return args.length === 0 ? 1 : 0;
  }

  let input = '';
  let out = '';
  let curvePath = '';
  let noCurve = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === '-o' || a === '--out') out = args[++i] as string;
    else if (a === '--curve') curvePath = args[++i] as string;
    else if (a === '--no-curve') noCurve = true;
    else if (a.startsWith('-')) {
      console.error(`render: unknown flag ${a}\n\n${USAGE}`);
      return 1;
    } else input = a;
  }

  if (!input) {
    console.error(`render: no report given\n\n${USAGE}`);
    return 1;
  }
  if (!existsSync(input)) {
    console.error(`render: ${input}: no such file`);
    return 1;
  }

  let report: Report;
  try {
    report = JSON.parse(readFileSync(input, 'utf8')) as Report;
  } catch (err) {
    console.error(`render: ${input}: not valid JSON — ${(err as Error).message}`);
    return 1;
  }
  if (!Array.isArray(report.nodes) || !Array.isArray(report.verdicts)) {
    console.error(
      `render: ${input}: not a Report — \`nodes\` and \`verdicts\` must both be arrays`,
    );
    return 1;
  }

  const opts: RenderOptions = {};
  if (!noCurve) {
    const candidates = curvePath
      ? [curvePath]
      : [resolve('reports/curve.svg'), resolve(HERE, '../../../reports/curve.svg')];
    for (const c of candidates) {
      const found = loadCurve(c);
      if (!found) continue;
      if ('svg' in found) {
        opts.curveSvg = found.svg;
      } else {
        opts.curveRejectedPath = found.rejected;
        console.error(
          `render: ${found.rejected} references something off-origin — not inlined`,
        );
      }
      break;
    }
    if (curvePath && !opts.curveSvg && !opts.curveRejectedPath) {
      console.error(`render: ${curvePath}: no such file — rendering the marker alone`);
    }
  }

  let html: string;
  try {
    html = render(report, opts);
  } catch (err) {
    console.error(`render: ${(err as Error).message}`);
    return 1;
  }

  if (out) {
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(out, html);
    const g = groundingRatio(report.verdicts);
    const denom = g.anchored + g.selfReferential + g.unknown;
    console.error(
      `wrote ${out} — ${report.nodes.length} node(s), ` +
        (denom === 0
          ? 'no denominator'
          : `ratio ${g.ratio.toFixed(2)} (${g.anchored}/${denom} anchored)`) +
        `, ${g.notACheck} not_a_check excluded`,
    );
  } else {
    console.log(html);
  }
  return 0;
}

if (import.meta.main) process.exit(main(process.argv));
