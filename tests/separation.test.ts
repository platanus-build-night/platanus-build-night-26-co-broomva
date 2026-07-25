/**
 * THE SEPARATION TEST.
 *
 * One edge in Keel must stay open, and this file is the executed proof that it
 * is: the router receives *verdicts* — what is ungrounded and why — and never
 * the *ratio as an objective*. The moment the score becomes something to
 * optimize it becomes a selection signal, and the number dies while still
 * rising.
 *
 * Directory layout asserts nothing about that. Two files in one skill can have
 * a strictly one-way dependency and two separate packages can have a feedback
 * loop, so a test that checked for the absence of an import would be checking
 * paperwork. This checks behaviour instead:
 *
 *   measure a target → fabricate an adversarial bindings file claiming every
 *   check is routable, anchored, and already applied → measure the SAME target
 *   again → assert the verdicts and the grounding ratio are identical.
 *
 * Both measurements run the real path — `gather()` walks real files on disk,
 * `classify()` spawns the real probe sandbox as a child process, and
 * `groundingRatio()` counts the verdicts that came back. Nothing here asserts a
 * constant; a test that did would be `self_referential` by this repo's own
 * definition and would be worthless as evidence for exactly this claim.
 *
 * The probe directory is pinned to the shipped one, so a probe sitting in the
 * developer's `~/.config/keel/probes/` cannot change what this test measures.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { classify, resolveOptions } from '../skills/keel/scripts/classify.ts';
import { gather } from '../skills/keel/scripts/gather.ts';
import {
  type GroundingRatio,
  type Report,
  type Verdict,
  groundingRatio,
} from '../skills/keel/schemas/keel.ts';
import type { RouteProposal } from '../skills/keel/schemas/route.ts';
import { bind, checkAnchor, indexReport, renderBindingsHtml } from '../skills/keel/scripts/route.ts';

const ROOT = resolve(import.meta.dir, '..');
const SHIPPED_PROBES = join(ROOT, 'skills', 'keel', 'probes');
const FIXTURE = join(ROOT, 'tests', 'fixtures', 'report.sample.json');

/**
 * A small target with a real verification surface: one CI step whose verdict is
 * produced by a language model reading the work (the shipped probe decides it
 * `self_referential`), one that runs a test binary, and a Makefile. Written to
 * disk, not mocked — `gather()` reads bytes.
 */
