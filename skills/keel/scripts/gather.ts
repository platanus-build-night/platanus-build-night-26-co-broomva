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

function walk(dir: string, out: string[] = [], depth = 0): string[] {
  if (depth > 6) return out;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.github' && e.name !== '.gitlab-ci.yml') {
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
// Config files that declare verification (test runners, hooks, linters)
// ---------------------------------------------------------------------------

const CONFIG_PATTERNS: Array<[RegExp, NodeKind, string]> = [
  [/^\.pre-commit-config\.ya?ml$/, 'review_gate', 'pre-commit hooks'],
  [/^(vitest|jest|playwright|cypress)\.config\.[jt]s$/, 'test_target', 'test runner config'],
  [/^pytest\.ini$|^tox\.ini$|^conftest\.py$/, 'test_target', 'pytest config'],
  [/^(biome|eslint|ruff)\.(json|jsonc|ya?ml|toml)$/, 'ci_step', 'linter config'],
  [/^\.golangci\.ya?ml$/, 'ci_step', 'linter config'],
  [/^codecov\.ya?ml$/, 'ci_step', 'coverage gate'],
  [/^renovate\.json$|^dependabot\.ya?ml$/, 'ci_step', 'dependency automation'],
  [/^CODEOWNERS$/, 'review_gate', 'code owners'],
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
      if (/^\.github\/workflows\/.+\.ya?ml$/.test(rel) || base === '.gitlab-ci.yml') {
        gatherWorkflow(f, rel, nodes);
      } else if (base === 'package.json' && !rel.includes('node_modules')) {
        gatherPackageJson(f, rel, nodes);
      } else if (base === 'Makefile' || base === 'makefile') {
        gatherMakefile(f, rel, nodes);
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
