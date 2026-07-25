#!/usr/bin/env bun
/**
 * Keel — the crystallization curve.
 *
 * The grounding ratio is the product. The curve is the *claim*: that judgment
 * crystallizes into probes, and that cost per node therefore falls as the
 * library accumulates. It is a claim about ORDER, so this script is useless
 * without a recorded run order — and it must be equally willing to publish a
 * flat curve, because a flat curve is a real finding about probe generality.
 *
 * WHAT THIS SCRIPT DOES: locate run reports, resolve their order, arithmetic,
 * render. It makes no classification decisions and contains no map from any
 * property of a node to a GroundingClass. It only ever *reads* grounding
 * numbers that some other stage produced.
 *
 * Usage:
 *   bun scripts/curve.ts <dir> [options]
 *
 *   -o, --out <file>        curve JSON output           (default reports/curve.json)
 *       --svg <file>        SVG fragment output         (default: --out with .svg)
 *       --shuffled <dir>    a re-run of the SAME targets in a different order.
 *                           Without one, the ratio half of the shuffle check is
 *                           VACUOUS and says so. A corpus can also declare its
 *                           re-run in corpus.meta.json ("shuffledRerun": "...").
 *       --no-shuffled       ignore a declared re-run.
 *       --flat-band <f>     |normalized slope| below this reads "flat" (0.15)
 *       --cost-band <f>     median per-target cost delta at or above which the
 *                           curve counts as order-dependent (0.15)
 *       --ratio-tol <f>     per-target ratio delta tolerated under shuffle (0.05)
 *       --seed <n>          permutation seed (20260724)
 *       --perms <n>         permutation iterations (400)
 *       --assert-shuffle    exit 1 unless the EMPIRICAL shuffle check passes
 *                           both directions. Without a re-run this exits 1 too:
 *                           an unrunnable check is not a passing check.
 *       --quiet             suppress the human summary
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  type GroundingRatio,
  type Report,
  coverageByKind,
  groundingRatio,
} from '../schemas/keel.ts';

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** Declared provenance. Never inferred from a path — inference is how a
 *  synthetic fixture ends up on a slide labelled as a measurement. */
export interface CorpusMeta {
  label?: string;
  synthetic?: boolean;
  note?: string;
  /** relative path to a re-run of the same targets in a different order */
  shuffledRerun?: string;
}

export interface CurvePoint {
  index: number;
  file: string;
  target: string;
  revision: string;
  generatedAt: string;
  /** 'measured' | 'nothing gathered' | 'nothing judged' */
  status: string;
  nodesTotal: number;
  nodesSampled: number;
  /** true when a cap sampled the gathered nodes. Surfaced, never smoothed. */
  capped: boolean;
  decidedByProbe: number;
  decidedByAgent: number;
  probesMinted: number;
  probeLibrarySize: number;
  tokensIn: number;
  tokensOut: number;
  tokensEstimated: boolean;
  wallClockMs: number;
  /** null whenever there is nothing to divide by. Never 0-as-a-stand-in. */
  estTokensPerNode: number | null;
  secondsPerNode: number | null;
  probeDecidedShare: number | null;
  /** the ratio never travels alone: full counts + coverage ride with it */
  grounding: GroundingRatio;
  anchored: number;
  coverageByKind: Record<string, number>;
}

export type TrendVerdict = 'falls' | 'flat' | 'rises' | 'insufficient-data';

export interface Trend {
  series: string;
  label: string;
  unit: string;
  runs: number;
  usable: number;
  mean: number | null;
  slopePerRun: number | null;
  /** total fitted change across the sequence, as a fraction of the mean */
  normalizedSlope: number | null;
  flatBand: number;
  verdict: TrendVerdict;
  /** raw first/last usable values — the fit never travels without them */
  firstValue: number | null;
  lastValue: number | null;
  fit: { x0: number; y0: number; x1: number; y1: number } | null;
  note: string;
}

export interface ShuffleCheck {
  permutation: {
    ran: boolean;
    iterations: number;
    seed: number;
    baselineNormalizedSlope: number | null;
    medianAbsDelta: number | null;
    fractionMaterial: number | null;
    threshold: number;
    curveChanged: boolean | null;
    caveat: string;
  };
  empirical: {
    ran: boolean;
    reason: string;
    baselineDir: string | null;
    shuffledDir: string | null;
    matchedTargets: number;
    unmatched: string[];
    perTarget: {
      target: string;
      baselineIndex: number;
      shuffledIndex: number;
      baselineTokensPerNode: number | null;
      shuffledTokensPerNode: number | null;
      relativeCostDelta: number | null;
      baselineRatio: number;
      shuffledRatio: number;
      ratioDelta: number;
    }[];
    medianRelativeCostDelta: number | null;
    maxRelativeCostDelta: number | null;
    costBand: number;
    curveOrderDependent: boolean | null;
    maxRatioDelta: number | null;
    ratioTolerance: number;
    ratiosStable: boolean | null;
  };
  findings: string[];
  /** true only when the EMPIRICAL check passed both directions */
  passesBothDirections: boolean | null;
  summary: string;
}

export interface CurveReport {
  schema: 'keel.curve/1';
  generatedAt: string;
  source: {
    dir: string;
    reportFiles: number;
    skippedFiles: string[];
    provenance: 'synthetic' | 'measured' | 'undeclared';
    label: string;
    note: string;
    orderSource: 'manifest' | 'generatedAt' | 'none';
    orderNote: string;
  };
  runOrder: { index: number; file: string; target: string }[];
  totals: {
    runs: number;
    runsWithNodes: number;
    nodesGathered: number;
    nodesJudged: number;
    anchored: number;
    tokensEstimatedInAllRuns: boolean;
  };
  disclosures: string[];
  points: CurvePoint[];
  trends: Record<string, Trend>;
  shuffleCheck: ShuffleCheck;
}