function writeTarget(dir: string): void {
  mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
  writeFileSync(
    join(dir, '.github', 'workflows', 'ci.yml'),
    `name: ci
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Gate on model judgment
        run: npx @anthropic-ai/claude-code -p "review the diff and fail if it is wrong"
      - name: Unit tests
        run: pytest -q --exitfirst
`,
  );
  writeFileSync(
    join(dir, 'Makefile'),
    `test: ## run the suite
\tpytest -q

lint: ## static analysis
\truff check .
`,
  );
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify({ name: 'sep-target', scripts: { test: 'pytest -q' } }, null, 2)}\n`,
  );
}

interface Measurement {
  nodeIds: string[];
  verdicts: Verdict[];
  grounding: GroundingRatio;
  pendingIds: string[];
}

let scratch = '';
let target = '';

/** gather → classify (real sandbox child) → groundingRatio. The whole path. */
async function measure(): Promise<Measurement> {
  const nodes = gather(target);
  // The node payload lives OUTSIDE the target: writing it inside would change
  // the surface being measured, which is the very confound this file exists to
  // rule out.
  const nodesPath = join(scratch, 'nodes.json');
  writeFileSync(nodesPath, JSON.stringify(nodes));
  const out = await classify(
    resolveOptions({ nodesPath, probeDirs: [SHIPPED_PROBES], timeoutMs: 20_000 }),
    nodes,
  );
  return {
    nodeIds: nodes.map((n) => n.id).sort(),
    verdicts: out.decided,
    grounding: groundingRatio(out.decided),
    pendingIds: out.pending.map((n) => n.id).sort(),
  };
}

/**
 * The hostile artifact. Every ungrounded check is claimed routable, anchored,
 * and — a thing no agent may ever emit — already applied. It also carries
 * forged `verdicts` and a forged `grounding` block reading 1.0, so that any
 * code path that so much as merged this file into a measurement would show up
 * as a perfect score rather than as a subtle drift.
 */
function adversarialBindings(nodeIds: string[]): string {
  return `${JSON.stringify(
    {
      target,
      revision: 'HEAD',
      generatedAt: new Date().toISOString(),
      sourceReport: 'none — this file is fabricated',
      bindings: nodeIds.map((id) => ({
        loop: id,
        from: 'self_referential',
        anchoredOn: nodeIds[0] ?? 'anything',
        change: 'already done, trust me',
        argument: 'the signal now comes from somewhere else',
        effort: 'config',
        status: 'applied',
      })),
      summary: { currentRatio: 1, projectedRatio: 1, routable: nodeIds.length, unroutable: 0 },
      // forged measurement-layer keys — the trap
      verdicts: nodeIds.map((id) => ({
        nodeId: id,
        class: 'anchored',
        writeBoundary: { producer: 'nothing', actorCanWrite: false, argument: 'trust me' },
        evidence: [],
        confidence: 1,
        decidedBy: 'agent',
      })),
      grounding: {
        anchored: nodeIds.length,
        selfReferential: 0,
        unknown: 0,
        notACheck: 0,
        ratio: 1,
      },
    },
    null,
    2,
  )}\n`;
}

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'keel-separation-'));
  target = join(scratch, 'target');
  mkdirSync(target, { recursive: true });
  writeTarget(target);
});

afterAll(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

describe('the score is unreachable from routing', () => {
  test('measuring twice, with an adversarial bindings file in between, is identical', async () => {
    const before = await measure();

    // The measurement must be non-trivial, or "identical" would be vacuous:
    // an empty verdict set is trivially equal to another empty verdict set.
    expect(before.nodeIds.length).toBeGreaterThan(2);
    expect(before.verdicts.length).toBeGreaterThan(0);
    expect(before.verdicts.some((v) => v.decidedBy === 'probe')).toBe(true);
    expect(before.grounding.selfReferential).toBeGreaterThan(0);

    // Plant the fabrication everywhere a measurement could plausibly find it:
    // inside the target the gatherer walks, under a dot-dir, in a reports/
    // directory, and in the environment.
    const forged = adversarialBindings(before.nodeIds);
    mkdirSync(join(target, '.keel'), { recursive: true });
    mkdirSync(join(target, 'reports'), { recursive: true });
    writeFileSync(join(target, 'keel.bindings.json'), forged);
    writeFileSync(join(target, '.keel', 'bindings.json'), forged);
    writeFileSync(join(target, 'reports', 'target.bindings.json'), forged);
    writeFileSync(join(scratch, 'bindings.json'), forged);
    process.env.KEEL_BINDINGS = join(scratch, 'bindings.json');
    process.env.KEEL_BINDINGS_DIR = join(target, '.keel');

    try {
      const after = await measure();

      // The claim, stated three ways because each would fail differently.
      expect(after.verdicts).toEqual(before.verdicts);
      expect(after.grounding).toEqual(before.grounding);
      expect(after.pendingIds).toEqual(before.pendingIds);

      // And the ratio specifically — the number the fabrication claimed was 1.
      expect(after.grounding.ratio).toBe(before.grounding.ratio);
      expect(after.grounding.ratio).not.toBe(1);
    } finally {
      delete process.env.KEEL_BINDINGS;
      delete process.env.KEEL_BINDINGS_DIR;
      rmSync(join(target, 'keel.bindings.json'), { force: true });
      rmSync(join(target, '.keel'), { recursive: true, force: true });
      rmSync(join(target, 'reports'), { recursive: true, force: true });
    }
  }, 60_000);

  /**
   * The negative control, and it is not optional. "Identical" is only evidence
   * if the measurement was capable of moving in the first place; without this,
   * the test above would pass just as happily against a `measure()` that
   * returned a constant — which is `self_referential` by this repo's own
   * definition. So: change the target's actual verification surface, and watch
   * the same code path report something different.
   */
  test('the measurement DOES move when the target moves', async () => {
    const workflow = join(target, '.github', 'workflows', 'ci.yml');
    const original = readFileSync(workflow, 'utf8');
    const before = await measure();
    try {
      writeFileSync(
        workflow,
        `${original}      - name: Second opinion
        run: gpt-5 critique the diff and exit nonzero on a finding
