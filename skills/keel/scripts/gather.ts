#!/usr/bin/env bun
/**
 * keel gather — locate candidate verification edges in a target.
 *
 * This step is MECHANICAL. It finds surfaces; it does not judge them.
 * Judgment is agentic (see SKILL.md §2) and happens over `raw`, never over a
 * summary produced here — a summary is already a judgment, and a judgment made
 * by the gatherer is a rule table by another name.
 *
 * Deliberately dependency-free. We do not fully parse YAML: we locate steps and
 * carry their literal text forward. Faithful beats clever here.
 *
 *   bun scripts/gather.ts <target-dir> [--json]
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import type { Node, NodeKind } from '../schemas/keel.ts';

const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'target', 'vendor',
  '__pycache__', '.venv', 'venv', '.next', '.turbo', 'coverage',
]);

/**
 * Dot-directories we descend into anyway. Everything else beginning with `.`
 * is skipped, so a CI provider that hides its config in one is INVISIBLE until
 * it is listed here — which is how the whole Ruby ecosystem was being scored
 * near-zero (`.circleci/`) while its checks sat in plain sight.
 */
const DOT_DIRS_ALLOWED = new Set(['.github', '.circleci']);

function walk(dir: string, out: string[] = [], depth = 0): string[] {
  if (depth > 6) return out;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && !DOT_DIRS_ALLOWED.has(e.name)) {
      if (e.isDirectory()) continue;
    }
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(join(dir, e.name), out, depth + 1);
    } else {
      out.push(join(dir, e.name));
    }
  }
  return out;
}

function mkId(source: string, slug: string): string {
  const clean = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${source}#${clean || 'step'}`;
}

// ---------------------------------------------------------------------------
// GitHub Actions / GitLab CI — step-level extraction.
//
// We segment on list items and carry each step's literal block. No YAML parse:
// a workflow that we half-understand is worse than a workflow we quote exactly.
// ---------------------------------------------------------------------------

function gatherWorkflow(path: string, rel: string, nodes: Node[]): void {
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n');

  let cur: string[] = [];
  let curStart = 0;
  let curIndent = -1;

  const flush = () => {
    if (!cur.length) return;
    const raw = cur.join('\n').trimEnd();
    // A step is interesting if it runs something or invokes an action.
    // The `-?` is load-bearing: `- uses: x` puts a list dash between the
    // indent and the key, and \s* cannot cross it.
    if (/(^|\n)\s*-?\s*(run|uses)\s*:/.test(raw)) {
      const nameMatch = raw.match(/^\s*-?\s*name\s*:\s*(.+)$/m);
      const usesMatch = raw.match(/^\s*-?\s*uses\s*:\s*(.+)$/m);
      const runMatch = raw.match(/^\s*-?\s*run\s*:\s*(.+)$/m);
      const name =
        nameMatch?.[1]?.trim().replace(/^["']|["']$/g, '') ??
        usesMatch?.[1]?.trim() ??
        runMatch?.[1]?.trim().slice(0, 60) ??
        'step';
      nodes.push({
        id: mkId(rel, `${curStart}-${name}`),
        kind: 'ci_step',
        name,
        source: `${rel}:${curStart}`,
        raw,
        hints: usesMatch ? { action: usesMatch[1].trim() } : undefined,
      });
    }
    cur = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^(\s*)-\s/);
    if (m) {
      const indent = m[1].length;
      if (curIndent === -1 || indent <= curIndent) {
        flush();
        curIndent = indent;
        curStart = i + 1;
      }
      cur.push(line);
    } else if (cur.length) {
      const indent = line.match(/^(\s*)/)![1].length;
      if (line.trim() === '' || indent > curIndent) cur.push(line);
      else {
        flush();
        curIndent = -1;
      }
    }
  }
  flush();
}

// ---------------------------------------------------------------------------
// package.json scripts
// ---------------------------------------------------------------------------

function gatherPackageJson(path: string, rel: string, nodes: Node[]): void {
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return;
  }
  const scripts = pkg.scripts as Record<string, string> | undefined;
  if (!scripts) return;
  for (const [name, cmd] of Object.entries(scripts)) {
    nodes.push({
      id: mkId(rel, name),
      kind: 'script',
      name,
      source: rel,
      raw: `"${name}": "${cmd}"`,
    });
  }
}

// ---------------------------------------------------------------------------
// Makefile targets
// ---------------------------------------------------------------------------

