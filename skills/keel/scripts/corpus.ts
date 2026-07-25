#!/usr/bin/env bun
/**
 * keel corpus — the stepper that produces the corpus number.
 *
 * This script does NOT classify anything. It cannot: classification is agentic
 * by construction (SKILL.md §2), and a script that assigned classes would be
 * the rule table this project exists to detect. So the corpus run is a stepper
 * with the agent in the loop:
 *
 *   bun scripts/corpus.ts next
 *       clones the next unprocessed target (shallow, at its pinned revision),
 *       gathers, optionally dispatches the probe sandbox, samples nodes,
 *       writes .keel-corpus/<name>.pending.json, PRINTS the judgment payloads
 *       and STOPS.
 *
 *   ... the agent judges the printed batches and writes
 *       .keel-corpus/<name>.verdicts.json ...
 *
 *   bun scripts/corpus.ts record <name>
 *       merges probe + agent verdicts into reports/<name>.json, updates
 *       reports/corpus-summary.json, removes the clone, advances.
 *
 *   bun scripts/corpus.ts next --repeat <name>     (and: record <name> --repeat)
 *       re-judges an already-recorded target from scratch into a SIDE file and
 *       reports verdict agreement — the empirical repeatability number.
 *
 *   bun scripts/corpus.ts status
 *
 * Three properties are load-bearing and deliberate:
 *
 *   SEQUENTIAL, ORDERED, RECORDED. Targets run one at a time in corpus.json
 *   order, and the order actually run is written into the summary. The
 *   crystallization curve measures cost falling as the probe library grows;
 *   parallel runs race on the probe directory and destroy that signal.
 *
 *   RESUME. A target with an existing reports/<name>.json is skipped. A crash
 *   at target 8 must not re-judge 1–7 — that burns tokens and corrupts the
 *   ordered probe growth.
 *
 *   NO SILENT ANYTHING. The node cap is disclosed (nodesTotal vs nodesSampled),
 *   truncated payload text says so, per-target failures are recorded rather
 *   than swallowed, and a target that yielded nothing is reported as
 *   "nothing gathered" — never as a ratio. That last one is ENFORCED, not
 *   promised: a target that gathers zero nodes gets NO reports/<name>.json at
 *   all, because a Report must carry a GroundingRatio and every value it could
 *   carry there would be a claim. Resume therefore keys off the summary entry,
 *   not off the existence of a report file.
 *
 *   PARTIAL IS NOT COMPLETE. A target where the agent judged 2 of 40 sampled
 *   nodes is recorded with partial:true and judgedFraction:0.05, and a target
 *   where the agent judged NOTHING is excluded from totals.targetsMeasured,
 *   counted under totals.targetsUnjudged, and — like the nothing-gathered case —
 *   gets no report file at all. "15 of 15 targets measured" must mean fifteen
 *   measurements happened.
 *
 *   REPEATABILITY IS ABOUT JUDGMENT. Probe verdicts are deterministic — they
 *   agree with themselves by construction — so counting them in an "independent
 *   re-judgment" number inflates it toward 1.0 as the probe library grows. The
 *   headline agreement is computed over nodes BOTH runs decided agentically;
 *   probe and mixed-provenance overlaps are reported separately and labelled.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  coverageByKind,
  groundingRatio,
  type ClassifyOutput,
  type GroundingClass,
  type Node,
  type Report,
  type RunEconomics,
  type Verdict,
} from '../schemas/keel.ts';
import { gather } from './gather.ts';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = resolve(SCRIPT_DIR, '..');

/**
 * Where this run is allowed to write clones, reports and state.
 *
 * corpus.ts lives inside the packaging boundary, so it ships to every user who
 * installs the skill — and `resolve(SKILL_DIR, '../..')` is the KEEL REPO only
 * when the skill is checked out inside it. Installed at
 * `~/.claude/skills/keel`, that expression is `~/.claude`, and the old default
 * would have shallow-cloned multi-hundred-MB repositories into a directory this
 * script does not own. So the parent is used only when it actually looks like a
 * corpus workspace (it has a corpus.json); otherwise we write under the cwd,
 * which the operator chose. If neither has a corpus file, loadCorpus dies
 * before anything is created and the message says to pass --corpus.
 *
 * This is a repo-local development tool, not a user-facing command; SKILL.md
 * deliberately does not document it.
 */
function resolveRepoRoot(): string {
  const env = process.env.KEEL_REPO_ROOT;
  if (env) return resolve(env);
  const above = resolve(SKILL_DIR, '../..');
  if (existsSync(join(above, 'corpus.json'))) return above;
  return resolve(process.cwd());
}

const REPO_ROOT = resolveRepoRoot();
const WORK_DIR = join(REPO_ROOT, '.keel-corpus');
const CLONE_ROOT = join(WORK_DIR, 'clones');
const RECORDED_DIR = join(WORK_DIR, 'recorded');
const REPORTS_DIR = join(REPO_ROOT, 'reports');
const SUMMARY_PATH = join(REPORTS_DIR, 'corpus-summary.json');

const DEFAULT_CAP = 40;
const DEFAULT_BATCH = 15;
/** printed raw is capped so one 4 kB config cannot eat a batch — disclosed inline. */
const RAW_PRINT_LIMIT = 2000;

const CLASSES: readonly GroundingClass[] = [
  'anchored',
  'self_referential',
  'unknown',
  'not_a_check',
];

// ---------------------------------------------------------------------------
// Shapes owned by this script (the schema owns Report / Verdict / RunEconomics)
// ---------------------------------------------------------------------------

interface Target {
  name: string;
  url: string;
  revision: string;
  culture?: string;
}

interface PendingRun {
  name: string;
  url: string;
  revision: string;
  mode: 'run' | 'repeat';
  startedAt: string;
  startedAtMs: number;
  clonePath: string;
  cap: number;
  nodesTotal: number;
  nodesSampled: number;
  capped: boolean;
  coverageGathered: Record<string, number>;
  nodes: Node[];
  probeDecided: Verdict[];
  probeWarnings: string[];
  probeLibrarySizeBefore: number;
  probeDirs: string[];
  timing: { cloneMs: number; gatherMs: number; probeMs: number };
  payloadChars: number;
  batchSize: number;
}

interface EntryTiming {
  cloneMs: number;
  gatherMs: number;
  probeMs: number;
  recordMs: number;
  judgmentMs: number;
}

interface CorpusEntry {
  name: string;
  url: string;
  revision: string;
  /** ok · nothing_gathered · failed — a failed or empty target never gets a ratio. */
  status: 'ok' | 'nothing_gathered' | 'failed';
  runIndex: number | null;
  recordedAt: string;
  error?: string;
  /** null whenever no ratio is defensible. A ratio is never faked to keep a column full. */
  ratio: number | null;
  anchored: number | null;
  selfReferential: number | null;
  unknown: number | null;
  notACheck: number | null;
  nodesTotal: number | null;
  nodesSampled: number | null;
  nodesJudged: number | null;
  nodesUnjudged: number | null;
  /**
   * TRUE whenever some sampled node carries no verdict. A partial target's
   * ratio is a claim about the judged subset ONLY — 1.000 over 2 of 32 nodes
   * is not "this repo is fully anchored", and a consumer that renders it
   * without judgedFraction beside it is publishing something indefensible.
   */
  partial: boolean;
  /** nodesJudged / nodesSampled. 0 means nothing was measured at all. */
  judgedFraction: number | null;
  capped: boolean;
  coverageGathered: Record<string, number> | null;
  /** coverage of JUDGED nodes — not of the gathered surface. See coverageGathered. */
  coverageJudged: Record<string, number> | null;
  probeShare: number | null;
  economics: RunEconomics | null;
  timing?: EntryTiming;
  warnings: string[];
}

interface RepeatDisagreement {
  nodeId: string;
  first: GroundingClass;
  second: GroundingClass;
  firstDecidedBy: 'probe' | 'agent';
  secondDecidedBy: 'probe' | 'agent';
}

/**
 * The empirical stability number — and the one place where it is easiest to
 * publish something flattering and false.
 *
 * A probe is a deterministic script. Re-running it over the same revision
 * reproduces its verdict byte for byte, so every probe-decided node is a free
 * "agreement" that has nothing to do with judgment being stable. As the probe
 * library grows, a pooled number therefore drifts toward 1.0 for reasons that
 * are the opposite of interesting. `agreement` here is AGENT-ONLY: nodes both
 * runs decided agentically. The rest is reported, separated, and labelled.
 */
interface RepeatabilityEntry {
  name: string;
  comparedAt: string;
  /** headline denominator: nodes decided by the AGENT in BOTH runs. */
  comparedNodes: number;
  agreed: number;
  /** agreed / comparedNodes over agent-vs-agent nodes only. The stability claim. */
  agreement: number | null;
  /** deterministic by construction; agreement here is ~1.0 and means nothing about judgment. */
  probeComparedNodes: number;
  probeAgreed: number;
  probeAgreement: number | null;
  /** probe on one side, agent on the other — neither independent nor deterministic. */
  mixedComparedNodes: number;
  mixedAgreed: number;
  mixedAgreement: number | null;
  /** every overlapping node regardless of provenance. NOT a stability claim — kept for audit. */
  pooledComparedNodes: number;
  pooledAgreed: number;
  pooledAgreement: number | null;
  disagreements: RepeatDisagreement[];
  /** set when the repeat run could not be prepared at all (clone/gather failure). */
  error?: string;
}