// ---------------------------------------------------------------------------
// Small numerics
// ---------------------------------------------------------------------------

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Ordinary least squares over (index, value). Returns null when undefined. */
function ols(pts: { x: number; y: number }[]): { slope: number; intercept: number } | null {
  if (pts.length < 2) return null;
  const mx = mean(pts.map((p) => p.x));
  const my = mean(pts.map((p) => p.y));
  if (mx === null || my === null) return null;
  let sxx = 0;
  let sxy = 0;
  for (const p of pts) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

/** Deterministic PRNG. Seeded so a shuffle check is reproducible by a reviewer. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const a = out[i];
    const b = out[j];
    out[i] = b;
    out[j] = a;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

const NON_REPORT_FILES = new Set(['order.json', 'corpus.meta.json']);

function looksLikeReport(v: unknown): v is Report {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.target === 'string' &&
    typeof o.economics === 'object' &&
    o.economics !== null &&
    typeof o.grounding === 'object' &&
    o.grounding !== null &&
    Array.isArray(o.nodes)
  );
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

interface LoadedCorpus {
  dir: string;
  meta: CorpusMeta | null;
  reports: { file: string; report: Report }[];
  skipped: string[];
  orderSource: 'manifest' | 'generatedAt' | 'none';
  orderNote: string;
  disclosures: string[];
}

async function loadCorpus(dir: string): Promise<LoadedCorpus> {
  const disclosures: string[] = [];
  const skipped: string[] = [];

  if (!existsSync(dir)) {
    throw new Error(`no such directory: ${dir}`);
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const jsonFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.json') && !NON_REPORT_FILES.has(e.name))
    .map((e) => e.name)
    .sort();

  let meta: CorpusMeta | null = null;
  const metaPath = join(dir, 'corpus.meta.json');
  if (existsSync(metaPath)) {
    const raw = await readJson(metaPath);
    if (typeof raw === 'object' && raw !== null) meta = raw as CorpusMeta;
  }

  const loaded: { file: string; report: Report }[] = [];
  for (const name of jsonFiles) {
    let raw: unknown;
    try {
      raw = await readJson(join(dir, name));
    } catch (err) {
      skipped.push(`${name} (unparseable: ${(err as Error).message})`);
      continue;
    }
    if (!looksLikeReport(raw)) {
      // Mechanical shape test, not a judgment: a file without economics +
      // grounding + nodes is simply not a run report (curve.json and
      // corpus-summary.json both land here).
      skipped.push(`${name} (not a Report: missing target/economics/grounding/nodes)`);
      continue;
    }
    loaded.push({ file: name, report: raw });
  }

  // ---- order resolution. The curve is a function of ordering, so where the
  // order came from is part of the result, not an implementation detail.
  let orderSource: 'manifest' | 'generatedAt' | 'none' = 'none';
  let orderNote = 'no runs';
  let ordered = loaded;

  const manifestPath = join(dir, 'order.json');
  if (loaded.length > 0 && existsSync(manifestPath)) {
    const rawOrder = await readJson(manifestPath);
    const names: string[] = Array.isArray(rawOrder)
      ? (rawOrder as string[])
      : Array.isArray((rawOrder as { order?: unknown }).order)
        ? ((rawOrder as { order: string[] }).order)
        : [];
    if (names.length === 0) {
      disclosures.push(
        `order.json present in ${dir} but declared no order; fell back to generatedAt.`,
      );
    } else {
      const byName = new Map(loaded.map((l) => [l.file, l]));
      const picked: typeof loaded = [];
      for (const n of names) {
        const hit = byName.get(n);
        if (hit) {
          picked.push(hit);
          byName.delete(n);
        } else {
          disclosures.push(`order.json lists "${n}", which is not present in ${dir}.`);
        }
      }
      const leftovers = [...byName.values()].sort((a, b) =>
        a.report.generatedAt.localeCompare(b.report.generatedAt),
      );
      if (leftovers.length > 0) {
        disclosures.push(
          `${leftovers.length} run report(s) absent from order.json were appended in generatedAt order: ${leftovers
            .map((l) => l.file)
            .join(', ')}.`,
        );
      }
      ordered = [...picked, ...leftovers];
      orderSource = 'manifest';
      orderNote = `run order declared in ${join(dir, 'order.json')}`;
    }
  }

  if (orderSource === 'none' && loaded.length > 0) {
    ordered = [...loaded].sort((a, b) => {
      const c = a.report.generatedAt.localeCompare(b.report.generatedAt);
      return c !== 0 ? c : a.file.localeCompare(b.file);
    });
    orderSource = 'generatedAt';
    orderNote =
      'run order derived from Report.generatedAt (ascending, filename as tiebreak) — no order.json manifest present';
  }

  if (skipped.length > 0) {
    disclosures.push(`Skipped ${skipped.length} non-report file(s): ${skipped.join('; ')}.`);
  }

  return { dir, meta, reports: ordered, skipped, orderSource, orderNote, disclosures };
}

// ---------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------

function toPoints(corpus: LoadedCorpus, disclosures: string[]): CurvePoint[] {
  return corpus.reports.map(({ file, report }, index) => {
    const e = report.economics;
    const judged = e.nodesSampled;
    const gathered = e.nodesTotal;
    const decided = e.decidedByProbe + e.decidedByAgent;

    const status =
      gathered === 0 ? 'nothing gathered' : judged === 0 ? 'nothing judged' : 'measured';

    if (status === 'nothing gathered') {
      disclosures.push(
        `Run ${index} (${report.target}) gathered nothing — plotted as "nothing gathered", excluded from every trend fit.`,
      );
    } else if (status === 'nothing judged') {
      disclosures.push(
        `Run ${index} (${report.target}) gathered ${gathered} node(s) and judged none — excluded from every trend fit.`,
      );
    } else if (judged !== gathered) {
      disclosures.push(
        `Run ${index} (${report.target}) judged ${judged} of ${gathered} gathered nodes — a cap. Per-node cost below is per JUDGED node.`,
      );
    }

    if (decided !== judged && judged > 0) {
      disclosures.push(
        `Run ${index} (${report.target}): decidedByProbe + decidedByAgent = ${decided} but nodesSampled = ${judged}. Probe-decided share uses the decided total (${decided}).`,
      );
    }

    // Cross-check the published grounding block against the verdicts that are
    // actually in the file. We do not repair it — we say so.
    if (Array.isArray(report.verdicts) && report.verdicts.length > 0) {
      const recomputed = groundingRatio(report.verdicts);
      const g = report.grounding;
      if (
        recomputed.anchored !== g.anchored ||
        recomputed.selfReferential !== g.selfReferential ||
        recomputed.unknown !== g.unknown ||
        recomputed.notACheck !== g.notACheck
      ) {
        disclosures.push(
          `Run ${index} (${report.target}): the report's grounding block disagrees with its own verdicts (published a=${g.anchored}/s=${g.selfReferential}/u=${g.unknown}/n=${g.notACheck}, verdicts give a=${recomputed.anchored}/s=${recomputed.selfReferential}/u=${recomputed.unknown}/n=${recomputed.notACheck}). Published values are used as-is.`,
        );
      }
    }

    return {
      index,
      file,
      target: report.target,
      revision: report.revision,
      generatedAt: report.generatedAt,
      status,
      nodesTotal: gathered,
      nodesSampled: judged,
      capped: judged !== gathered,
      decidedByProbe: e.decidedByProbe,
      decidedByAgent: e.decidedByAgent,
      probesMinted: e.probesMinted,
      probeLibrarySize: e.probeLibrarySize,
      tokensIn: e.tokensIn,
      tokensOut: e.tokensOut,
      tokensEstimated: e.tokensEstimated,
      wallClockMs: e.wallClockMs,
      estTokensPerNode: judged > 0 ? (e.tokensIn + e.tokensOut) / judged : null,
      secondsPerNode: judged > 0 ? e.wallClockMs / 1000 / judged : null,
      probeDecidedShare: decided > 0 ? e.decidedByProbe / decided : null,
      grounding: report.grounding,
      anchored: report.grounding.anchored,
      coverageByKind: coverageByKind(report.nodes),
    };
  });
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

interface SeriesSpec {
  key: string;
  label: string;
  unit: string;
  pick: (p: CurvePoint) => number | null;
  fmt: (n: number) => string;
  domain?: [number, number];
}

const SERIES: SeriesSpec[] = [
  {
    key: 'estTokensPerNode',
    label: 'estimated tokens per node',
    unit: 'estimated tokens / judged node',
    pick: (p) => p.estTokensPerNode,
    fmt: (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0)),
  },
  {
    key: 'secondsPerNode',
    label: 'seconds per node',
    unit: 'measured s / judged node',
    pick: (p) => p.secondsPerNode,
    fmt: (n) => n.toFixed(1),
  },
  {
    key: 'probeDecidedShare',
    label: 'probe-decided share',
    unit: 'measured share of decided nodes',
    pick: (p) => p.probeDecidedShare,
    fmt: (n) => n.toFixed(2),
    domain: [0, 1],
  },
  {
    key: 'probeLibrarySize',
    label: 'probe library size',
    unit: 'measured probes in library',
    pick: (p) => p.probeLibrarySize,
    fmt: (n) => n.toFixed(0),
  },
];

function trendFor(spec: SeriesSpec, points: CurvePoint[], flatBand: number): Trend {
  const usable = points
    .filter((p) => spec.pick(p) !== null)
    .map((p) => ({ x: p.index, y: spec.pick(p) as number }));

  const base: Trend = {
    series: spec.key,
    label: spec.label,
    unit: spec.unit,
    runs: points.length,
    usable: usable.length,
    mean: null,
    slopePerRun: null,
    normalizedSlope: null,
    flatBand,
    verdict: 'insufficient-data',
    firstValue: usable.length > 0 ? usable[0].y : null,
    lastValue: usable.length > 0 ? usable[usable.length - 1].y : null,
    fit: null,
    note: '',
  };

  if (usable.length < 3) {
    base.note = `only ${usable.length} usable point(s) of ${points.length} run(s) — no trend is claimed`;
    base.mean = mean(usable.map((u) => u.y));
    return base;
  }

  const m = mean(usable.map((u) => u.y));
  const fit = ols(usable);
  base.mean = m;

  if (fit === null || m === null || m === 0) {
    base.note = 'trend undefined (degenerate x-range or zero mean) — raw points only';
    return base;
  }

  const x0 = usable[0].x;
  const x1 = usable[usable.length - 1].x;
  const normalized = (fit.slope * (x1 - x0)) / m;

  base.slopePerRun = fit.slope;
  base.normalizedSlope = normalized;
  base.fit = {
    x0,
    y0: fit.intercept + fit.slope * x0,
    x1,
    y1: fit.intercept + fit.slope * x1,
  };
  base.verdict =
    normalized <= -flatBand ? 'falls' : normalized >= flatBand ? 'rises' : 'flat';

  const pct = `${(normalized * 100).toFixed(1)}%`;
  base.note =
    base.verdict === 'flat'
      ? `does NOT fall — total fitted change ${pct} of the mean, inside the +/-${(flatBand * 100).toFixed(0)}% flat band across ${usable.length} runs`
      : `${base.verdict} — total fitted change ${pct} of the mean across ${usable.length} runs`;

  return base;
}

// ---------------------------------------------------------------------------
// Shuffle check — both directions
// ---------------------------------------------------------------------------

interface ShuffleOpts {
  seed: number;
  perms: number;
  flatBand: number;
  costBand: number;
  ratioTol: number;
  permThreshold: number;
}

function permutationCheck(
  points: CurvePoint[],
  baselineNormalizedSlope: number | null,
  opts: ShuffleOpts,
): ShuffleCheck['permutation'] {
  const caveat =
    'A permutation reorders ALREADY-RECORDED runs; it cannot reproduce what a genuine re-run in a different order would have cost, because the probe library would have accumulated differently. It is a sanity signal on order-dependence, never a substitute for the empirical re-run.';

  const values = points
    .filter((p) => p.estTokensPerNode !== null)
    .map((p) => p.estTokensPerNode as number);

  if (values.length < 3 || baselineNormalizedSlope === null) {
    return {
      ran: false,
      iterations: 0,
      seed: opts.seed,
      baselineNormalizedSlope,
      medianAbsDelta: null,
      fractionMaterial: null,
      threshold: opts.permThreshold,
      curveChanged: null,
      caveat,
    };
  }

  const m = mean(values);
  const rnd = lcg(opts.seed);
  const deltas: number[] = [];
  for (let k = 0; k < opts.perms; k++) {
    const permuted = shuffle(values, rnd);
    const fit = ols(permuted.map((y, x) => ({ x, y })));
    if (fit === null || m === null || m === 0) continue;
    const ns = (fit.slope * (permuted.length - 1)) / m;
    deltas.push(Math.abs(ns - baselineNormalizedSlope));
  }

  const med = median(deltas);
  const frac =
    deltas.length === 0
      ? null
      : deltas.filter((d) => d >= opts.permThreshold).length / deltas.length;

  return {
    ran: true,
    iterations: deltas.length,
    seed: opts.seed,
    baselineNormalizedSlope,
    medianAbsDelta: med,
    fractionMaterial: frac,
    threshold: opts.permThreshold,
    curveChanged: med === null ? null : med >= opts.permThreshold,
    caveat,
  };
}

function empiricalCheck(
  baseline: CurvePoint[],
  baselineDir: string,
  shuffled: CurvePoint[] | null,
  shuffledDir: string | null,
  reason: string,
  opts: ShuffleOpts,
): ShuffleCheck['empirical'] {
  const empty: ShuffleCheck['empirical'] = {
    ran: false,
    reason,
    baselineDir,
    shuffledDir,
    matchedTargets: 0,
    unmatched: [],
    perTarget: [],
    medianRelativeCostDelta: null,
    maxRelativeCostDelta: null,
    costBand: opts.costBand,
    curveOrderDependent: null,
    maxRatioDelta: null,
    ratioTolerance: opts.ratioTol,
    ratiosStable: null,
  };

  if (shuffled === null) return empty;

  const byTarget = new Map(shuffled.map((p) => [p.target, p]));
  const rows: ShuffleCheck['empirical']['perTarget'] = [];
  const unmatched: string[] = [];

  for (const b of baseline) {
    const s = byTarget.get(b.target);
    if (!s) {
      unmatched.push(`${b.target} (in baseline, absent from re-run)`);
      continue;
    }
    byTarget.delete(b.target);
    const bt = b.estTokensPerNode;
    const st = s.estTokensPerNode;
    const rel = bt !== null && st !== null && bt !== 0 ? Math.abs(st - bt) / bt : null;
    rows.push({
      target: b.target,
      baselineIndex: b.index,
      shuffledIndex: s.index,
      baselineTokensPerNode: bt,
      shuffledTokensPerNode: st,
      relativeCostDelta: rel,
      baselineRatio: b.grounding.ratio,
      shuffledRatio: s.grounding.ratio,
      ratioDelta: Math.abs(s.grounding.ratio - b.grounding.ratio),
    });
  }
  for (const leftover of byTarget.values()) {
    unmatched.push(`${leftover.target} (in re-run, absent from baseline)`);
  }

  if (rows.length === 0) {
    return { ...empty, ran: false, reason: 'no target appears in both orderings', unmatched };
  }

  const costDeltas = rows
    .map((r) => r.relativeCostDelta)
    .filter((d): d is number => d !== null);
  const ratioDeltas = rows.map((r) => r.ratioDelta);
  const medCost = median(costDeltas);
  const maxCost = costDeltas.length > 0 ? Math.max(...costDeltas) : null;
  const maxRatio = Math.max(...ratioDeltas);

  return {
    ran: true,
    reason: 'compared against a declared re-run of the same targets in a different order',
    baselineDir,
    shuffledDir,
    matchedTargets: rows.length,
    unmatched,
    perTarget: rows,
    medianRelativeCostDelta: medCost,
    maxRelativeCostDelta: maxCost,
    costBand: opts.costBand,
    curveOrderDependent: medCost === null ? null : medCost >= opts.costBand,
    maxRatioDelta: maxRatio,
    ratioTolerance: opts.ratioTol,
    ratiosStable: maxRatio <= opts.ratioTol,
  };
}

function assembleShuffle(
  permutation: ShuffleCheck['permutation'],
  empirical: ShuffleCheck['empirical'],
): ShuffleCheck {
  const findings: string[] = [];

  if (!empirical.ran) {
    findings.push(
      `Ratio stability under shuffle was NOT checked: ${empirical.reason}. Permuting recorded runs cannot move a per-target ratio, so the permutation result below says nothing about it. Supply a re-run with --shuffled <dir>.`,
    );
  } else {
    if (empirical.ratiosStable === false) {
      const worst = [...empirical.perTarget].sort((a, b) => b.ratioDelta - a.ratioDelta)[0];
      findings.push(
        `FINDING — ratios moved under a re-ordered re-run. Max |delta ratio| = ${empirical.maxRatioDelta?.toFixed(3)} over ${empirical.matchedTargets} target(s), tolerance ${empirical.ratioTolerance}. Worst: ${worst.target} ${worst.baselineRatio.toFixed(3)} -> ${worst.shuffledRatio.toFixed(3)}. Order-dependent COST is the thesis; order-dependent VERDICTS are a probe-generality bug.`,
      );
    }
    if (empirical.curveOrderDependent === false) {
      findings.push(
        `FINDING — per-target cost did not move materially under a re-ordered re-run (median relative delta ${empirical.medianRelativeCostDelta?.toFixed(3)}, band ${empirical.costBand}). That is evidence AGAINST order-dependent accumulation, i.e. against crystallization doing work on this corpus.`,
      );
    }
    if (empirical.unmatched.length > 0) {
      findings.push(
        `${empirical.unmatched.length} target(s) could not be matched across orderings: ${empirical.unmatched.join('; ')}.`,
      );
    }
  }

  if (permutation.ran && permutation.curveChanged === false) {
    findings.push(
      `Permuting run order barely changes the fitted curve (median |delta normalized slope| ${permutation.medianAbsDelta?.toFixed(3)} < ${permutation.threshold}). Consistent with a flat curve: no order-dependent accumulation to detect.`,
    );
  }

  const passes =
    empirical.ran && empirical.curveOrderDependent !== null && empirical.ratiosStable !== null
      ? empirical.curveOrderDependent && empirical.ratiosStable
      : null;

  const summary =
    passes === null
      ? 'shuffle check INCOMPLETE — the curve direction ran, the ratio direction did not'
      : passes
        ? `shuffle check passes both directions — curve moves (median per-target cost delta ${empirical.medianRelativeCostDelta?.toFixed(3)} >= ${empirical.costBand}), ratios hold (max |delta| ${empirical.maxRatioDelta?.toFixed(3)} <= ${empirical.ratioTolerance})`
        : 'shuffle check does NOT pass both directions — see findings';

  return { permutation, empirical, findings, passesBothDirections: passes, summary };
}

// ---------------------------------------------------------------------------
// SVG — a standalone, self-contained fragment. Zero external requests.
// Colours come from skills/keel/design/tokens.css: `var(--k-*, <literal>)` so
// the fragment picks up the report's tokens when render.ts inlines it at
// <!-- KEEL:CURVE --> and still renders correctly opened on its own.
// ---------------------------------------------------------------------------

const W = 1080;
const PAD = 32;
const PANEL_W = (W - PAD * 2 - 32) / 2; // two columns, 32px gutter
const PANEL_H = 208;
const PLOT_L = 64;
const PLOT_R = 16;
const PLOT_T = 46;
const PLOT_B = 30;

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur.length === 0) cur = w;
    else if (cur.length + 1 + w.length <= maxChars) cur = `${cur} ${w}`;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur.length > 0) lines.push(cur);
  return lines;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const step of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (v <= step * mag) return step * mag;
  }
  return 10 * mag;
}

function panelSvg(
  spec: SeriesSpec,
  trend: Trend,
  points: CurvePoint[],
  x: number,
  y: number,
  accent: boolean,
): string {
  const vals = points.map((p) => spec.pick(p));
  const present = vals.filter((v): v is number => v !== null);
  const domain: [number, number] = spec.domain ?? [0, niceMax(present.length ? Math.max(...present) : 1)];
  const [dMin, dMax] = domain;
  const span = dMax - dMin || 1;

  const px0 = x + PLOT_L;
  const px1 = x + PANEL_W - PLOT_R;
  const py0 = y + PLOT_T;
  const py1 = y + PANEL_H - PLOT_B;

  const n = points.length;
  const sx = (i: number) => (n <= 1 ? (px0 + px1) / 2 : px0 + ((px1 - px0) * i) / (n - 1));
  const sy = (v: number) => py1 - ((v - dMin) / span) * (py1 - py0);

  const cls = accent ? 'kc-accent' : 'kc-series';
  const parts: string[] = [];

  parts.push(
    `<rect class="kc-panel" x="${x}" y="${y}" width="${PANEL_W}" height="${PANEL_H}" rx="6"/>`,
  );
  parts.push(
    `<text class="kc-panel-title" x="${x + 14}" y="${y + 22}">${esc(spec.label)}</text>`,
  );
  parts.push(`<text class="kc-axis" x="${x + 14}" y="${y + 37}">${esc(spec.unit)}</text>`);

  // A fixed domain (the 0..1 share panel) formats cleanly with the series
  // formatter; a derived one can land on a half-step that the compact
  // formatter would round into a lie ("2" printed on a gridline at 1.5).
  const tickFmt = spec.domain
    ? spec.fmt
    : (n: number) =>
        Number.isInteger(n) ? spec.fmt(n) : Math.abs(n) < 10 ? n.toFixed(1) : spec.fmt(n);

  // gridlines + y labels at 0, mid, max
  for (const frac of [0, 0.5, 1]) {
    const v = dMin + span * frac;
    const yy = sy(v);
    parts.push(`<line class="kc-grid" x1="${px0}" y1="${yy.toFixed(1)}" x2="${px1}" y2="${yy.toFixed(1)}"/>`);
    parts.push(
      `<text class="kc-tick kc-tick--y" x="${px0 - 8}" y="${(yy + 3.5).toFixed(1)}">${esc(tickFmt(v))}</text>`,
    );
  }

  // fitted trend — dashed, and never alone
  if (trend.fit) {
    const f = trend.fit;
    parts.push(
      `<line class="kc-fit ${cls}" x1="${sx(f.x0).toFixed(1)}" y1="${sy(f.y0).toFixed(1)}" x2="${sx(f.x1).toFixed(1)}" y2="${sy(f.y1).toFixed(1)}"/>`,
    );
  }

  // raw polyline over consecutive present values
  let run: string[] = [];
  const flushRun = () => {
    if (run.length >= 2) parts.push(`<polyline class="kc-line ${cls}" points="${run.join(' ')}"/>`);
    run = [];
  };
  points.forEach((p, i) => {
    const v = spec.pick(p);
    if (v === null) {
      flushRun();
      return;
    }
    run.push(`${sx(i).toFixed(1)},${sy(v).toFixed(1)}`);
  });
  flushRun();

  // raw points — SQUARES. A circle in a verification UI reads as a status dot,
  // and the status dot is the thing being audited (design/README.md).
  points.forEach((p, i) => {
    const v = spec.pick(p);
    const xx = sx(i);
    if (v === null) {
      // A run with nothing to divide by is a GAP, never a zero. Marked with a
      // rule and rotated so the label cannot overrun the axis labels.
      const midY = (py0 + py1) / 2;
      parts.push(
        `<line class="kc-gapline" x1="${xx.toFixed(1)}" y1="${py0.toFixed(1)}" x2="${xx.toFixed(1)}" y2="${py1.toFixed(1)}"/>`,
      );
      parts.push(
        `<text class="kc-gap" transform="rotate(-90 ${xx.toFixed(1)} ${midY.toFixed(1)})" x="${xx.toFixed(1)}" y="${(midY + 11).toFixed(1)}">${esc(p.status)}</text>`,
      );
      return;
    }
    const yy = sy(v);
    parts.push(
      `<rect class="kc-pt ${cls}" x="${(xx - 3.5).toFixed(1)}" y="${(yy - 3.5).toFixed(1)}" width="7" height="7" rx="2"><title>${esc(
        `run ${i} · ${p.target} · ${spec.label} = ${spec.fmt(v)}${p.capped ? ` · judged ${p.nodesSampled} of ${p.nodesTotal} gathered` : ''}`,
      )}</title></rect>`,
    );
  });

  // x ticks
  points.forEach((p, i) => {
    parts.push(
      `<text class="kc-tick" x="${sx(i).toFixed(1)}" y="${py1 + 16}">${i}${p.capped ? '*' : ''}</text>`,
    );
  });

  return parts.join('\n');
}

function renderSvg(c: CurveReport): string {
  const body: string[] = [];
  let y = PAD;

  const hasRuns = c.points.length > 0;

  // ---- header
  body.push(`<text class="kc-eyebrow" x="${PAD}" y="${y + 12}">CRYSTALLIZATION CURVE</text>`);
  y += 34;
  const headline = hasRuns
    ? `${c.totals.runs} sequential runs · ${c.totals.nodesJudged} nodes judged of ${c.totals.nodesGathered} gathered · ${c.totals.anchored} anchored`
    : 'nothing gathered';
  body.push(`<text class="kc-h1" x="${PAD}" y="${y}">${esc(headline)}</text>`);
  y += 22;
  const prov =
    c.source.provenance === 'synthetic'
      ? `SYNTHETIC FIXTURE DATA — ${c.source.label}. Not a corpus measurement.`
      : c.source.provenance === 'measured'
        ? `${c.source.label} — measured corpus`
        : `provenance UNDECLARED for ${c.source.dir} (no corpus.meta.json) — do not present this as measured`;
  body.push(
    `<text class="kc-warn" x="${PAD}" y="${y}">${esc(prov)}</text>`,
  );
  y += 26;

  if (!hasRuns) {
    for (const line of wrap(
      `No run reports in ${c.source.dir}. Nothing gathered — there is no ratio and no curve to show. ${c.source.note}`,
      110,
    )) {
      body.push(`<text class="kc-note" x="${PAD}" y="${y}">${esc(line)}</text>`);
      y += 17;
    }
  } else {
    // ---- panels (2 x 2)
    const trendKeys = SERIES.map((s) => s.key);
    for (let i = 0; i < SERIES.length; i++) {
      const spec = SERIES[i];
      const col = i % 2;
      const row = Math.floor(i / 2);
      const px = PAD + col * (PANEL_W + 32);
      const py = y + row * (PANEL_H + 20);
      body.push(panelSvg(spec, c.trends[spec.key], c.points, px, py, i === 0));
    }
    y += Math.ceil(SERIES.length / 2) * (PANEL_H + 20) + 6;

    // ---- axis + mark legend
    const cappedRuns = c.points.filter((p) => p.capped).map((p) => p.index);
    const legend = `x axis: run index in the recorded corpus order (listed below). Squares are the raw per-run values; the dashed line is an ordinary-least-squares fit and is never shown without them.${
      cappedRuns.length > 0
        ? ` * on run ${cappedRuns.join(', ')} = judged fewer nodes than gathered; per-node values are per JUDGED node.`
        : ''
    }`;
    for (const line of wrap(legend, 128)) {
      body.push(`<text class="kc-axis" x="${PAD}" y="${y}">${esc(line)}</text>`);
      y += 15;
    }
    y += 12;

    // ---- coverage, so the numbers never travel alone
    const coverage: Record<string, number> = {};
    for (const p of c.points) {
      for (const [k, v] of Object.entries(p.coverageByKind)) coverage[k] = (coverage[k] ?? 0) + v;
    }
    const covLine = Object.entries(coverage)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ');
    body.push(`<text class="kc-h2" x="${PAD}" y="${y}">Coverage (judged)</text>`);
    y += 20;
    for (const line of wrap(
      covLine.length > 0 ? covLine : 'no judged nodes to report coverage over',
      128,
    )) {
      body.push(`<text class="kc-mono" x="${PAD}" y="${y}">${esc(line)}</text>`);
      y += 16;
    }
    y += 12;

    // ---- trend verdicts, in words
    body.push(`<text class="kc-h2" x="${PAD}" y="${y}">Trend</text>`);
    y += 20;
    for (const key of trendKeys) {
      const t = c.trends[key];
      const raw =
        t.firstValue !== null && t.lastValue !== null
          ? ` raw first ${SERIES.find((s) => s.key === key)?.fmt(t.firstValue)} -> last ${SERIES.find((s) => s.key === key)?.fmt(t.lastValue)}.`
          : '';
      for (const line of wrap(`${t.label}: ${t.note}.${raw}`, 128)) {
        body.push(`<text class="kc-note" x="${PAD}" y="${y}">${esc(line)}</text>`);
        y += 16;
      }
    }
    y += 12;

    // ---- run order, shown because the curve is a function of it
    body.push(`<text class="kc-h2" x="${PAD}" y="${y}">Run order</text>`);
    y += 20;
    for (const line of wrap(c.source.orderNote, 128)) {
      body.push(`<text class="kc-note" x="${PAD}" y="${y}">${esc(line)}</text>`);
      y += 16;
    }
    const orderLine = c.runOrder.map((r) => `${r.index} ${r.target}`).join('  ->  ');
    for (const line of wrap(orderLine, 112)) {
      body.push(`<text class="kc-mono" x="${PAD}" y="${y}">${esc(line)}</text>`);
      y += 16;
    }
    y += 12;

    // ---- shuffle check
    body.push(`<text class="kc-h2" x="${PAD}" y="${y}">Shuffle check</text>`);
    y += 20;
    for (const line of wrap(c.shuffleCheck.summary, 128)) {
      body.push(`<text class="kc-note" x="${PAD}" y="${y}">${esc(line)}</text>`);
      y += 16;
    }
    const perm = c.shuffleCheck.permutation;
    if (perm.ran) {
      for (const line of wrap(
        `Permutation (${perm.iterations} draws, seed ${perm.seed}): median |delta normalized slope| ${perm.medianAbsDelta?.toFixed(3)}, ${((perm.fractionMaterial ?? 0) * 100).toFixed(0)}% of draws move it by >= ${perm.threshold}. ${perm.caveat}`,
        128,
      )) {
        body.push(`<text class="kc-note" x="${PAD}" y="${y}">${esc(line)}</text>`);
        y += 16;
      }
    }
    for (const f of c.shuffleCheck.findings) {
      for (const line of wrap(f, 128)) {
        body.push(`<text class="kc-warn" x="${PAD}" y="${y}">${esc(line)}</text>`);
        y += 16;
      }
    }
    y += 12;

    // ---- disclosures
    if (c.disclosures.length > 0) {
      body.push(`<text class="kc-h2" x="${PAD}" y="${y}">Disclosures</text>`);
      y += 20;
      for (const d of c.disclosures) {
        for (const line of wrap(`- ${d}`, 128)) {
          body.push(`<text class="kc-note" x="${PAD}" y="${y}">${esc(line)}</text>`);
          y += 16;
        }
      }
      y += 12;
    }
  }

  // ---- scope note, verbatim
  body.push(`<line class="kc-rule" x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}"/>`);
  y += 18;
  for (const line of wrap(
    'Scope. Keel measures the shape of verification, not its quality. A repo can be 100% anchored with terrible tests. Anchoring says the signal comes from outside; it does not say the signal is sufficient.',
    128,
  )) {
    body.push(`<text class="kc-scope" x="${PAD}" y="${y}">${esc(line)}</text>`);
    y += 16;
  }
  y += 12;

  const H = Math.ceil(y);

  const style = `
.keel-curve { font-family: var(--k-font-sans, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif); }
.keel-curve text { fill: var(--k-ink-1, #b6c0cb); font-size: 12.5px; }
.keel-curve .kc-bg { fill: var(--k-bg-0, #07090c); }
.keel-curve .kc-panel { fill: var(--k-bg-1, #0c1015); stroke: var(--k-line, #1b2027); stroke-width: 1; }
.keel-curve .kc-eyebrow { fill: var(--k-ink-2, #8b97a5); font-size: 11px; letter-spacing: 0.18em; }
.keel-curve .kc-h1 { fill: var(--k-ink-0, #e8edf2); font-size: 19px; letter-spacing: -0.01em; }
.keel-curve .kc-h2 { fill: var(--k-ink-0, #e8edf2); font-size: 15px; letter-spacing: -0.01em; }
.keel-curve .kc-panel-title { fill: var(--k-ink-0, #e8edf2); font-size: 14px; }
.keel-curve .kc-axis { fill: var(--k-ink-2, #8b97a5); font-size: 11px; }
.keel-curve .kc-note { fill: var(--k-ink-1, #b6c0cb); font-size: 12.5px; }
.keel-curve .kc-scope { fill: var(--k-ink-2, #8b97a5); font-size: 12.5px; }
.keel-curve .kc-warn { fill: var(--k-unknown, #fbbf24); font-size: 12.5px; }
.keel-curve .kc-mono { fill: var(--k-ink-1, #b6c0cb); font-size: 12.5px; font-family: var(--k-font-mono, ui-monospace, "SF Mono", SFMono-Regular, Menlo, "Cascadia Mono", Consolas, monospace); }
.keel-curve .kc-tick { fill: var(--k-ink-2, #8b97a5); font-size: 11px; text-anchor: middle; font-variant-numeric: tabular-nums; }
.keel-curve .kc-tick--y { text-anchor: end; }
.keel-curve .kc-gap { fill: var(--k-ink-2, #8b97a5); font-size: 11px; text-anchor: middle; }
.keel-curve .kc-gapline { stroke: var(--k-ink-3, #5b6774); stroke-width: 1; stroke-dasharray: 2 4; }
.keel-curve .kc-grid { stroke: var(--k-line, #1b2027); stroke-width: 1; }
.keel-curve .kc-rule { stroke: var(--k-line, #1b2027); stroke-width: 1; }
.keel-curve .kc-line { fill: none; stroke-width: 1.5; }
.keel-curve .kc-fit { stroke-width: 1.5; stroke-dasharray: 5 4; opacity: 0.7; }
.keel-curve .kc-pt { stroke: none; }
.keel-curve .kc-accent { stroke: var(--k-accent, #7dd3fc); fill: var(--k-accent, #7dd3fc); }
.keel-curve .kc-accent.kc-line, .keel-curve .kc-accent.kc-fit { fill: none; }
.keel-curve .kc-series { stroke: var(--k-ink-1, #b6c0cb); fill: var(--k-ink-1, #b6c0cb); }
.keel-curve .kc-series.kc-line, .keel-curve .kc-series.kc-fit { fill: none; }
`.trim();

  const desc = hasRuns
    ? `Crystallization curve over ${c.totals.runs} runs from ${c.source.dir}. ${c.trends.estTokensPerNode?.note ?? ''}`
    : `No run reports in ${c.source.dir}; nothing gathered.`;

  return [
    `<svg class="keel-curve" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="keel-curve-title keel-curve-desc" style="max-width:100%;height:auto">`,
    `<title id="keel-curve-title">Keel crystallization curve</title>`,
    `<desc id="keel-curve-desc">${esc(desc)}</desc>`,
    `<style>${style}</style>`,
    `<rect class="kc-bg" x="0" y="0" width="${W}" height="${H}"/>`,
    body.join('\n'),
    '</svg>',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface Args {
  dir: string;
  out: string;
  svg: string;
  shuffled: string | null;
  noShuffled: boolean;
  flatBand: number;
  costBand: number;
  ratioTol: number;
  permThreshold: number;
  seed: number;
  perms: number;
  assertShuffle: boolean;
  quiet: boolean;
}

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseArgs(argv: string[]): Args {
  let dir = '';
  let out = 'reports/curve.json';
  let svg = '';
  let shuffled: string | null = null;
  let noShuffled = false;
  let flatBand = 0.15;
  let costBand = 0.15;
  let ratioTol = 0.05;
  let permThreshold = 0.15;
  let seed = 20260724;
  let perms = 400;
  let assertShuffle = false;
  let quiet = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-o':
      case '--out':
        out = argv[++i] ?? out;
        break;
      case '--svg':
        svg = argv[++i] ?? svg;
        break;
      case '--shuffled':
        shuffled = argv[++i] ?? null;
        break;
      case '--no-shuffled':
        noShuffled = true;
        break;
      case '--flat-band':
        flatBand = num(argv[++i], flatBand);
        break;
      case '--cost-band':
        costBand = num(argv[++i], costBand);
        break;
      case '--ratio-tol':
        ratioTol = num(argv[++i], ratioTol);
        break;
      case '--perm-threshold':
        permThreshold = num(argv[++i], permThreshold);
        break;
      case '--seed':
        seed = num(argv[++i], seed);
        break;
      case '--perms':
        perms = num(argv[++i], perms);
        break;
      case '--assert-shuffle':
        assertShuffle = true;
        break;
      case '--quiet':
        quiet = true;
        break;
      default:
        if (a.startsWith('-')) throw new Error(`unknown option: ${a}`);
        if (dir === '') dir = a;
        else throw new Error(`unexpected extra argument: ${a}`);
    }
  }

  if (dir === '') throw new Error('usage: bun scripts/curve.ts <dir> [-o out.json] [--svg out.svg]');
  if (svg === '') svg = out.endsWith('.json') ? `${out.slice(0, -5)}.svg` : `${out}.svg`;

  return {
    dir,
    out,
    svg,
    shuffled,
    noShuffled,
    flatBand,
    costBand,
    ratioTol,
    permThreshold,
    seed,
    perms,
    assertShuffle,
    quiet,
  };
}

export async function buildCurve(args: Args): Promise<CurveReport> {
  const dir = resolve(args.dir);
  const corpus = await loadCorpus(dir);
  const disclosures = [...corpus.disclosures];
  const points = toPoints(corpus, disclosures);

  const provenance: 'synthetic' | 'measured' | 'undeclared' =
    corpus.meta?.synthetic === true
      ? 'synthetic'
      : corpus.meta?.synthetic === false
        ? 'measured'
        : 'undeclared';
  if (provenance === 'undeclared') {
    disclosures.push(
      `${dir} carries no corpus.meta.json, so its provenance is UNDECLARED. Provenance is declared, never inferred — this curve must not be presented as a measurement on that basis alone.`,
    );
  }

  const estimatedRuns = points.filter((p) => p.tokensEstimated).length;
  if (estimatedRuns > 0) {
    disclosures.push(
      `Token counts are ESTIMATES in ${estimatedRuns} of ${points.length} run(s) (RunEconomics.tokensEstimated). No API exposes session token usage to a skill, so the token axis reads "estimated tokens" and nothing here claims a measured token count.`,
    );
  }

  const trends: Record<string, Trend> = {};
  for (const spec of SERIES) trends[spec.key] = trendFor(spec, points, args.flatBand);

  // ---- shuffle check
  const opts: ShuffleOpts = {
    seed: args.seed,
    perms: args.perms,
    flatBand: args.flatBand,
    costBand: args.costBand,
    ratioTol: args.ratioTol,
    permThreshold: args.permThreshold,
  };

  const permutation = permutationCheck(
    points,
    trends.estTokensPerNode.normalizedSlope,
    opts,
  );

  let shuffledPoints: CurvePoint[] | null = null;
  let shuffledDir: string | null = null;
  let reason = 'no re-run supplied (--shuffled) and none declared in corpus.meta.json';

  if (args.noShuffled) {
    reason = '--no-shuffled was passed';
  } else {
    const declared = corpus.meta?.shuffledRerun;
    const candidate = args.shuffled ?? (declared ? join(dir, declared) : null);
    if (candidate) {
      const resolved = resolve(candidate);
      if (!existsSync(resolved)) {
        reason = `re-run directory not found: ${resolved}`;
        disclosures.push(`Declared shuffled re-run "${candidate}" does not exist.`);
      } else {
        const other = await loadCorpus(resolved);
        const otherDisclosures: string[] = [];
        shuffledPoints = toPoints(other, otherDisclosures);
        shuffledDir = resolved;
        reason = 'compared against a declared re-run of the same targets in a different order';
        for (const d of otherDisclosures) disclosures.push(`[re-run] ${d}`);
      }
    }
  }

  const empirical = empiricalCheck(points, dir, shuffledPoints, shuffledDir, reason, opts);
  const shuffleCheck = assembleShuffle(permutation, empirical);

  return {
    schema: 'keel.curve/1',
    generatedAt: new Date().toISOString(),
    source: {
      dir,
      reportFiles: points.length,
      skippedFiles: corpus.skipped,
      provenance,
      label: corpus.meta?.label ?? '(unlabelled corpus)',
      note: corpus.meta?.note ?? '',
      orderSource: corpus.orderSource,
      orderNote: corpus.orderNote,
    },
    runOrder: points.map((p) => ({ index: p.index, file: p.file, target: p.target })),
    totals: {
      runs: points.length,
      runsWithNodes: points.filter((p) => p.nodesSampled > 0).length,
      nodesGathered: points.reduce((a, p) => a + p.nodesTotal, 0),
      nodesJudged: points.reduce((a, p) => a + p.nodesSampled, 0),
      anchored: points.reduce((a, p) => a + p.anchored, 0),
      tokensEstimatedInAllRuns: points.length > 0 && points.every((p) => p.tokensEstimated),
    },
    disclosures,
    points,
    trends,
    shuffleCheck,
  };
}

function humanSummary(c: CurveReport): string {
  const L: string[] = [];
  L.push(`curve · ${c.source.dir}`);
  L.push(`  provenance      ${c.source.provenance}${c.source.label ? ` — ${c.source.label}` : ''}`);
  L.push(`  order           ${c.source.orderSource}: ${c.source.orderNote}`);
  if (c.points.length === 0) {
    L.push('  runs            0 — nothing gathered. No ratio and no curve are reported.');
    return L.join('\n');
  }
  L.push(
    `  runs            ${c.totals.runs} · ${c.totals.nodesJudged} nodes judged of ${c.totals.nodesGathered} gathered · ${c.totals.anchored} anchored`,
  );
  L.push('  run order:');
  for (const r of c.runOrder) L.push(`    ${String(r.index).padStart(2)}  ${r.target}`);
  L.push('  trends:');
  for (const spec of SERIES) {
    const t = c.trends[spec.key];
    L.push(`    ${t.label.padEnd(26)} ${t.verdict.padEnd(18)} ${t.note}`);
  }
  L.push(`  shuffle: ${c.shuffleCheck.summary}`);
  const perm = c.shuffleCheck.permutation;
  if (perm.ran) {
    L.push(
      `    permutation   ${perm.iterations} draws, seed ${perm.seed}: median |delta normalized slope| ${perm.medianAbsDelta?.toFixed(3)}, ${((perm.fractionMaterial ?? 0) * 100).toFixed(0)}% of draws move it by >= ${perm.threshold} -> curve ${perm.curveChanged ? 'CHANGES' : 'does NOT change'} under reordering`,
    );
  }
  const emp = c.shuffleCheck.empirical;
  if (emp.ran) {
    L.push(
      `    empirical     ${emp.matchedTargets} target(s) matched across orderings: median relative cost delta ${emp.medianRelativeCostDelta?.toFixed(3)} (band ${emp.costBand}), max |delta ratio| ${emp.maxRatioDelta?.toFixed(3)} (tolerance ${emp.ratioTolerance})`,
    );
    for (const r of emp.perTarget) {
      L.push(
        `      ${r.target.padEnd(22)} idx ${r.baselineIndex}->${r.shuffledIndex}  est tok/node ${r.baselineTokensPerNode?.toFixed(0)}->${r.shuffledTokensPerNode?.toFixed(0)} (${((r.relativeCostDelta ?? 0) * 100).toFixed(0)}%)  ratio ${r.baselineRatio.toFixed(3)}->${r.shuffledRatio.toFixed(3)} (delta ${r.ratioDelta.toFixed(3)})`,
      );
    }
  }
  for (const f of c.shuffleCheck.findings) L.push(`    ! ${f}`);
  L.push('  disclosures:');
  for (const d of c.disclosures) L.push(`    - ${d}`);
  return L.join('\n');
}

async function main(): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`curve: ${(err as Error).message}`);
    return 2;
  }

  let curve: CurveReport;
  try {
    curve = await buildCurve(args);
  } catch (err) {
    console.error(`curve: ${(err as Error).message}`);
    return 2;
  }

  await mkdir(dirname(resolve(args.out)), { recursive: true });
  await writeFile(resolve(args.out), `${JSON.stringify(curve, null, 2)}\n`);
  await mkdir(dirname(resolve(args.svg)), { recursive: true });
  await writeFile(resolve(args.svg), renderSvg(curve));

  if (!args.quiet) {
    console.log(humanSummary(curve));
    console.log(`  wrote           ${resolve(args.out)}`);
    console.log(`  wrote           ${resolve(args.svg)}`);
  }

  if (args.assertShuffle) {
    if (curve.shuffleCheck.passesBothDirections !== true) {
      console.error(`curve: --assert-shuffle failed — ${curve.shuffleCheck.summary}`);
      for (const f of curve.shuffleCheck.findings) console.error(`  ! ${f}`);
      return 1;
    }
    console.log('  assert-shuffle  PASS (curve moves, ratios hold)');
  }

  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
