/**
 * The hack-night cohort report — Platanus Build Night Bogotá, 2026-07-24.
 *
 * Repo infrastructure, outside `skills/keel/` (the packaging boundary).
 *
 * This page is deliberately NOT a leaderboard. Every repository here was written
 * in one night by someone in the room, and a ranked table of named competitors
 * scored on verification quality is a different act from measuring mature
 * open-source projects. The cohort number is the finding; the per-repo rows are
 * evidence for it, ordered by node count rather than by score, and every one is
 * reported with the same disclosures the corpus gets.
 *
 * `--anon` replaces handles with `repo-01…repo-NN` (stable, ordered by name) for
 * any context where the aggregate is the point and attribution is not.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SRC = join(REPO, 'reports', 'hacknight');
const anon = process.argv.includes('--anon');
const OUT = join(REPO, 'site', 'reports', anon ? 'hacknight-anon' : 'hacknight');

if (!existsSync(SRC)) {
  console.error(`hacknight: no ${SRC}`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const css =
  readFileSync(join(REPO, 'skills/keel/design/tokens.css'), 'utf8') +
  '\n' +
  readFileSync(join(REPO, 'skills/keel/design/keel.css'), 'utf8');

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type Row = {
  name: string;
  label: string;
  anchored: number;
  selfRef: number;
  unknown: number;
  notACheck: number;
  judged: number;
  gathered: number;
  ratio: number | null;
  coverage: Record<string, number>;
};

const files = readdirSync(SRC).filter((f) => f.endsWith('.json')).sort();
const rows: Row[] = files.map((f, i) => {
  const r = JSON.parse(readFileSync(join(SRC, f), 'utf8'));
  const g = r.grounding;
  const den = g.anchored + g.selfReferential + g.unknown;
  const cov: Record<string, number> = {};
  for (const n of r.nodes ?? []) cov[n.kind] = (cov[n.kind] ?? 0) + 1;
  return {
    name: f.replace('.json', ''),
    label: anon ? `repo-${String(i + 1).padStart(2, '0')}` : f.replace('.json', ''),
    anchored: g.anchored,
    selfRef: g.selfReferential,
    unknown: g.unknown,
    notACheck: g.notACheck,
    judged: r.economics.nodesSampled,
    gathered: r.economics.nodesTotal,
    ratio: den === 0 ? null : g.ratio,
    coverage: cov,
  };
});

// Ordered by how much surface there was to measure, NOT by score. A table sorted
// by ratio is a ranking whatever the header says.
rows.sort((a, b) => b.gathered - a.gathered);

const A = rows.reduce((n, r) => n + r.anchored, 0);
const S = rows.reduce((n, r) => n + r.selfRef, 0);
const U = rows.reduce((n, r) => n + r.unknown, 0);
const N = rows.reduce((n, r) => n + r.notACheck, 0);
const D = A + S + U;
const pooled = D === 0 ? null : A / D;

const row = (r: Row) => `<tr>
  <td>${anon ? esc(r.label) : `<a href="${esc(r.name)}.html">${esc(r.label)}</a>`}</td>
  <td>${r.ratio === null ? '<em class="k-meta">no denominator</em>' : `<span class="k-ratio__value k-ratio__value--inline${D && r.anchored + r.selfRef + r.unknown < 10 ? ' k-ratio__value--thin' : ''}">${r.ratio.toFixed(3)}</span>`}</td>
  <td>${r.anchored} of ${r.anchored + r.selfRef + r.unknown}</td>
  <td>${r.selfRef}</td>
  <td>${r.unknown}</td>
  <td>${r.notACheck}</td>
  <td>${r.judged} judged<div class="k-meta">of ${r.gathered} gathered</div>
      <div>${Object.entries(r.coverage).map(([k, n]) => `<span class="k-tag">${esc(k)} ${n}</span>`).join(' ') || '—'}</div></td>
</tr>`;

const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Keel — one night of code, measured</title>
<style>${css}
.k-ratio__value--inline { font-size: var(--k-fs-h1); line-height: 1; }
.k-ratio__value--thin { color: var(--k-smell); }
.cohort-table td:first-child { max-width: 18em; }
</style>
</head>
<body>
<main class="k-report">
<header>
  <p class="k-eyebrow">Keel</p>
  <h1 class="k-display">One night of code, measured</h1>
  <p class="k-lede">Twenty-one repositories were built at Platanus Build Night Bogotá on
  2026-07-24. This is what their verification looked like the morning after, measured by
  the same tool, with the same rules, as a corpus of mature open-source projects.</p>
  <blockquote class="k-callout">A check is only a check if the signal it reads comes from
  somewhere the thing being checked cannot write to.</blockquote>
</header>

<h2 class="k-eyebrow">The cohort, against mature open source</h2>
${
  pooled === null
    ? '<p class="k-meta"><em>nothing gathered</em></p>'
    : `<div class="k-ratio">
  <span class="k-ratio__value">${pooled.toFixed(3)}</span>
  <p class="k-ratio__formula">anchored / (anchored + self_referential + unknown)</p>
  <div class="k-meter">
    <div class="k-meter__seg" data-class="anchored" style="width:${((A / D) * 100).toFixed(1)}%"></div>
    <div class="k-meter__seg" data-class="self_referential" style="width:${((S / D) * 100).toFixed(1)}%"></div>
    <div class="k-meter__seg" data-class="unknown" style="width:${((U / D) * 100).toFixed(1)}%"></div>
  </div>
  <div class="k-ratio__counts">
    <span class="k-ratio__count"><span class="k-class" data-class="anchored">anchored</span> ${A}</span>
    <span class="k-ratio__count"><span class="k-class" data-class="self_referential">self_referential</span> ${S}</span>
    <span class="k-ratio__count"><span class="k-class" data-class="unknown">unknown</span> ${U}</span>
    <span class="k-ratio__count k-ratio__count--excluded">
      <span class="k-class" data-class="not_a_check">not_a_check</span> ${N}
      <span class="k-meta">excluded from the denominator</span>
    </span>
  </div>
</div>`
}

<p class="k-meta">Mature open source, measured the same way, pooled
<strong>0.853</strong> over 143 classified edges. One night of code pooled
<strong>${pooled === null ? 'n/a' : pooled.toFixed(3)}</strong> over ${D}. That gap is the
result: the ratio separates young code from maintained code without being told which is
which.</p>

<p class="k-scope"><strong>Scope.</strong> Keel measures the shape of verification, not its
quality. A repo can be 100% anchored with terrible tests. Anchoring says the signal comes
from outside; it does not say the signal is sufficient. <strong>Nothing here is a judgement
of the projects or the people who built them.</strong> These were written in one night
against a deadline, and shipping something that works is the correct priority at hour four.
Wiring a gate is a Tuesday problem.</p>

<hr class="k-rule" />

<h2 class="k-eyebrow">What the cohort actually looks like</h2>
<p><strong>Eight of the twenty-one repositories have no verification surface at all</strong>
— nothing for the gatherer to find. Of the seven measured in depth,
<strong>not one has CI</strong>: no <code class="k-mono">.github/workflows</code>, no
pipeline, no hook that runs anything.</p>
<p>That single fact drives the number, and it is why
<code class="k-mono">unknown</code> (${U}) so far outweighs
<code class="k-mono">self_referential</code> (${S}) here, which is the inverse of the mature
corpus. These projects are not checking themselves in a circle. They have written tests and
typechecks that <em>nothing invokes</em> — so per
<a href="https://github.com/broomva/keel/blob/main/skills/keel/references/grounding-classes.md">the
rule Keel applies everywhere</a>, we classify the edge that actually blocks a merge, not the
file that could have. A test suite no pipeline runs is a test file, not a check, and the
honest verdict is that its fork point cannot be established.</p>

<hr class="k-rule" />

<h2 class="k-eyebrow">Three patterns worth more than the number</h2>

<h3>The receipt that lives inside the boundary it certifies</h3>
<p>One project built a genuine verification harness: it spawns each command, refuses to
write a receipt unless the exit code is zero, and stamps it with a workspace fingerprint.
Real effort at anchoring, more than most production repositories make. But the receipts
land in a JSON file in the working tree, and the gate that reads them only re-reads —
it never re-executes. <strong>A hand-appended receipt is indistinguishable from an earned
one.</strong> This is the thesis in the wild, in a repo that was clearly trying.</p>

<h3>The only real gate in a repo is an accident</h3>
<p>Another project has eight scripts named <code class="k-mono">check:*</code>. None of them
gates anything. Its single anchored edge is a <em>build</em> step that byte-scans the
produced artifact for leaked secrets and exits non-zero if it finds one. The author cannot
author that grep result, so a leaked key genuinely aborts the deploy. The checks named
"check" check nothing; the check that counts is not called one.</p>

<h3>The best-grounded test in either corpus, unwired</h3>
<p>A third compares a video's hand-authored captions against the same platform's
machine-generated ones and asserts better than 0.9 token agreement. The oracle is a third
party the authors cannot write to — a real differential test with a genuine fork point,
better grounded than anything in the mature corpus. Nothing runs it.</p>

<hr class="k-rule" />

<h2 class="k-eyebrow">By repository</h2>
<p class="k-meta">Ordered by how much surface there was to measure, <strong>not by
score</strong> — a table sorted by ratio is a ranking whatever its header says. Each row
carries its own counts and coverage, and a ratio over fewer than ten classified edges is
flagged thin, because at this size the decimals mean very little.</p>
<table class="k-table k-table--num cohort-table">
  <thead><tr>
    <th>repository</th><th>ratio</th><th>anchored</th>
    <th>self_referential</th><th>unknown</th><th>not_a_check</th><th>coverage (judged)</th>
  </tr></thead>
  <tbody>
${rows.map(row).join('\n')}
  </tbody>
</table>

<p class="k-meta">Sampled: up to 12 nodes per repository, judged by an agent tracing each
signal to its producer. Every verdict carries a written causal path; open a repository's
report to read them. <code class="k-mono">not_a_check</code> is excluded from the ratio,
which makes it the one shoppable class, so it is printed here for exactly that reason.
<code class="k-mono">unknown</code> fails closed and counts against the ratio.</p>

<footer class="k-econ">
  <div class="k-econ__stat"><span class="k-econ__value">${rows.length}</span>
    <span>repositories measured in depth</span></div>
  <div class="k-econ__stat"><span class="k-econ__value">8</span>
    <span>of 21 with no verification surface</span></div>
  <div class="k-econ__stat"><span class="k-econ__value">0</span>
    <span>of the measured seven with CI</span></div>
</footer>
</main>
</body>
</html>
`;

writeFileSync(join(OUT, 'index.html'), html, 'utf8');
if (!anon) {
  for (const f of readdirSync(SRC).filter((x) => x.endsWith('.html'))) {
    writeFileSync(join(OUT, f), readFileSync(join(SRC, f), 'utf8'), 'utf8');
  }
}
console.log(`hacknight: ${rows.length} repos → ${OUT}${anon ? ' (anonymised)' : ''}`);
console.log(`hacknight: pooled ${pooled === null ? 'n/a' : pooled.toFixed(3)} (${A}/${D}) · ${N} not_a_check excluded`);