interface CorpusSummary {
  generatedAt: string;
  corpusFile: string;
  nodeCap: number;
  corpusOrder: string[];
  /** the order targets were ACTUALLY recorded in — probe growth is ordered. */
  runOrder: string[];
  entries: CorpusEntry[];
  totals: {
    targetsDeclared: number;
    /** targets with AT LEAST ONE judged node. A target nobody judged is not a measurement. */
    targetsMeasured: number;
    /** recorded, but zero nodes carry a verdict — counted here instead of in targetsMeasured. */
    targetsUnjudged: number;
    /** measured targets where some sampled node was left unjudged. */
    targetsPartial: number;
    targetsNothingGathered: number;
    targetsFailed: number;
    anchored: number;
    selfReferential: number;
    unknown: number;
    notACheck: number;
    /** gathered across every recorded target — the surface that existed */
    nodesTotal: number;
    /** of that surface, what the cap admitted */
    nodesSampled: number;
    nodesJudged: number;
    /** sampled minus judged: the denominator gap behind every ratio below */
    nodesUnjudged: number;
    /** pooled over every judged node in the corpus */
    ratioPooled: number | null;
    /** unweighted mean of per-target ratios — a different claim, so it is named */
    ratioMeanOfTargets: number | null;
  };
  repeatability: RepeatabilityEntry[];
  notes: string[];
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function die(msg: string): never {
  console.error(`corpus: ${msg}`);
  process.exit(1);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function estTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** rm -rf, but only ever inside our own clone root. */
function removeClone(path: string): void {
  const p = resolve(path);
  if (!p.startsWith(`${resolve(CLONE_ROOT)}/`)) return;
  rmSync(p, { recursive: true, force: true });
}

function run(
  cmd: string[],
  cwd?: string,
): { ok: boolean; stdout: string; stderr: string } {
  const r = Bun.spawnSync(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
  return {
    ok: r.exitCode === 0,
    stdout: r.stdout.toString(),
    stderr: r.stderr.toString(),
  };
}

// ---------------------------------------------------------------------------
// Probe directories.
//
// Resolution follows the orchestrator ruling: --probe-dir REPLACES the default
// set (fan-out isolation is impossible with an append-only flag). A missing
// directory is "no probes", never an error.
// ---------------------------------------------------------------------------

function resolveProbeDirs(flagDirs: string[]): string[] {
  if (flagDirs.length) return flagDirs.map((d) => resolve(d));
  const user = process.env.KEEL_PROBE_DIR ?? join(homedir(), '.config', 'keel', 'probes');
  return [join(SKILL_DIR, 'probes'), resolve(user)];
}

/**
 * How many DISTINCT probes are loadable — files are `<id>.v<version>.ts` and the
 * loader takes the highest version per id, so counting files would inflate the
 * library size that the crystallization curve is plotted against.
 */
function probeLibrarySize(dirs: string[]): number {
  const ids = new Set<string>();
  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue; // missing dir === no probes
    }
    for (const f of entries) {
      if (!f.endsWith('.ts') || f.endsWith('.d.ts')) continue;
      const m = f.match(/^(.*)\.v\d+\.ts$/);
      ids.add(m ? m[1] : f.slice(0, -3));
    }
  }
  return ids.size;
}

// ---------------------------------------------------------------------------
// Clone — shallow, pinned, read-only.
// ---------------------------------------------------------------------------

function clonePinned(target: Target, dest: string): void {
  removeClone(dest);
  mkdirSync(dest, { recursive: true });

  const init = run(['git', 'init', '-q', dest]);
  if (!init.ok) throw new Error(`git init failed: ${init.stderr.trim()}`);
  const remote = run(['git', '-C', dest, 'remote', 'add', 'origin', target.url]);
  if (!remote.ok) throw new Error(`git remote add failed: ${remote.stderr.trim()}`);

  // Fetch the pinned sha directly at depth 1. GitHub serves arbitrary reachable
  // shas, so this is one round trip and no history.
  const fetch = run([
    'git', '-C', dest, 'fetch', '-q', '--depth=1', 'origin', target.revision,
  ]);
  if (fetch.ok) {
    const co = run(['git', '-C', dest, 'checkout', '-q', 'FETCH_HEAD']);
    if (co.ok) return;
    throw new Error(`checkout FETCH_HEAD failed: ${co.stderr.trim()}`);
  }

  // Fallback: a host that refuses sha fetches still has to serve a full clone.
  removeClone(dest);
  const full = run(['git', 'clone', '-q', target.url, dest]);
  if (!full.ok) {
    throw new Error(
      `shallow fetch of ${target.revision.slice(0, 12)} failed (${fetch.stderr.trim() || 'no stderr'}); full clone also failed: ${full.stderr.trim() || 'no stderr'}`,
    );
  }
  const co = run(['git', '-C', dest, 'checkout', '-q', target.revision]);
  if (!co.ok) throw new Error(`checkout ${target.revision} failed: ${co.stderr.trim()}`);
}

// ---------------------------------------------------------------------------
// Sampling — capped at `cap`, preferring kind diversity, and DISCLOSED.
//
// Deterministic: round-robin over kinds in sorted order, taking nodes in gather
// order, then restored to gather order for readability. Same revision in, same
// sample out — which is what makes the repeatability number about JUDGMENT
// rather than about which nodes happened to be drawn.
// ---------------------------------------------------------------------------

function sampleNodes(nodes: Node[], cap: number): Node[] {
  if (nodes.length <= cap) return nodes;

  const order = new Map<string, number>();
  nodes.forEach((n, i) => order.set(n.id, i));

  const byKind = new Map<string, Node[]>();
  for (const n of nodes) {
    const q = byKind.get(n.kind);
    if (q) q.push(n);
    else byKind.set(n.kind, [n]);
  }

  const kinds = [...byKind.keys()].sort();
  const picked: Node[] = [];
  let progressed = true;
  while (picked.length < cap && progressed) {
    progressed = false;
    for (const k of kinds) {
      const q = byKind.get(k);
      if (!q || !q.length) continue;
      picked.push(q.shift() as Node);
      progressed = true;
      if (picked.length >= cap) break;
    }
  }
  return picked.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

// ---------------------------------------------------------------------------
// Probe dispatch — guarded.
//
// classify.ts is written by another unit and may be absent or broken. Its
// absence must degrade to "every node pending" (the agent judges everything),
// never to a missing target or a defaulted class. Nothing here interprets a
// node; it only moves verdicts that the probe layer produced.
// ---------------------------------------------------------------------------

function isVerdictLike(v: unknown): v is Verdict {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.nodeId === 'string' && typeof o.class === 'string';
}

function asClassifyOutput(value: unknown): ClassifyOutput | null {
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  if (!Array.isArray(o.decided) || !Array.isArray(o.pending)) return null;
  return {
    decided: o.decided.filter(isVerdictLike),
    pending: (o.pending as Node[]).filter((n) => n && typeof n === 'object'),
    warnings: Array.isArray(o.warnings) ? (o.warnings as string[]).map(String) : [],
  };
}

async function dispatchProbes(
  nodes: Node[],
  probeDirs: string[],
  enabled: boolean,
): Promise<{ decided: Verdict[]; warnings: string[]; ms: number }> {
  const warnings: string[] = [];
  if (!enabled) {
    return {
      decided: [],
      warnings: ['probe dispatch disabled (pass --classify to enable); every node is pending'],
      ms: 0,
    };
  }

  const modPath = join(SCRIPT_DIR, 'classify.ts');
  if (!existsSync(modPath)) {
    return {
      decided: [],
      warnings: [`--classify requested but ${modPath} does not exist; every node is pending`],
      ms: 0,
    };
  }

  const t0 = Date.now();
  let out: ClassifyOutput | null = null;

  // The CLI is the ONLY entry point used, deliberately, and there is no
  // in-process fallback.
  //
  // There used to be one: `await import('./classify.ts')` plus a probe of both
  // argument orders. It was worse than useless. `classify(opts, nodes)` degrades
  // gracefully, so calling it as `classify(nodes, opts)` returned a well-shaped
  // `{decided: [], pending: [], warnings: [...]}` for garbage input; the shape
  // check accepted it, the loop broke, and the CORRECT order was never reached —
  // a "rescue" path that guaranteed zero probe coverage while emitting a
  // misleading warning. Worse, importing classify.ts pulls another unit's module
  // graph into THIS process, which is exactly where probe code — including
  // probe LOADING — must never run. Keeping the child-process boundary as the
  // only path makes that structural rather than a property of what classify.ts
  // happens to import today.
  //
  // A CLI failure is now what it always effectively was: a loud warning and
  // zero probes, with every node falling through to the agent. Failing closed.
  try {
    const tmp = join(WORK_DIR, '.classify-input.json');
    writeJson(tmp, nodes);
    const args = ['bun', modPath, tmp, '--json'];
    for (const d of probeDirs) args.push('--probe-dir', d);
    const r = run(args, REPO_ROOT);
    if (!r.ok) {
      warnings.push(`classify.ts CLI dispatch exited non-zero: ${r.stderr.trim().slice(0, 400)}`);
    } else {
      out = asClassifyOutput(JSON.parse(r.stdout));
      if (!out) warnings.push('classify.ts CLI stdout was not a ClassifyOutput; ignored');
    }
    rmSync(tmp, { force: true });
  } catch (e) {
    warnings.push(`classify.ts CLI dispatch failed: ${errText(e)}`);
  }

  const ms = Date.now() - t0;
  if (!out) {
    warnings.push('no probe verdicts available; every node is pending');
    return { decided: [], warnings, ms };
  }

  const ids = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();
  const decided: Verdict[] = [];
  for (const v of out.decided) {
    if (!ids.has(v.nodeId)) {
      warnings.push(`probe verdict for unknown node ${v.nodeId}; dropped`);
      continue;
    }
    // One node, one verdict. Two probe verdicts for the same node would inflate
    // the judged count past the sample size and push judgedFraction above 1.0,
    // which is a disclosure field — it has to be exact or it is worse than absent.
    if (seen.has(v.nodeId)) {
      warnings.push(`probe layer emitted a second verdict for ${v.nodeId}; dropped (the first one stands)`);
      continue;
    }
    // A probe may never assert `unknown` — that claim is the agent's alone.
    // A probe that did is not trusted here; the node falls through to the agent.
    if (v.class === 'unknown') {
      warnings.push(`probe verdict on ${v.nodeId} returned 'unknown' (forbidden); dropped to pending`);
      continue;
    }
    if (!CLASSES.includes(v.class)) {
      warnings.push(`probe verdict on ${v.nodeId} has invalid class ${String(v.class)}; dropped`);
      continue;
    }
    seen.add(v.nodeId);
    decided.push({ ...v, decidedBy: 'probe' });
  }
  warnings.push(...out.warnings);
  return { decided, warnings, ms };
}

// ---------------------------------------------------------------------------
// Payload rendering — what the agent actually judges.
// ---------------------------------------------------------------------------

function renderPayload(pending: PendingRun): string {
  const L: string[] = [];
  const total = pending.nodes.length;
  const batches = Math.ceil(total / pending.batchSize) || 0;
  const verdictsPath = verdictsPathFor(pending.name, pending.mode);

  L.push('');
  L.push('='.repeat(78));
  L.push(`JUDGMENT PAYLOAD · ${pending.name} @ ${pending.revision.slice(0, 12)}${pending.mode === 'repeat' ? ' · REPEAT RUN' : ''}`);
  L.push('='.repeat(78));
  L.push(`gathered ${pending.nodesTotal} nodes · judging ${pending.nodesSampled}${pending.capped ? ` (CAPPED at ${pending.cap}, sampled for kind diversity)` : ''}`);
  L.push(`probe-decided already: ${pending.probeDecided.length} · pending for you: ${total}`);
  L.push(`clone (read-only, judge over it if you need context): ${pending.clonePath}`);
  if (pending.mode === 'repeat') {
    L.push('REPEAT RUN: judge fresh. Do NOT read the cached report for this target —');
    L.push('the number this produces is only worth something if the judgment is independent.');
  }
  L.push('');
  L.push('The only question: what actually produces this signal, and can the actor');
  L.push('being verified write to it?  anchored = cannot · self_referential = can ·');
  L.push('unknown = fork point not established (fails closed, counts against the ratio) ·');
  L.push('not_a_check = asserts nothing about correctness (excluded from the ratio, so');
  L.push('it is the shoppable class — if you reach for it because a node is HARD, the');
  L.push('honest answer is unknown).');
  L.push('');

  for (let b = 0; b < batches; b++) {
    const slice = pending.nodes.slice(b * pending.batchSize, (b + 1) * pending.batchSize);
    L.push('-'.repeat(78));
    L.push(`BATCH ${b + 1}/${batches} · ${slice.length} nodes`);
    L.push('-'.repeat(78));
    for (const n of slice) {
      L.push('');
      L.push(`id:     ${n.id}`);
      L.push(`kind:   ${n.kind}`);
      L.push(`name:   ${n.name}`);
      L.push(`source: ${n.source}`);
      if (n.hints) L.push(`hints:  ${JSON.stringify(n.hints)}`);
      L.push('raw:');
      const raw = n.raw ?? '';
      const shown = raw.length > RAW_PRINT_LIMIT ? raw.slice(0, RAW_PRINT_LIMIT) : raw;
      for (const line of shown.split('\n')) L.push(`  | ${line}`);
      if (raw.length > RAW_PRINT_LIMIT) {
        L.push(`  | [TRUNCATED for printing — ${raw.length - RAW_PRINT_LIMIT} more chars.`);
        L.push(`  |  Full literal text is in ${pendingPathFor(pending.name, pending.mode)}]`);
      }
    }
    L.push('');
  }

  L.push('-'.repeat(78));
  L.push(`WRITE VERDICTS TO: ${verdictsPath}`);
  L.push('-'.repeat(78));
  L.push('A JSON array of Verdict (schemas/keel.ts). One entry per node above:');
  L.push('  { "nodeId": "<exact id>",');
  L.push('    "class": "anchored" | "self_referential" | "unknown" | "not_a_check",');
  L.push('    "writeBoundary": { "producer": "what emits the signal",');
  L.push('                       "actorCanWrite": true | false | null,');
  L.push('                       "argument": "the causal path, not a restatement of the class" },');
  L.push('    "evidence": ["file:line", "command", ...],');
  L.push('    "confidence": 0.0-1.0 }');
  L.push('A node you leave out stays UNJUDGED and is reported as such — it is never');
  L.push('defaulted to a class.');
  L.push('');
  L.push(`THEN: bun scripts/corpus.ts record ${pending.name}${pending.mode === 'repeat' ? ' --repeat' : ''}`);
  L.push('');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// Paths for the stepper's own state
// ---------------------------------------------------------------------------

function pendingPathFor(name: string, mode: 'run' | 'repeat'): string {
  return join(WORK_DIR, `${name}${mode === 'repeat' ? '.repeat' : ''}.pending.json`);
}
function verdictsPathFor(name: string, mode: 'run' | 'repeat'): string {
  return join(WORK_DIR, `${name}${mode === 'repeat' ? '.repeat' : ''}.verdicts.json`);
}
function reportPathFor(name: string, mode: 'run' | 'repeat'): string {
  return join(REPORTS_DIR, `${name}${mode === 'repeat' ? '.repeat' : ''}.json`);
}

// ---------------------------------------------------------------------------
// Corpus + summary IO
// ---------------------------------------------------------------------------

function loadCorpus(path: string): { targets: Target[]; nodeCap: number } {
  if (!existsSync(path)) die(`corpus file not found: ${path}`);
  let raw: unknown;
  try {
    raw = readJson<unknown>(path);
  } catch (e) {
    die(`corpus file is not valid JSON: ${errText(e)}`);
  }
  const obj = raw as { targets?: unknown; nodeCap?: unknown };
  const list = Array.isArray(raw) ? raw : obj.targets;
  if (!Array.isArray(list)) die('corpus file must be an array of targets or { targets: [...] }');

  const seen = new Set<string>();
  const targets: Target[] = [];
  list.forEach((t, i) => {
    const e = t as Partial<Target>;
    if (!e || typeof e.name !== 'string' || typeof e.url !== 'string' || typeof e.revision !== 'string') {
      die(`corpus entry ${i} needs { name, url, revision }`);
    }
    if (!/^[0-9a-f]{40}$/.test(e.revision)) {
      die(`corpus entry ${e.name} has revision "${e.revision}" — pin a full 40-char sha or the number is not reproducible`);
    }
    if (seen.has(e.name)) die(`duplicate corpus entry name: ${e.name}`);
    seen.add(e.name);
    targets.push({ name: e.name, url: e.url, revision: e.revision, culture: e.culture });
  });

  const cap = typeof obj.nodeCap === 'number' && obj.nodeCap > 0 ? obj.nodeCap : DEFAULT_CAP;
  return { targets, nodeCap: cap };
}

function emptySummary(corpusPath: string, cap: number): CorpusSummary {
  return {
    generatedAt: new Date().toISOString(),
    corpusFile: corpusPath,
    nodeCap: cap,
    corpusOrder: [],
    runOrder: [],
    entries: [],
    totals: {
      targetsDeclared: 0,
      targetsMeasured: 0,
      targetsUnjudged: 0,
      targetsPartial: 0,
      targetsNothingGathered: 0,
      targetsFailed: 0,
      anchored: 0,
      selfReferential: 0,
      unknown: 0,
      notACheck: 0,
      nodesTotal: 0,
      nodesSampled: 0,
      nodesJudged: 0,
      nodesUnjudged: 0,
      ratioPooled: null,
      ratioMeanOfTargets: null,
    },
    repeatability: [],
    notes: [],
  };
}

function loadSummary(corpusPath: string, cap: number): CorpusSummary {
  if (!existsSync(SUMMARY_PATH)) return emptySummary(corpusPath, cap);
  try {
    const s = readJson<CorpusSummary>(SUMMARY_PATH);
    s.entries ??= [];
    s.runOrder ??= [];
    s.repeatability ??= [];
    return s;
  } catch {
    return emptySummary(corpusPath, cap);
  }
}

function recomputeTotals(s: CorpusSummary, targets: Target[]): void {
  const ok = s.entries.filter((e) => e.status === 'ok');
  // "Measured" means at least one node actually carries a verdict. A recorded
  // target where the agent judged nothing produced no measurement, and counting
  // it would let a renderer say "15 of 15 targets measured" about a run where
  // some of those fifteen were never looked at.
  const measured = ok.filter((e) => (e.nodesJudged ?? 0) > 0);
  const unjudgedTargets = ok.filter((e) => (e.nodesJudged ?? 0) === 0);
  const sum = (f: (e: CorpusEntry) => number | null) =>
    measured.reduce((a, e) => a + (f(e) ?? 0), 0);
  const anchored = sum((e) => e.anchored);
  const selfRef = sum((e) => e.selfReferential);
  const unknown = sum((e) => e.unknown);
  const notACheck = sum((e) => e.notACheck);
  const denom = anchored + selfRef + unknown;
  const ratios = measured.map((e) => e.ratio).filter((r): r is number => typeof r === 'number');

  // Node coverage spans every RECORDED target, including the ones that gathered
  // nothing and the ones nobody judged — that is the point of publishing it.
  const recorded = s.entries.filter((e) => e.status === 'ok' || e.status === 'nothing_gathered');
  const nodesTotal = recorded.reduce((a, e) => a + (e.nodesTotal ?? 0), 0);
  const nodesSampled = recorded.reduce((a, e) => a + (e.nodesSampled ?? 0), 0);
  const nodesJudged = recorded.reduce((a, e) => a + (e.nodesJudged ?? 0), 0);

  s.totals = {
    targetsDeclared: targets.length,
    targetsMeasured: measured.length,
    targetsUnjudged: unjudgedTargets.length,
    targetsPartial: measured.filter((e) => e.partial === true).length,
    targetsNothingGathered: s.entries.filter((e) => e.status === 'nothing_gathered').length,
    targetsFailed: s.entries.filter((e) => e.status === 'failed').length,
    anchored,
    selfReferential: selfRef,
    unknown,
    notACheck,
    nodesTotal,
    nodesSampled,
    nodesJudged,
    nodesUnjudged: Math.max(0, nodesSampled - nodesJudged),
    ratioPooled: denom === 0 ? null : anchored / denom,
    ratioMeanOfTargets: ratios.length === 0 ? null : ratios.reduce((a, r) => a + r, 0) / ratios.length,
  };
  s.corpusOrder = targets.map((t) => t.name);
  s.generatedAt = new Date().toISOString();
  s.notes = [
    'A ratio never travels alone: read it with the anchored count and the coverage beside it. A 1.0 over one edge and a 0.7 over fifty are different claims.',
    'coverageJudged counts the nodes that were JUDGED, not the whole gathered surface. coverageGathered is the surface the gatherer could see. Surfaces the gatherer cannot read at all are absent from both — that is Keel\'s own shoppable class, and it is why nodesTotal is printed.',
    'unknown counts AGAINST the ratio. not_a_check is excluded from it entirely, which is what makes not_a_check shoppable and worth auditing.',
    'Keel measures the SHAPE of verification, not its quality. A repo can be 100% anchored with terrible tests. A high ratio is not "well tested".',
    'entries accumulate across runs and are keyed by name: running with a SUBSET corpus file adds to this summary rather than replacing it, so entries may name targets absent from the current corpusOrder. Totals are computed over the entries, not over the current corpus file.',
    'partial:true means some sampled node carries no verdict, and judgedFraction says how much of the sample the ratio actually rests on. A ratio of 1.000 at judgedFraction 0.06 is a claim about two edges, not about a repository. totals.targetsMeasured counts only targets with at least one judged node; targets recorded with none are counted under targetsUnjudged and contribute nothing to any aggregate.',
    'A target that gathered zero nodes, and a target where not one sampled node carries a verdict, both get NO reports/<name>.json — a Report must carry a GroundingRatio, groundingRatio([]) is 0, and publishing 0.000 (the worst possible score) about a surface nobody could read or nobody judged is a category error, not a result. The first appears here as status "nothing_gathered" with ratio null; the second as a recorded entry with ratio null, nodesJudged 0 and a place in totals.targetsUnjudged. Resume keys off those entries rather than off a report file.',
    'tokensEstimated is true everywhere: a skill inside an agent session has no API for its own usage. Estimate = ceil(chars/4) over the printed judgment payload and the verdicts file.',
    'COST CAVEAT, read before plotting anything. economics.wallClockMs and timing.judgmentMs span `next` -> `record`, which is agent-and-operator wall time: they include coffee breaks, context switches and anything else that happened between the two commands, so they are an UPPER BOUND on machine cost and not a measurement of it. Only timing.{cloneMs,gatherMs,probeMs,recordMs} are directly measured. tokensIn likewise counts only the printed payload — the payload invites the agent to read the clone for context, and those reads are uncounted and systematically larger on probe-poor early targets, a bias pointing the same way as any crystallization effect. For a cost-vs-library-size curve, prefer decidedByProbe/nodesJudged (probe share) and tokensIn as the y-axis; use wall clock only as a loose ceiling, and never as the headline.',
    'repeatability.agreement is AGENT-ONLY by construction: probes are deterministic scripts that reproduce their own verdicts exactly, so counting them as "independent re-judgment" inflates the number toward 1.0 as the library grows, for reasons unrelated to judgment stability. probeAgreement / mixedAgreement / pooledAgreement are reported beside it for audit, and pooledAgreement is NOT the stability claim.',
  ];
}

function upsertEntry(s: CorpusSummary, entry: CorpusEntry): void {
  const i = s.entries.findIndex((e) => e.name === entry.name);
  if (i >= 0) s.entries[i] = entry;
  else s.entries.push(entry);
}

// ---------------------------------------------------------------------------
// `next`
// ---------------------------------------------------------------------------

interface NextOpts {
  corpusPath: string;
  cap: number | null;
  classify: boolean;
  probeDirs: string[];
  batchSize: number;
  repeat: string | null;
  retryFailed: boolean;
  force: boolean;
}

/**
 * Resume, and the reason it is not `existsSync(report)`.
 *
 * The summary entry is the record of what happened; the report file is one of
 * the artifacts a successful record produces, and a target that gathered
 * nothing legitimately has none. Keying resume off the entry lets
 * "nothing_gathered" be a terminal state without forcing a Report into
 * existence to represent it. An existing report with no entry (someone deleted
 * corpus-summary.json) is still honoured — re-judging a recorded target by
 * accident is the expensive mistake this guard exists to prevent.
 */
function alreadyProcessed(
  summary: CorpusSummary,
  target: Target,
): { skip: boolean; why: string } {
  const e = summary.entries.find((x) => x.name === target.name);
  if (e?.status === 'ok') {
    return {
      skip: true,
      why:
        (e.nodesJudged ?? 0) === 0
          ? 'already recorded, but NOT measured — no node carried a verdict, so no report exists and no ratio was published (see totals.targetsUnjudged)'
          : `already recorded (${reportPathFor(target.name, 'run')})`,
    };
  }
  if (e?.status === 'nothing_gathered') {
    return {
      skip: true,
      why: 'already recorded as "nothing gathered" — no verification surface the gatherer can read, and no report is written for that',
    };
  }
  if (!e && existsSync(reportPathFor(target.name, 'run'))) {
    return {
      skip: true,
      why: `a report exists at ${reportPathFor(target.name, 'run')} but no summary entry does — treating it as recorded rather than re-judging it`,
    };
  }
  return { skip: false, why: '' };
}

/**
 * Refuse to clobber a judged-but-unrecorded attempt.
 *
 * A crash between `next` and `record` leaves <name>.verdicts.json on disk. If
 * `next` silently rewrote the pending file over it, the next `record` would
 * consume verdicts produced in an abandoned session and attribute this run's
 * wall clock and token counts to them. The check is cheap; the corruption is
 * silent and lands directly in the published economics.
 */
function guardStaleVerdicts(name: string, mode: 'run' | 'repeat', force: boolean): void {
  const vPath = verdictsPathFor(name, mode);
  if (!existsSync(vPath) || force) return;
  die(
    `${name}: a verdicts file from an earlier attempt is still here (${vPath}).\n` +
      `  Recording now would merge verdicts judged in another session into this run's economics.\n` +
      '  Either `record` that attempt, delete the file, or pass --force to start over.',
  );
}

/**
 * Retire the stepper state for a completed target so it can never be replayed.
 * Kept rather than deleted — the pending file holds the exact payload the
 * verdicts answered, which is the audit trail for a published number.
 */
function retireState(name: string, mode: 'run' | 'repeat'): void {
  mkdirSync(RECORDED_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const p of [pendingPathFor(name, mode), verdictsPathFor(name, mode)]) {
    if (!existsSync(p)) continue;
    const base = p.slice(p.lastIndexOf('/') + 1);
    try {
      renameSync(p, join(RECORDED_DIR, `${stamp}.${base}`));
    } catch {
      rmSync(p, { force: true });
    }
  }
}

async function prepare(
  target: Target,
  mode: 'run' | 'repeat',
  cap: number,
  opts: NextOpts,
): Promise<PendingRun> {
  const startedAtMs = Date.now();
  const clonePath = join(CLONE_ROOT, `${target.name}${mode === 'repeat' ? '.repeat' : ''}`);

  const t0 = Date.now();
  clonePinned(target, clonePath);
  const cloneMs = Date.now() - t0;

  const t1 = Date.now();
  const all = gather(clonePath);
  const gatherMs = Date.now() - t1;

  const sampled = sampleNodes(all, cap);
  const probeDirs = resolveProbeDirs(opts.probeDirs);
  const before = probeLibrarySize(probeDirs);
  const probe = await dispatchProbes(sampled, probeDirs, opts.classify);

  const decidedIds = new Set(probe.decided.map((v) => v.nodeId));
  const pendingNodes = sampled.filter((n) => !decidedIds.has(n.id));

  const pending: PendingRun = {
    name: target.name,
    url: target.url,
    revision: target.revision,
    mode,
    startedAt: new Date(startedAtMs).toISOString(),
    startedAtMs,
    clonePath,
    cap,
    nodesTotal: all.length,
    nodesSampled: sampled.length,
    capped: all.length > sampled.length,
    coverageGathered: coverageByKind(all),
    nodes: pendingNodes,
    probeDecided: probe.decided,
    probeWarnings: probe.warnings,
    probeLibrarySizeBefore: before,
    probeDirs,
    timing: { cloneMs, gatherMs, probeMs: probe.ms },
    payloadChars: 0,
    batchSize: opts.batchSize,
  };

  // The sample lives in the pending file in full; only the printed copy is capped.
  const withSample = { ...pending, sampledNodes: sampled };
  // Nothing gathered means nothing to judge, so no payload is printed: telling
  // the agent to "WRITE VERDICTS TO ..." for a target that has no nodes invites
  // a verdicts file for a run that will never be recorded, which then trips the
  // stale-verdicts guard on any retry. The caller reports the nothing-gathered
  // state instead. Note this is keyed on the GATHERED count, not the pending
  // one: a target where probes decided every node still needs its `record`
  // instructions printed.
  const payload = all.length === 0 ? '' : renderPayload(pending);
  pending.payloadChars = payload.length;
  writeJson(pendingPathFor(target.name, mode), { ...withSample, payloadChars: payload.length });
  if (payload) process.stdout.write(payload);
  return pending;
}

async function cmdNext(opts: NextOpts): Promise<void> {
  const { targets, nodeCap } = loadCorpus(opts.corpusPath);
  const cap = opts.cap ?? nodeCap;
  const summary = loadSummary(opts.corpusPath, cap);
  mkdirSync(WORK_DIR, { recursive: true });
  mkdirSync(REPORTS_DIR, { recursive: true });

  if (opts.repeat) {
    const target = targets.find((t) => t.name === opts.repeat);
    if (!target) die(`--repeat: "${opts.repeat}" is not in ${opts.corpusPath}`);
    if (!existsSync(reportPathFor(target.name, 'run'))) {
      const e = summary.entries.find((x) => x.name === target.name);
      die(
        e?.status === 'nothing_gathered'
          ? `--repeat: ${target.name} gathered nothing, so there is no first judgment to compare against`
          : e?.status === 'ok' && (e.nodesJudged ?? 0) === 0
            ? `--repeat: ${target.name} was recorded with no verdicts at all, so there is no first judgment to compare against`
            : `--repeat: ${target.name} has no recorded report yet — repeatability compares two independent judgments of the same target`,
      );
    }
    guardStaleVerdicts(target.name, 'repeat', opts.force);
    console.log(`corpus: REPEAT run for ${target.name} @ ${target.revision.slice(0, 12)} (fresh judgment; the cached report is not consulted)`);
    try {
      await prepare(target, 'repeat', cap, opts);
    } catch (e) {
      // The repeat path gets the SAME non-fatal treatment as the main loop. A
      // transient network failure during the repeatability run must not kill
      // the process mid-arc: the corpus number is the deliverable, and the
      // repeatability number is a bonus measured on top of it.
      const msg = errText(e);
      console.error(`corpus: FAILED ${target.name} (repeat) — ${msg}`);
      removeClone(join(CLONE_ROOT, `${target.name}.repeat`));
      summary.repeatability = [
        ...summary.repeatability.filter((r) => r.name !== target.name),
        {
          name: target.name,
          comparedAt: new Date().toISOString(),
          comparedNodes: 0,
          agreed: 0,
          agreement: null,
          probeComparedNodes: 0,
          probeAgreed: 0,
          probeAgreement: null,
          mixedComparedNodes: 0,
          mixedAgreed: 0,
          mixedAgreement: null,
          pooledComparedNodes: 0,
          pooledAgreed: 0,
          pooledAgreement: null,
          disagreements: [],
          error: msg,
        },
      ];
      recomputeTotals(summary, targets);
      writeJson(SUMMARY_PATH, summary);
      console.error('corpus: repeat recorded as failed; the target\'s own report is untouched.');
    }
    return;
  }

  for (const target of targets) {
    const done = alreadyProcessed(summary, target);
    if (done.skip) {
      console.log(`corpus: skip ${target.name} — ${done.why}`);
      continue;
    }
    const prior = summary.entries.find((e) => e.name === target.name);
    if (prior?.status === 'failed' && !opts.retryFailed) {
      console.log(`corpus: skip ${target.name} — recorded failure (${prior.error ?? 'no message'}); rerun with --retry-failed to try again`);
      continue;
    }

    guardStaleVerdicts(target.name, 'run', opts.force);

    const startedAtMs = Date.now();
    console.log(`corpus: next → ${target.name} @ ${target.revision.slice(0, 12)}`);
    let pending: PendingRun;
    try {
      pending = await prepare(target, 'run', cap, opts);
    } catch (e) {
      // Per-target failure is NON-FATAL. Recorded, then we move on — one
      // unclonable repo must not cost the corpus.
      const msg = errText(e);
      console.error(`corpus: FAILED ${target.name} — ${msg}`);
      removeClone(join(CLONE_ROOT, target.name));
      upsertEntry(summary, {
        name: target.name,
        url: target.url,
        revision: target.revision,
        status: 'failed',
        runIndex: null,
        recordedAt: new Date().toISOString(),
        error: msg,
        ratio: null,
        anchored: null,
        selfReferential: null,
        unknown: null,
        notACheck: null,
        nodesTotal: null,
        nodesSampled: null,
        nodesJudged: null,
        nodesUnjudged: null,
        partial: false,
        judgedFraction: null,
        capped: false,
        coverageGathered: null,
        coverageJudged: null,
        probeShare: null,
        economics: null,
        warnings: [`target failed at ${new Date().toISOString()}; excluded from every aggregate`],
      });
      recomputeTotals(summary, targets);
      writeJson(SUMMARY_PATH, summary);
      continue;
    }

    if (pending.nodesTotal === 0) {
      // Nothing gathered is a RESULT, not a ratio.
      //
      // NO REPORT IS WRITTEN. reports/<name>.json must carry a GroundingRatio,
      // and groundingRatio([]) is 0 — the worst possible score — for a repo
      // whose only fault was having no verification surface this gatherer can
      // read. Any consumer reading the report file directly would render 0.000
      // and be wrong. The honest artifact is the summary entry, which says
      // nothing_gathered with ratio null; resume keys off that entry, so
      // nothing needs a report file in order to be terminal.
      console.log(`corpus: ${target.name} gathered 0 nodes — recorded as "nothing gathered", NOT as a ratio (no report file is written)`);
      const economics: RunEconomics = {
        nodesTotal: 0,
        nodesSampled: 0,
        decidedByProbe: 0,
        decidedByAgent: 0,
        probesMinted: 0,
        probeLibrarySize: probeLibrarySize(pending.probeDirs),
        tokensIn: 0,
        tokensOut: 0,
        tokensEstimated: true,
        wallClockMs: Date.now() - startedAtMs,
      };
      summary.runOrder = summary.runOrder.filter((n) => n !== target.name);
      summary.runOrder.push(target.name);
      upsertEntry(summary, {
        name: target.name,
        url: target.url,
        revision: target.revision,
        status: 'nothing_gathered',
        runIndex: summary.runOrder.indexOf(target.name),
        recordedAt: new Date().toISOString(),
        ratio: null,
        anchored: null,
        selfReferential: null,
        unknown: null,
        notACheck: null,
        nodesTotal: 0,
        nodesSampled: 0,
        nodesJudged: 0,
        nodesUnjudged: 0,
        partial: false,
        judgedFraction: null,
        capped: false,
        coverageGathered: {},
        coverageJudged: {},
        probeShare: null,
        economics,
        warnings: [
          'gatherer found no verification surfaces it can read — this is non-coverage, not a grounding claim',
          'no reports/<name>.json exists for this target ON PURPOSE: every ratio a Report could carry here would be a claim nobody can defend',
        ],
      });
      recomputeTotals(summary, targets);
      writeJson(SUMMARY_PATH, summary);
      removeClone(pending.clonePath);
      rmSync(pendingPathFor(target.name, 'run'), { force: true });
      console.log(`corpus: summary → ${SUMMARY_PATH}`);
      continue;
    }

    for (const w of pending.probeWarnings) console.error(`corpus: warning — ${w}`);
    console.log(`corpus: STOPPED for judgment. ${pending.nodes.length} nodes pending, ${pending.probeDecided.length} decided by probe.`);
    return;
  }

  recomputeTotals(summary, targets);
  writeJson(SUMMARY_PATH, summary);
  console.log(`corpus: nothing left to run — every target is recorded or has a recorded failure.`);
  console.log(`corpus: summary → ${SUMMARY_PATH}`);
}

// ---------------------------------------------------------------------------
// `record`
// ---------------------------------------------------------------------------

function loadVerdicts(path: string, nodes: Node[]): { verdicts: Verdict[]; chars: number; warnings: string[] } {
  if (!existsSync(path)) die(`no verdicts file at ${path} — judge the printed payload first`);
  const chars = readFileSync(path, 'utf8').length;
  let raw: unknown;
  try {
    raw = readJson<unknown>(path);
  } catch (e) {
    die(`verdicts file is not valid JSON: ${errText(e)}`);
  }
  const list = Array.isArray(raw) ? raw : (raw as { verdicts?: unknown }).verdicts;
  if (!Array.isArray(list)) die('verdicts file must be a Verdict[] or { verdicts: Verdict[] }');

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const problems: string[] = [];
  const warnings: string[] = [];
  const verdicts: Verdict[] = [];
  const seen = new Set<string>();

  list.forEach((item, i) => {
    const v = item as Partial<Verdict>;
    const where = `verdict[${i}]${typeof v?.nodeId === 'string' ? ` (${v.nodeId})` : ''}`;
    if (!v || typeof v.nodeId !== 'string') return problems.push(`${where}: missing nodeId`);
    if (!byId.has(v.nodeId)) return problems.push(`${where}: nodeId is not in this run's sample`);
    if (seen.has(v.nodeId)) return problems.push(`${where}: duplicate verdict for this node`);
    if (typeof v.class !== 'string' || !CLASSES.includes(v.class as GroundingClass)) {
      return problems.push(`${where}: class must be one of ${CLASSES.join(' | ')}`);
    }
    const wb = v.writeBoundary;
    if (!wb || typeof wb.producer !== 'string' || typeof wb.argument !== 'string') {
      return problems.push(`${where}: writeBoundary needs { producer, actorCanWrite, argument }`);
    }
    if (!(wb.actorCanWrite === true || wb.actorCanWrite === false || wb.actorCanWrite === null)) {
      return problems.push(`${where}: writeBoundary.actorCanWrite must be true, false or null`);
    }
    if (typeof v.confidence !== 'number' || v.confidence < 0 || v.confidence > 1) {
      return problems.push(`${where}: confidence must be a number in 0..1`);
    }
    const evidence = Array.isArray(v.evidence) ? v.evidence.map(String) : [];
    if (!Array.isArray(v.evidence)) warnings.push(`${where}: no evidence array — recorded with none, which is itself a signal`);

    // The schema states the mapping between the two answers the agent gave.
    // A mismatch is not corrected here (correcting it would be judging) — it is
    // surfaced, because one of the two fields is wrong and both are the agent's.
    const expected =
      wb.actorCanWrite === true ? 'self_referential' : wb.actorCanWrite === false ? 'anchored' : 'unknown';
    if (v.class !== 'not_a_check' && v.class !== expected) {
      warnings.push(`${where}: class "${v.class}" disagrees with actorCanWrite=${String(wb.actorCanWrite)} (schema says that implies "${expected}") — left as written, flagged for audit`);
    }

    seen.add(v.nodeId);
    verdicts.push({
      nodeId: v.nodeId,
      class: v.class as GroundingClass,
      writeBoundary: { producer: wb.producer, actorCanWrite: wb.actorCanWrite, argument: wb.argument },
      evidence,
      confidence: v.confidence,
      decidedBy: v.decidedBy === 'probe' ? 'probe' : 'agent',
      ...(v.probeId ? { probeId: v.probeId } : {}),
      ...(v.audit ? { audit: v.audit } : {}),
    });
  });

  if (problems.length) {
    console.error('corpus: verdicts file rejected — nothing was recorded.');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  return { verdicts, chars, warnings };
}

interface RecordOpts {
  corpusPath: string;
  repeat: boolean;
  probeDirs: string[];
  keepClone: boolean;
}

function cmdRecord(name: string, opts: RecordOpts): void {
  const mode: 'run' | 'repeat' = opts.repeat ? 'repeat' : 'run';
  const recordStart = Date.now();
  const { targets, nodeCap } = loadCorpus(opts.corpusPath);
  const target = targets.find((t) => t.name === name);
  if (!target) die(`"${name}" is not in ${opts.corpusPath}`);

  const pendingPath = pendingPathFor(name, mode);
  if (!existsSync(pendingPath)) die(`no pending run at ${pendingPath} — run \`next\` first`);
  const pending = readJson<PendingRun & { sampledNodes?: Node[] }>(pendingPath);
  const sampled = pending.sampledNodes ?? pending.nodes;

  // A verdicts file is required, with exactly one exception: the probe layer
  // decided every sampled node, so `next` printed no batch and the agent has
  // nothing to write. Dying there would make a fully-crystallized target
  // unrecordable — the end state this project is aiming at. The exception is
  // narrow on purpose: it needs zero pending nodes AND at least one probe
  // verdict, so "no file" can never quietly stand in for "nobody judged".
  const vPath = verdictsPathFor(name, mode);
  const nothingWasLeftForTheAgent =
    !existsSync(vPath) && (pending.nodes?.length ?? 0) === 0 && pending.probeDecided.length > 0;
  const { verdicts: agentVerdicts, chars, warnings: vWarnings } = nothingWasLeftForTheAgent
    ? {
        verdicts: [] as Verdict[],
        chars: 0,
        warnings: [
          'no verdicts file: every sampled node was decided by a probe, so nothing was left for the agent to judge. Recorded with agent-decided 0 — read probeShare beside the ratio.',
        ],
      }
    : loadVerdicts(vPath, sampled);

  // Agent verdicts win over probe verdicts on the same node: the agent is the
  // authority, and a collision means the node was re-judged deliberately.
  const agentIds = new Set(agentVerdicts.map((v) => v.nodeId));
  const warnings = [...pending.probeWarnings, ...vWarnings];
  const probeKept = pending.probeDecided.filter((v) => {
    if (agentIds.has(v.nodeId)) {
      warnings.push(`${v.nodeId}: judged by both probe and agent — the agent verdict is recorded`);
      return false;
    }
    return true;
  });

  const verdicts = [...probeKept, ...agentVerdicts];
  const judgedNodes = sampled.filter((n) => verdicts.some((v) => v.nodeId === n.id));
  const unjudged = sampled.length - judgedNodes.length;
  // Counted over NODES, not over verdict records: one node judged twice is still
  // one node judged, and judgedFraction is a disclosure field that must never
  // exceed 1.0.
  const judgedFraction = sampled.length === 0 ? null : judgedNodes.length / sampled.length;
  if (unjudged > 0) {
    warnings.push(`${unjudged} of ${sampled.length} sampled nodes were left unjudged — they carry no class and are absent from the ratio's denominator`);
  }
  // A partial run is disclosed as DATA, not only as prose in warnings[]: a
  // renderer that reads entries programmatically cannot grep a sentence.
  if (verdicts.length === 0) {
    warnings.push(
      'NO node carries a verdict — this target was recorded but never measured. It is excluded from totals.targetsMeasured and counted under totals.targetsUnjudged.',
    );
  } else if (unjudged > 0 && judgedFraction !== null) {
    warnings.push(
      `PARTIAL: this ratio rests on ${verdicts.length} of ${sampled.length} sampled nodes (judgedFraction ${judgedFraction.toFixed(3)}). It is a claim about the judged subset only.`,
    );
  }

  const probeDirs = pending.probeDirs?.length ? pending.probeDirs : resolveProbeDirs(opts.probeDirs);
  const libAfter = probeLibrarySize(probeDirs);
  const minted = Math.max(0, libAfter - (pending.probeLibrarySizeBefore ?? libAfter));
  const decidedByProbe = probeKept.length;
  const decidedByAgent = agentVerdicts.length;
  const recordMs = Date.now() - recordStart;
  const wallClockMs = Date.now() - pending.startedAtMs;
  const timing: EntryTiming = {
    cloneMs: pending.timing.cloneMs,
    gatherMs: pending.timing.gatherMs,
    probeMs: pending.timing.probeMs,
    recordMs,
    judgmentMs: Math.max(
      0,
      wallClockMs - pending.timing.cloneMs - pending.timing.gatherMs - pending.timing.probeMs - recordMs,
    ),
  };

  const economics: RunEconomics = {
    nodesTotal: pending.nodesTotal,
    nodesSampled: pending.nodesSampled,
    decidedByProbe,
    decidedByAgent,
    probesMinted: minted,
    probeLibrarySize: libAfter,
    tokensIn: estTokens(pending.payloadChars),
    tokensOut: estTokens(chars),
    tokensEstimated: true,
    wallClockMs,
  };

  const grounding = groundingRatio(verdicts);
  const report: Report = {
    target: target.name,
    revision: target.revision,
    generatedAt: new Date().toISOString(),
    nodes: sampled,
    verdicts,
    grounding,
    economics,
  };

  // NO REPORT FOR AN UNJUDGED TARGET — the same argument as the nothing-gathered
  // path in `next`, one step later. A Report must carry a GroundingRatio and
  // groundingRatio([]) is 0, so writing this file for a target where not one node
  // carries a verdict publishes 0.000 — the worst possible score — about a
  // repository nobody looked at. The honest artifact is the summary entry: status
  // recorded, ratio null, nodesJudged 0, counted under totals.targetsUnjudged.
  // Resume keys off that entry, so nothing needs the file to be terminal.
  const reportWritten = verdicts.length > 0;
  if (reportWritten) {
    writeJson(reportPathFor(name, mode), report);
  } else {
    warnings.push(
      `no ${reportPathFor(name, mode)} was written ON PURPOSE: a Report must carry a grounding ratio, and the only ratio zero verdicts could produce is 0.000 — a claim about a surface nobody judged`,
    );
  }

  const summary = loadSummary(opts.corpusPath, nodeCap);

  if (mode === 'repeat') {
    // Agreement is partitioned by PROVENANCE, and the headline is agent-vs-agent.
    //
    // A probe is a deterministic script over a pinned revision: re-running it
    // reproduces its verdict byte for byte. Counting those as "independent
    // re-judgment" does not measure judgment stability, it measures that
    // running the same program twice gives the same answer — and it drags the
    // published number toward 1.0 exactly as the probe library grows, which is
    // the direction that flatters us. So probe-vs-probe overlap is reported
    // separately and labelled trivial, mixed-provenance overlap (probe one run,
    // agent the other) is its own bucket because it is neither independent nor
    // deterministic, and only agent-vs-agent carries the stability claim.
    const first = readJson<Report>(reportPathFor(name, 'run'));
    const firstById = new Map(first.verdicts.map((v) => [v.nodeId, v]));
    const disagreements: RepeatDisagreement[] = [];
    const tally = {
      agent: { compared: 0, agreed: 0 },
      probe: { compared: 0, agreed: 0 },
      mixed: { compared: 0, agreed: 0 },
    };
    for (const v of verdicts) {
      const a = firstById.get(v.nodeId);
      if (!a) continue;
      const firstBy: 'probe' | 'agent' = a.decidedBy === 'probe' ? 'probe' : 'agent';
      const secondBy: 'probe' | 'agent' = v.decidedBy === 'probe' ? 'probe' : 'agent';
      const bucket =
        firstBy === 'agent' && secondBy === 'agent'
          ? tally.agent
          : firstBy === 'probe' && secondBy === 'probe'
            ? tally.probe
            : tally.mixed;
      bucket.compared++;
      if (a.class === v.class) bucket.agreed++;
      else {
        disagreements.push({
          nodeId: v.nodeId,
          first: a.class,
          second: v.class,
          firstDecidedBy: firstBy,
          secondDecidedBy: secondBy,
        });
      }
    }
    const pooledCompared = tally.agent.compared + tally.probe.compared + tally.mixed.compared;
    const pooledAgreed = tally.agent.agreed + tally.probe.agreed + tally.mixed.agreed;
    const rate = (t: { compared: number; agreed: number }) =>
      t.compared === 0 ? null : t.agreed / t.compared;

    const entry: RepeatabilityEntry = {
      name,
      comparedAt: new Date().toISOString(),
      comparedNodes: tally.agent.compared,
      agreed: tally.agent.agreed,
      agreement: rate(tally.agent),
      probeComparedNodes: tally.probe.compared,
      probeAgreed: tally.probe.agreed,
      probeAgreement: rate(tally.probe),
      mixedComparedNodes: tally.mixed.compared,
      mixedAgreed: tally.mixed.agreed,
      mixedAgreement: rate(tally.mixed),
      pooledComparedNodes: pooledCompared,
      pooledAgreed,
      pooledAgreement: pooledCompared === 0 ? null : pooledAgreed / pooledCompared,
      disagreements,
    };
    summary.repeatability = [...summary.repeatability.filter((r) => r.name !== name), entry];
    recomputeTotals(summary, targets);
    writeJson(SUMMARY_PATH, summary);
    if (!opts.keepClone) removeClone(pending.clonePath);
    retireState(name, 'repeat');
    console.log(
      reportWritten
        ? `corpus: repeat report → ${reportPathFor(name, 'repeat')}`
        : `corpus: no repeat report written — the repeat run judged nothing, and a ratio over zero verdicts is not a result`,
    );
    console.log(
      tally.agent.compared === 0
        ? `corpus: no node was judged by the AGENT in both runs — no independent-re-judgment number is defensible for ${name}`
        : `corpus: AGENT verdict agreement ${tally.agent.agreed}/${tally.agent.compared} = ${((tally.agent.agreed / tally.agent.compared) * 100).toFixed(1)}% (independent re-judgment of ${name})`,
    );
    if (tally.probe.compared > 0) {
      console.log(
        `  probe-vs-probe ${tally.probe.agreed}/${tally.probe.compared} — deterministic by construction, NOT evidence of stable judgment`,
      );
    }
    if (tally.mixed.compared > 0) {
      console.log(
        `  probe-vs-agent ${tally.mixed.agreed}/${tally.mixed.compared} — one side is a script and one is judgment; neither independent nor deterministic`,
      );
    }
    console.log(
      `  pooled (all provenances) ${pooledAgreed}/${pooledCompared} — recorded for audit, and it is NOT the stability claim`,
    );
    for (const d of disagreements) {
      console.log(`  disagree ${d.nodeId}: ${d.first} (${d.firstDecidedBy}) → ${d.second} (${d.secondDecidedBy})`);
    }
    return;
  }

  summary.runOrder = summary.runOrder.filter((n) => n !== name);
  summary.runOrder.push(name);
  upsertEntry(summary, {
    name: target.name,
    url: target.url,
    revision: target.revision,
    status: 'ok',
    runIndex: summary.runOrder.indexOf(name),
    recordedAt: new Date().toISOString(),
    ratio: grounding.anchored + grounding.selfReferential + grounding.unknown === 0 ? null : grounding.ratio,
    anchored: grounding.anchored,
    selfReferential: grounding.selfReferential,
    unknown: grounding.unknown,
    notACheck: grounding.notACheck,
    nodesTotal: pending.nodesTotal,
    nodesSampled: pending.nodesSampled,
    nodesJudged: verdicts.length,
    nodesUnjudged: unjudged,
    partial: unjudged > 0,
    judgedFraction,
    capped: pending.capped,
    coverageGathered: pending.coverageGathered,
    coverageJudged: coverageByKind(judgedNodes),
    probeShare: verdicts.length === 0 ? null : decidedByProbe / verdicts.length,
    economics,
    timing,
    warnings,
  });
  recomputeTotals(summary, targets);
  writeJson(SUMMARY_PATH, summary);

  if (!opts.keepClone) removeClone(pending.clonePath);
  // The stepper state is retired so it can never be replayed. A crash between
  // `next` and `record` used to leave a verdicts file that a later attempt
  // would silently consume, attributing this run's wall clock and tokens to
  // judgments made in an abandoned session.
  retireState(name, 'run');

  console.log(
    reportWritten
      ? `corpus: report → ${reportPathFor(name, 'run')}`
      : 'corpus: NO report written — not one node carries a verdict, so there is no ratio to publish (recorded under totals.targetsUnjudged)',
  );
  console.log(`corpus: summary → ${SUMMARY_PATH}`);
  console.log('');
  console.log(`  ${name} @ ${target.revision.slice(0, 12)}`);
  console.log(
    grounding.anchored + grounding.selfReferential + grounding.unknown === 0
      ? '  no classified edges — no ratio'
      : `  grounding ratio ${grounding.ratio.toFixed(3)}  ·  anchored ${grounding.anchored} of ${grounding.anchored + grounding.selfReferential + grounding.unknown} classified edges${unjudged > 0 && judgedFraction !== null ? `  ·  PARTIAL: ${verdicts.length}/${sampled.length} sampled nodes judged (${(judgedFraction * 100).toFixed(0)}%)` : ''}`,
  );
  console.log(`  self_referential ${grounding.selfReferential} · unknown ${grounding.unknown} · not_a_check ${grounding.notACheck} (excluded from the ratio)`);
  console.log(`  nodes gathered ${pending.nodesTotal} · sampled ${pending.nodesSampled}${pending.capped ? ' (CAPPED)' : ''} · judged ${verdicts.length} · unjudged ${unjudged}`);
  console.log(`  coverage (judged): ${JSON.stringify(coverageByKind(judgedNodes))}`);
  console.log(`  coverage (gathered): ${JSON.stringify(pending.coverageGathered)}`);
  console.log(`  probe-decided ${decidedByProbe} · agent-decided ${decidedByAgent} · probe library ${libAfter} (+${minted} this run)`);
  console.log(`  estimated tokens in ${economics.tokensIn} / out ${economics.tokensOut} · wall clock ${(wallClockMs / 1000).toFixed(1)}s`);
  for (const w of warnings) console.log(`  ! ${w}`);
  console.log('');
  console.log('  a ratio is a shape claim, not a quality claim: this says where the signal');
  console.log('  comes from, never whether the checks are any good.');
  console.log('');
  console.log('corpus: next → bun scripts/corpus.ts next');
}

// ---------------------------------------------------------------------------
// `status`
// ---------------------------------------------------------------------------

function cmdStatus(corpusPath: string): void {
  const { targets, nodeCap } = loadCorpus(corpusPath);
  const summary = loadSummary(corpusPath, nodeCap);
  const byName = new Map(summary.entries.map((e) => [e.name, e]));
  console.log(`corpus: ${corpusPath} · ${targets.length} targets · node cap ${nodeCap}`);
  console.log(`run order so far: ${summary.runOrder.length ? summary.runOrder.join(' → ') : '(none)'}`);
  console.log('');
  targets.forEach((t, i) => {
    const e = byName.get(t.name);
    // State comes from the entry. A report file with no entry means the summary
    // was lost, not that the target is unprocessed — see alreadyProcessed().
    const orphanReport = !e && existsSync(reportPathFor(t.name, 'run'));
    const state =
      e?.status === 'ok' && (e.nodesJudged ?? 0) === 0
        ? 'ok (unjudged)'
        : (e?.status ?? (orphanReport ? 'ok (no entry)' : 'pending'));
    const detail =
      e?.status === 'ok'
        ? `ratio ${e.ratio === null ? 'n/a' : e.ratio.toFixed(3)} · anchored ${e.anchored} · judged ${e.nodesJudged}/${e.nodesSampled} sampled of ${e.nodesTotal} gathered${e.partial ? ' · PARTIAL' : ''}`
        : e?.status === 'failed'
          ? `error: ${e.error}`
          : e?.status === 'nothing_gathered'
            ? 'nothing gathered — no report, no ratio'
            : '';
    console.log(`  ${String(i + 1).padStart(2)}. ${t.name.padEnd(24)} ${state.padEnd(18)} ${detail}`);
  });
  const tot = summary.totals;
  if (tot) {
    console.log('');
    console.log(
      `  measured ${tot.targetsMeasured ?? 0} · unjudged ${tot.targetsUnjudged ?? 0} · partial ${tot.targetsPartial ?? 0} · nothing gathered ${tot.targetsNothingGathered ?? 0} · failed ${tot.targetsFailed ?? 0}`,
    );
    console.log(
      `  nodes gathered ${tot.nodesTotal ?? 0} · sampled ${tot.nodesSampled ?? 0} · judged ${tot.nodesJudged ?? 0} · unjudged ${tot.nodesUnjudged ?? 0}`,
    );
  }
  if (summary.repeatability.length) {
    console.log('');
    for (const r of summary.repeatability) {
      if (r.error) {
        console.log(`  repeatability ${r.name}: failed — ${r.error}`);
        continue;
      }
      console.log(
        `  repeatability ${r.name}: AGENT ${r.agreed}/${r.comparedNodes} = ${r.agreement === null ? 'n/a' : `${(r.agreement * 100).toFixed(1)}%`}` +
          `  (probe ${r.probeAgreed ?? 0}/${r.probeComparedNodes ?? 0} deterministic · mixed ${r.mixedAgreed ?? 0}/${r.mixedComparedNodes ?? 0} · pooled ${r.pooledAgreed ?? 0}/${r.pooledComparedNodes ?? 0}, not the claim)`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `keel corpus — agent-driven corpus stepper

  bun scripts/corpus.ts next [options]          clone + gather + sample the next target, print payloads, stop
  bun scripts/corpus.ts next --repeat <name>    re-run a recorded target for a fresh, independent judgment
  bun scripts/corpus.ts record <name> [--repeat] merge verdicts, write report + summary, clean the clone
  bun scripts/corpus.ts status                  what is done, what is pending, what failed

options
  --corpus <path>      corpus file (default <repo>/corpus.json)
  --cap <n>            max nodes judged per target (default from corpus file, else ${DEFAULT_CAP})
  --batch <n>          nodes per printed batch (default ${DEFAULT_BATCH})
  --classify           dispatch probes via scripts/classify.ts; without it every node is pending
  --probe-dir <dir>    REPLACES the default probe dirs (repeatable, order preserved)
  --retry-failed       re-attempt targets with a recorded failure
  --force              start a target over even though an unrecorded verdicts file exists
  --keep-clone         leave the clone in place after record (debugging)

This is a repo-local development tool, not a user-facing skill command: it writes
clones and reports under the corpus workspace (KEEL_REPO_ROOT, else the directory
above the skill IF it holds a corpus.json, else the cwd).
`;

function parseArgs(argv: string[]): {
  cmd: string;
  arg: string | null;
  corpusPath: string;
  cap: number | null;
  batch: number;
  classify: boolean;
  probeDirs: string[];
  repeat: string | null;
  repeatFlag: boolean;
  retryFailed: boolean;
  keepClone: boolean;
  force: boolean;
} {
  const out = {
    cmd: '',
    arg: null as string | null,
    corpusPath: join(REPO_ROOT, 'corpus.json'),
    cap: null as number | null,
    batch: DEFAULT_BATCH,
    classify: false,
    probeDirs: [] as string[],
    repeat: null as string | null,
    repeatFlag: false,
    retryFailed: false,
    keepClone: false,
    force: false,
  };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--corpus': out.corpusPath = resolve(argv[++i] ?? ''); break;
      case '--cap': out.cap = Number(argv[++i]); break;
      case '--batch': out.batch = Number(argv[++i]); break;
      case '--classify': out.classify = true; break;
      case '--probe-dir': out.probeDirs.push(argv[++i] ?? ''); break;
      case '--retry-failed': out.retryFailed = true; break;
      case '--keep-clone': out.keepClone = true; break;
      case '--force': out.force = true; break;
      case '--repeat': {
        out.repeatFlag = true;
        const nxt = argv[i + 1];
        if (nxt && !nxt.startsWith('--')) out.repeat = argv[++i];
        break;
      }
      case '-h':
      case '--help': {
        console.log(USAGE);
        process.exit(0);
        break;
      }
      default: rest.push(a);
    }
  }
  out.cmd = rest[0] ?? '';
  out.arg = rest[1] ?? null;
  if (out.repeatFlag && !out.repeat && out.arg) out.repeat = out.arg;
  return out;
}

if (import.meta.main) {
  const a = parseArgs(process.argv.slice(2));
  // --cap gets the same validation --batch always had. `--cap 0` used to be
  // accepted and produced a zero-node payload: a target recorded with nothing
  // judged, which is the "measured" state nobody measured.
  if (a.cap !== null && (Number.isNaN(a.cap) || !Number.isFinite(a.cap) || a.cap < 1)) {
    die('--cap must be a positive number — a cap below 1 samples nothing and records a target nobody judged');
  }
  if (Number.isNaN(a.batch) || a.batch < 1) die('--batch must be a positive number');

  if (a.cmd === 'next') {
    await cmdNext({
      corpusPath: a.corpusPath,
      cap: a.cap,
      classify: a.classify,
      probeDirs: a.probeDirs,
      batchSize: a.batch,
      repeat: a.repeatFlag ? a.repeat : null,
      retryFailed: a.retryFailed,
      force: a.force,
    });
  } else if (a.cmd === 'record') {
    if (!a.arg) die('record needs a target name');
    cmdRecord(a.arg, {
      corpusPath: a.corpusPath,
      repeat: a.repeatFlag,
      probeDirs: a.probeDirs,
      keepClone: a.keepClone,
    });
  } else if (a.cmd === 'status') {
    cmdStatus(a.corpusPath);
  } else {
    console.log(USAGE);
    process.exit(a.cmd ? 1 : 0);
  }
}