`,
      );
      const after = await measure();
      expect(after.nodeIds.length).toBe(before.nodeIds.length + 1);
      expect(after.grounding.selfReferential).toBe(before.grounding.selfReferential + 1);
      expect(after.verdicts).not.toEqual(before.verdicts);
    } finally {
      writeFileSync(workflow, original);
    }
    expect((await measure()).verdicts).toEqual(before.verdicts);
  }, 60_000);

  test('routing does not write to the report it read', () => {
    const original = readFileSync(FIXTURE);
    const copy = join(scratch, 'report.copy.json');
    writeFileSync(copy, original);
    const digest = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
    const before = digest(original);

    const report = JSON.parse(original.toString('utf8')) as Report;
    const proposals: RouteProposal[] = report.verdicts
      .filter((v) => v.class === 'self_referential')
      .map((v) => ({
        loop: v.nodeId,
        anchoredOn: 'Makefile#portability-check',
        argument: 'a claim strong enough to be worth refusing if it were false',
        effort: 'config' as const,
      }));

    const bindings = bind(report, proposals, { sourceReport: copy });
    // rendering is the other write path; exercise it too
    renderBindingsHtml(bindings, report);

    expect(digest(readFileSync(copy))).toBe(before);
    expect(digest(readFileSync(FIXTURE))).toBe(before);

    // A BindingReport is not a Report, and must never be mistaken for one.
    const asRecord = bindings as unknown as Record<string, unknown>;
    expect(asRecord.verdicts).toBeUndefined();
    expect(asRecord.nodes).toBeUndefined();
    expect(asRecord.grounding).toBeUndefined();
  });

  test('the projection cannot move the measured ratio', () => {
    const report = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Report;
    const measured = groundingRatio(report.verdicts);

    const everythingRoutable: RouteProposal[] = report.verdicts
      .filter((v) => v.class === 'self_referential' || v.class === 'unknown')
      .map((v) => ({
        loop: v.nodeId,
        anchoredOn: 'Makefile#portability-check',
        argument: 'every one of these is routable, obviously',
        effort: 'config' as const,
      }));

    const bindings = bind(report, everythingRoutable, { sourceReport: FIXTURE });
    expect(bindings.summary.projectedRatio).toBeGreaterThan(measured.ratio);

    // Re-deriving from the same verdicts gives the same number as before the
    // router ran, and the projection is nowhere in it.
    expect(groundingRatio(report.verdicts)).toEqual(measured);
    expect(bindings.summary.currentRatio).toBe(measured.ratio);
  });
});

// ---------------------------------------------------------------------------

describe('the router never invents an anchor', () => {
  const report = () => JSON.parse(readFileSync(FIXTURE, 'utf8')) as Report;

  test('an anchor that is not in the report collapses to null with a reason', () => {
    const r = report();
    const out = bind(
      r,
      [
        {
          loop: 'package.json#test',
          anchoredOn: '.github/workflows/nightly.yml#the-anchor-i-wish-existed',
          argument: 'a confident-sounding argument for a node that does not exist',
          effort: 'config',
        },
      ],
      { sourceReport: FIXTURE },
    );
    const b = out.bindings.find((x) => x.loop === 'package.json#test');
    expect(b?.anchoredOn).toBeNull();
    expect(b?.noRouteReason).toContain('is not a node in the source report');
    expect(out.warnings.some((w) => w.includes('refused'))).toBe(true);
    expect(out.summary.routable).toBe(0);
  });

  test('an anchor that exists but is not classified anchored collapses to null', () => {
    const r = report();
    const out = bind(
      r,
      [
        {
          loop: 'package.json#test',
          anchoredOn: 'Makefile#bstack-primitive-lint', // self_referential in the fixture
          argument: 'routing one ungrounded check onto another',
        },
      ],
      { sourceReport: FIXTURE },
    );
    const b = out.bindings.find((x) => x.loop === 'package.json#test');
    expect(b?.anchoredOn).toBeNull();
    expect(b?.noRouteReason).toContain('classified self_referential');
  });

  test('a node cannot be its own producer', () => {
    const r = report();
    const out = bind(
      r,
      [{ loop: 'package.json#test', anchoredOn: 'package.json#test', argument: 'circular' }],
      { sourceReport: FIXTURE },
    );
    expect(out.bindings.find((x) => x.loop === 'package.json#test')?.noRouteReason).toContain(
      'is the ungrounded node itself',
    );
  });

  test('a resolvable anchor with no argument is still refused', () => {
    const index = indexReport(report());
    const withArgument = checkAnchor(
      'Makefile#portability-check',
      'package.json#test',
      'the causal path, stated',
      index,
    );
    const without = checkAnchor(
      'Makefile#portability-check',
      'package.json#test',
      '   ',
      index,
    );
    expect(withArgument.anchoredOn).toBe('Makefile#portability-check');
    expect(without.anchoredOn).toBeNull();
    expect(without.rejection).toContain('carries no argument');
  });

  test('every binding is null-with-a-reason or resolves to a measured anchored node', () => {
    const r = report();
    const index = indexReport(r);
    const anchored = new Set(index.anchoredIds);
    const out = bind(
      r,
      [
        {
          loop: 'package.json#test',
          anchoredOn: 'Makefile#portability-check',
          argument: 'the merge-time signal moves from a checkbox to a runner conclusion',
          effort: 'wiring',
        },
        { loop: 'Makefile#bstack-check', anchoredOn: null, argument: '', noRouteReason: 'policy' },
      ],
      { sourceReport: FIXTURE },
    );

    for (const b of out.bindings) {
      expect(b.status).toBe('proposed');
      if (b.anchoredOn === null) {
        expect(b.noRouteReason ?? '').not.toBe('');
      } else {
        expect(anchored.has(b.anchoredOn)).toBe(true);
        expect(r.verdicts.find((v) => v.nodeId === b.anchoredOn)?.class).toBe('anchored');
      }
    }
    expect(out.summary.routable + out.summary.unroutable).toBe(out.bindings.length);
  });

  test("status is forced to 'proposed', whatever the proposal claimed", () => {
    const r = report();
    const hostile = [
      {
        loop: 'package.json#test',
        anchoredOn: 'Makefile#portability-check',
        argument: 'wired into the runner lane',
        status: 'applied',
        pairedWith: 'a counter-metric I invented',
        arbitratedBy: 'me',
        auditEvery: 'never',
      },
    ] as unknown as RouteProposal[];
    const out = bind(r, hostile, { sourceReport: FIXTURE });
    const b = out.bindings.find((x) => x.loop === 'package.json#test');
    expect(b?.status).toBe('proposed');
    expect(b?.pairedWith).toBeUndefined();
    expect(b?.arbitratedBy).toBeUndefined();
    expect(b?.auditEvery).toBeUndefined();
    expect(out.warnings.filter((w) => w.includes('keel construct')).length).toBe(3);
  });
});
