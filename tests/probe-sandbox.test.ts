/**
 * `probe-sandbox` — the only place probe code is allowed to run.
 *
 * The posture doc in that file makes specific, falsifiable claims. Claims about
 * a sandbox are exactly the kind of assertion this project exists to be
 * suspicious of, so the ones that can be executed are executed: the confinement
 * test below actually runs a hostile probe that tries to write to disk, and
 * checks the filesystem afterwards. The rest pin the mechanism (profile text,
 * env allowlist, dir resolution) that the confinement rests on.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ClassifyOutput } from '../skills/keel/schemas/keel.ts';
import {
  buildProfile,
  resolveProbeDirs,
  sandboxCommand,
  sanitizedEnv,
} from '../skills/keel/scripts/probe-sandbox.ts';
import { cleanupTrees, run, tree } from './helpers/tree.ts';

afterAll(cleanupTrees);

const SANDBOX = join(import.meta.dir, '..', 'skills', 'keel', 'scripts', 'probe-sandbox.ts');
const SHIPPED_PROBES = join(import.meta.dir, '..', 'skills', 'keel', 'probes');

const NODE = {
  id: 'synthetic#hostile',
  kind: 'ci_step' as const,
  name: 'hostile',
  source: 'synthetic.yml:1',
  raw: '- run: echo hostile',
};

describe('sanitizedEnv · no credential rides into a probe', () => {
  test('an API key in the environment does not survive, KEEL_* does', () => {
    const saved = { ...process.env };
    try {
      process.env.ANTHROPIC_API_KEY = 'sk-should-not-travel';
      process.env.AWS_SECRET_ACCESS_KEY = 'also-should-not-travel';
      process.env.KEEL_PROBE_DIR = '/tmp/keel-probes-test';
      const env = sanitizedEnv();
      expect(env.ANTHROPIC_API_KEY).toBeUndefined();
      expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
      expect(env.KEEL_PROBE_DIR).toBe('/tmp/keel-probes-test');
      expect(env.PATH).toBe(process.env.PATH as string);
      expect(env.HOME).toBe(process.env.HOME as string);
    } finally {
      process.env = saved;
    }
  });

  test('explicit extras win over the inherited environment', () => {
    expect(sanitizedEnv({ KEEL_SANDBOXED: '1' }).KEEL_SANDBOXED).toBe('1');
  });

  test('the allowlist is small enough to read', () => {
    // If this grows without anyone noticing, the "no API keys are inherited"
    // claim quietly stops being true.
    const keys = Object.keys(sanitizedEnv()).filter((k) => !k.startsWith('KEEL_'));
    for (const k of keys) {
      expect(['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'USER']).toContain(k);
    }
  });
});

describe('buildProfile · the seatbelt says what the doc says', () => {
  const profile = buildProfile();

  test('deny-default, with network denied outright', () => {
    expect(profile).toContain('(deny default)');
    expect(profile).toContain('(deny network*)');
  });

  test('credential directories are denied by absolute path', () => {
    const home = homedir();
    for (const p of ['.ssh', '.aws', '.gnupg', '.config/gh']) {
      expect(profile).toContain(JSON.stringify(join(home, p)));
    }
    expect(profile).toContain(JSON.stringify(join(home, '.netrc')));
  });

  test('only the running bun binary may be exec-ed', () => {
    expect(profile).toContain(`(allow process-exec (literal ${JSON.stringify(process.execPath)}))`);
  });

  test('no `allow file-write*` anywhere — writes are denied by the default', () => {
    expect(profile).not.toContain('file-write');
  });
});

describe('sandboxCommand · confinement is reported, never assumed', () => {
  test('KEEL_SANDBOX=0 degrades and says so', () => {
    const saved = process.env.KEEL_SANDBOX;
    try {
      process.env.KEEL_SANDBOX = '0';
      const { cmd, sandboxed, reason } = sandboxCommand(['x.ts']);
      expect(sandboxed).toBe(false);
      expect(reason).toBe('KEEL_SANDBOX=0');
      expect(cmd[0]).toBe(process.execPath);
    } finally {
      if (saved === undefined) delete process.env.KEEL_SANDBOX;
      else process.env.KEEL_SANDBOX = saved;
    }
  });

  test('where sandbox-exec exists the command is actually wrapped in it', () => {
    const saved = process.env.KEEL_SANDBOX;
    delete process.env.KEEL_SANDBOX;
    try {
      const { cmd, sandboxed, reason } = sandboxCommand(['x.ts']);
      if (process.platform === 'darwin' && existsSync('/usr/bin/sandbox-exec')) {
        expect(sandboxed).toBe(true);
        expect(cmd[0]).toBe('/usr/bin/sandbox-exec');
        expect(cmd).toContain('-f');
        expect(cmd).toContain(process.execPath);
      } else {
        // The degradation is never silent — it must carry a reason a human can
        // read in the report's warnings.
        expect(sandboxed).toBe(false);
        expect((reason ?? '').length).toBeGreaterThan(0);
      }
    } finally {
      if (saved !== undefined) process.env.KEEL_SANDBOX = saved;
    }
  });
});

describe('resolveProbeDirs · --probe-dir REPLACES the defaults', () => {
  test('with no flag, the default set is [shipped, user]', () => {
    const saved = process.env.KEEL_PROBE_DIR;
    try {
      process.env.KEEL_PROBE_DIR = '/tmp/keel-user-probes';
      const dirs = resolveProbeDirs([]);
      expect(dirs).toHaveLength(2);
      expect(dirs[0].endsWith(join('skills', 'keel', 'probes'))).toBe(true);
      expect(dirs[1]).toBe('/tmp/keel-user-probes');
    } finally {
      if (saved === undefined) delete process.env.KEEL_PROBE_DIR;
      else process.env.KEEL_PROBE_DIR = saved;
    }
  });

  test('a flag excludes the home library entirely — this is what isolates a run', () => {
    const dirs = resolveProbeDirs(['/tmp/only-this']);
    expect(dirs).toEqual(['/tmp/only-this']);
  });

  test('duplicates collapse and relative paths are absolutized', () => {
    const dirs = resolveProbeDirs(['/tmp/a', '/tmp/a', '.']);
    expect(dirs).toHaveLength(2);
    expect(dirs[0]).toBe('/tmp/a');
    expect(dirs[1].startsWith('/')).toBe(true);
  });
});

describe('probe-sandbox CLI · runs probe code and emits ClassifyOutput on stdout', () => {
  test('a real child process decides a node and prints parseable JSON', async () => {
    const probeDir = tree({
      'cli.v1.ts': `const probe = {
  id: 'cli', version: 1, mintedAt: '2026-07-24T00:00:00.000Z',
  mintedFrom: 'synthetic#test', description: 'decides the one synthetic node',
  match(node) { return node.id === ${JSON.stringify(NODE.id)}; },
  assess(node) {
    return { class: 'self_referential',
      writeBoundary: { producer: 'the test suite', actorCanWrite: true,
        argument: 'a synthetic verdict from the probe-sandbox CLI test' },
      evidence: [node.source], confidence: 0.8 };
  },
};
export default probe;
`,
    });
    const nodes = join(tree({ 'nodes.json': JSON.stringify([NODE]) }), 'nodes.json');

    const { code, stdout } = await run([process.execPath, SANDBOX, nodes, '--probe-dir', probeDir]);
    expect(code).toBe(0);
    const out = JSON.parse(stdout) as ClassifyOutput;
    expect(out.decided).toHaveLength(1);
    expect(out.decided[0].nodeId).toBe(NODE.id);
    expect(out.decided[0].decidedBy).toBe('probe');
    expect(out.pending).toEqual([]);
  });

  test('stdout carries JSON and nothing else — diagnostics go to stderr', async () => {
    const nodes = join(tree({ 'nodes.json': JSON.stringify([NODE]) }), 'nodes.json');
    const { stdout, stderr } = await run([
      process.execPath,
      SANDBOX,
      nodes,
      '--probe-dir',
      SHIPPED_PROBES,
    ]);
    expect(() => JSON.parse(stdout)).not.toThrow();
    expect(stderr).toContain('probe-sandbox');
  });

  test('a `{ nodes: [...] }` wrapper is accepted as well as a bare array', async () => {
    const nodes = join(
      tree({ 'nodes.json': JSON.stringify({ nodes: [NODE] }) }),
      'nodes.json',
    );
    const { stdout } = await run([process.execPath, SANDBOX, nodes, '--probe-dir', SHIPPED_PROBES]);
    const out = JSON.parse(stdout) as ClassifyOutput;
    expect(out.pending.map((n) => n.id)).toEqual([NODE.id]);
  });

  test('an unreadable node file still yields a valid ClassifyOutput, with the reason', async () => {
    // Total failure must hand every node to the agent, never invent a class.
    const nodes = join(tree({ 'nodes.json': '{"not":"nodes"}' }), 'nodes.json');
    const { stdout } = await run([process.execPath, SANDBOX, nodes]);
    const out = JSON.parse(stdout) as ClassifyOutput;
    expect(out.decided).toEqual([]);
    expect(out.warnings.join('\n')).toContain('probe-sandbox failed');
  });

  test('a missing node file exits 2 with usage, rather than pretending', async () => {
    const { code, stderr } = await run([process.execPath, SANDBOX, '/nonexistent/nodes.json']);
    expect(code).toBe(2);
    expect(stderr).toContain('usage:');
  });
});

describe('probe-sandbox CLI · confinement, executed', () => {
  const enforced = process.platform === 'darwin' && existsSync('/usr/bin/sandbox-exec');

  test.if(enforced)('a probe that tries to write to disk is stopped by the seatbelt', async () => {
    const target = join(tree({}), 'pwned.txt');
    const probeDir = tree({
      'hostile.v1.ts': `import { writeFileSync } from 'node:fs';
const probe = {
  id: 'hostile', version: 1, mintedAt: '2026-07-24T00:00:00.000Z',
  mintedFrom: 'synthetic#test', description: 'tries to write outside itself',
  match() { return true; },
  assess() {
    writeFileSync(${JSON.stringify(target)}, 'pwned');
    return null;
  },
};
export default probe;
`,
    });
    const nodes = join(tree({ 'nodes.json': JSON.stringify([NODE]) }), 'nodes.json');

    const { stdout } = await run([process.execPath, SANDBOX, nodes, '--probe-dir', probeDir]);
    const out = JSON.parse(stdout) as ClassifyOutput;

    // The claim under test: "no filesystem writes, anywhere".
    expect(existsSync(target)).toBe(false);
    // ...and the block surfaced as a warning rather than as a silent no-op.
    expect(out.warnings.join('\n')).toContain('assess() threw');
    expect(out.pending.map((n) => n.id)).toEqual([NODE.id]);
  });

  test.if(!enforced)('without sandbox-exec the degradation is stated in warnings', async () => {
    const nodes = join(tree({ 'nodes.json': JSON.stringify([NODE]) }), 'nodes.json');
    const { stdout } = await run([process.execPath, SANDBOX, nodes, '--probe-dir', SHIPPED_PROBES]);
    const out = JSON.parse(stdout) as ClassifyOutput;
    expect(out.warnings.join('\n')).toContain('sandbox NOT enforced');
  });
});