function gatherMakefile(path: string, rel: string, nodes: Node[]): void {
  const lines = readFileSync(path, 'utf8').split('\n');
  let cur: string[] = [];
  let name = '';
  let start = 0;

  const flush = () => {
    if (name && cur.length) {
      nodes.push({
        id: mkId(rel, name),
        kind: 'script',
        name,
        source: `${rel}:${start}`,
        raw: cur.join('\n').trimEnd(),
      });
    }
    cur = [];
    name = '';
  };

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].match(/^([a-zA-Z0-9_.-]+)\s*:(?!=)/);
    // `.PHONY` and friends are Make DIRECTIVES, not targets. Skipping them is
    // parsing, not judging — they cannot be a verification edge in any repo.
    if (t && t[1].startsWith('.')) {
      flush();
      continue;
    }
    if (t) {
      flush();
      name = t[1];
      start = i + 1;
      cur.push(lines[i]);
    } else if (name && (lines[i].startsWith('\t') || lines[i].trim() === '')) {
      cur.push(lines[i]);
    } else if (name) {
      flush();
    }
  }
  flush();
}

// ---------------------------------------------------------------------------
// pyproject.toml — where modern Python repos declare their verification.
// Same posture as the workflow gatherer: no TOML parse, locate the sections
// that declare checks and carry the literal block forward.
// ---------------------------------------------------------------------------

const PYPROJECT_SECTIONS: Array<[RegExp, NodeKind, string]> = [
  [/^tool\.pytest(\..*)?$/, 'test_target', 'pytest config'],
  [/^tool\.tox(\..*)?$/, 'test_target', 'tox config'],
  [/^tool\.(ruff|mypy|pyright|flake8|isort)(\..*)?$/, 'ci_step', 'linter/type-checker config'],
  [/^tool\.coverage(\..*)?$/, 'ci_step', 'coverage config'],
];

function gatherPyproject(path: string, rel: string, nodes: Node[]): void {
  const lines = readFileSync(path, 'utf8').split('\n');
  let section = '';
  let cur: string[] = [];
  let start = 0;
  let kind: NodeKind | null = null;
  let label = '';

  const flush = () => {
    if (kind && cur.length) {
      nodes.push({
        id: mkId(rel, section),
        kind,
        name: `${label} ([${section}])`,
        source: `${rel}:${start}`,
        raw: cur.join('\n').trimEnd(),
      });
    }
    cur = [];
    kind = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^\[([^\]]+)\]/);
    if (h) {
      flush();
      section = h[1];
      start = i + 1;
      for (const [re, k, l] of PYPROJECT_SECTIONS) {
        if (re.test(section)) {
          kind = k;
          label = l;
          break;
        }
      }
      if (kind) cur.push(lines[i]);
    } else if (kind) {
      cur.push(lines[i]);
    }
  }
  flush();
}

// ---------------------------------------------------------------------------
// Rakefile targets — Ruby's Make. Same role, different surface.
//
// We take `task :name` only. Task-defining DSLs (RDoc::Task.new and friends)
// are deliberately NOT matched: guessing at what a gem's DSL declares would be
// judging, and this file does not judge.
// ---------------------------------------------------------------------------

function gatherRakefile(path: string, rel: string, nodes: Node[]): void {
  const lines = readFileSync(path, 'utf8').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)task\s+:?["']?([A-Za-z0-9_]+)/);
    if (!m) continue;

    const [, indent, name] = m;
    const start = i + 1;
    const cur = [lines[i]];

    // A `do` block runs to its matching `end` at the same indentation.
    // Without one, the task is a single-line declaration (`task default: :spec`).
    if (/\bdo\b/.test(lines[i])) {
      const closer = new RegExp(`^${indent}end\\s*$`);
      for (let j = i + 1; j < lines.length; j++) {
        cur.push(lines[j]);
        if (closer.test(lines[j])) {
          i = j;
          break;
        }
      }
    }

    nodes.push({
      id: mkId(rel, name),
      kind: 'script',
      name,
      source: `${rel}:${start}`,
      raw: cur.join('\n').trimEnd(),
    });
  }
}

// ---------------------------------------------------------------------------
// Travis CI — command keys, scalar or list.
//
// Travis does not use `- run:`, so the workflow segmenter cannot see it: the
// commands hang off well-known top-level keys instead.
// ---------------------------------------------------------------------------

const TRAVIS_KEYS = ['install', 'before_install', 'before_script', 'script', 'after_script'];

function gatherTravis(path: string, rel: string, nodes: Node[]): void {
  const lines = readFileSync(path, 'utf8').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([a-z_]+)\s*:\s*(.*)$/);
    if (!m || !TRAVIS_KEYS.includes(m[1])) continue;

    const key = m[1];
    const start = i + 1;
    const cur = [lines[i]];

    // Scalar form (`script: bundle exec rspec`) ends on its own line; list form
    // continues through the indented `- ` items beneath it.
    if (m[2].trim() === '') {
      for (let j = i + 1; j < lines.length; j++) {
        if (!/^\s+\S/.test(lines[j]) && lines[j].trim() !== '') break;
        cur.push(lines[j]);
        i = j;
      }
    }

    nodes.push({
      id: mkId(rel, key),
      kind: 'ci_step',
      name: key,
      source: `${rel}:${start}`,
      raw: cur.join('\n').trimEnd(),
    });
  }
}

// ---------------------------------------------------------------------------
// Config files that declare verification (test runners, hooks, linters)
// ---------------------------------------------------------------------------

const CONFIG_PATTERNS: Array<[RegExp, NodeKind, string]> = [
  [/^\.pre-commit-config\.ya?ml$/, 'review_gate', 'pre-commit hooks'],
  [/^(vitest|jest|playwright|cypress)\.config\.[jt]s$/, 'test_target', 'test runner config'],
  [/^pytest\.ini$|^tox\.ini$|^conftest\.py$/, 'test_target', 'pytest config'],
  [/^(biome|eslint|ruff)\.(json|jsonc|ya?ml|toml)$/, 'ci_step', 'linter config'],
  [/^\.golangci\.ya?ml$/, 'ci_step', 'linter config'],
  [/^\.rubocop\.ya?ml$/, 'ci_step', 'linter config'],
  [/^\.rspec$/, 'test_target', 'rspec config'],
  [/^codecov\.ya?ml$/, 'ci_step', 'coverage gate'],
  [/^renovate\.json$|^dependabot\.ya?ml$/, 'ci_step', 'dependency automation'],
  [/^CODEOWNERS$/, 'review_gate', 'code owners'],
  [/^(vercel|now)\.json$|^netlify\.toml$|^fly\.toml$|^wrangler\.(toml|jsonc?)$|^render\.ya?ml$/, 'deploy_gate', 'deploy config'],
  [/^\.releaserc(\.(json|ya?ml|js|cjs))?$|^release\.config\.[cm]?js$/, 'deploy_gate', 'release automation'],
];

function gatherConfig(path: string, rel: string, nodes: Node[]): void {
  const base = basename(path);
  for (const [re, kind, label] of CONFIG_PATTERNS) {
    if (!re.test(base)) continue;
    const raw = readFileSync(path, 'utf8').slice(0, 4000);
    nodes.push({
      id: mkId(rel, base),
      kind,
      name: `${label} (${base})`,
      source: rel,
      raw,
    });
    return;
  }
}

// ---------------------------------------------------------------------------

export function gather(target: string): Node[] {
  const nodes: Node[] = [];
  const files = walk(target);

  for (const f of files) {
    const rel = relative(target, f);
    const base = basename(f);

    try {
      if (
        /^\.github\/workflows\/.+\.ya?ml$/.test(rel) ||
        /^\.circleci\/.+\.ya?ml$/.test(rel) ||
        base === '.gitlab-ci.yml'
      ) {
        // CircleCI segments on `- run:` exactly like Actions does, so the same
        // literal-carrying segmenter reads both without special-casing.
        // Glob rather than `config.yml` exactly: .circleci/ can hold more.
        gatherWorkflow(f, rel, nodes);
      } else if (base === '.travis.yml') {
        gatherTravis(f, rel, nodes);
      } else if (base === 'package.json' && !rel.includes('node_modules')) {
        gatherPackageJson(f, rel, nodes);
      } else if (base === 'pyproject.toml') {
        gatherPyproject(f, rel, nodes);
      } else if (base === 'Makefile' || base === 'makefile') {
        gatherMakefile(f, rel, nodes);
      } else if (base === 'Rakefile' || base === 'rakefile') {
        gatherRakefile(f, rel, nodes);
      } else {
        if (statSync(f).size < 200_000) gatherConfig(f, rel, nodes);
      }
    } catch {
      // a file we cannot read is not a verification edge we can classify.
      // silence here is correct; `unknown` is for edges we FOUND but cannot trace.
    }
  }

  return nodes;
}

if (import.meta.main) {
  const target = process.argv[2];
  if (!target || !existsSync(target)) {
    console.error('usage: bun scripts/gather.ts <target-dir> [--json]');
    process.exit(1);
  }
  const nodes = gather(target);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(nodes, null, 2));
  } else {
    const byKind = nodes.reduce<Record<string, number>>((a, n) => {
      a[n.kind] = (a[n.kind] ?? 0) + 1;
      return a;
    }, {});
    console.log(`gathered ${nodes.length} candidate verification edges from ${target}\n`);
    for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(v).padStart(4)}  ${k}`);
    }
    console.log('\nnothing here is classified yet — that is the agent\'s job.');
  }
}
