/**
 * Publish the corpus to `site/reports/` — W2·H, orchestrator-owned.
 *
 * Repo infrastructure, deliberately OUTSIDE `skills/keel/`: that directory is the
 * packaging boundary and everything in it ships into every user's skill store. A
 * publishing script for this one repo's GitHub Pages site is not part of the skill.
 *
 * Reads `reports/corpus-summary.json` + `reports/<name>.json`, shells out to the skill's
 * own `render.ts` for each per-repo artifact (so the published HTML is the same artifact a
 * user gets locally — no second renderer to drift), and writes an index.
 *
 * The invariants the index must not break, because they are the product:
 *   - a ratio NEVER travels alone: absolute anchored count and coverage sit beside it
 *   - `not_a_check` is shown, and shown as EXCLUDED from the denominator
 *   - a target that gathered nothing renders "nothing gathered", never `0.000`
 *   - a sampled target discloses nodesSampled vs nodesTotal
 *   - failures are listed, not silently dropped — a corpus that hides its misses is
 *     shopping its own denominator
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const REPORTS = join(REPO, 'reports');
const OUT = join(REPO, 'site', 'reports');
const SUMMARY = join(REPORTS, 'corpus-summary.json');

if (!existsSync(SUMMARY)) {
  console.error(`publish: no ${SUMMARY} — run the corpus first`);
  process.exit(1);
}

const summary = JSON.parse(readFileSync(SUMMARY, 'utf8'));
mkdirSync(OUT, { recursive: true });

const css = readFileSync(join(REPO, 'skills/keel/design/tokens.css'), 'utf8') +
  '\n' + readFileSync(join(REPO, 'skills/keel/design/keel.css'), 'utf8');

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// --- render each per-repo report through the skill's own renderer -------------
const rendered: string[] = [];
const failedRender: string[] = [];
for (const e of summary.entries ?? []) {
  const src = join(REPORTS, `${e.name}.json`);
  if (!existsSync(src)) continue;
  const dst = join(OUT, `${e.name}.html`);
  const r = Bun.spawnSync({
    cmd: ['bun', join(REPO, 'skills/keel/scripts/render.ts'), src, '-o', dst],
    cwd: join(REPO, 'skills/keel'),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (r.exitCode === 0 && existsSync(dst)) rendered.push(e.name);
  else {
    failedRender.push(e.name);
    console.error(`publish: render failed for ${e.name}: ${new TextDecoder().decode(r.stderr).slice(0, 300)}`);
  }
}

// --- the curve, if G has produced one ----------------------------------------
let curve = '';
const curveSvg = join(REPORTS, 'curve.svg');
if (existsSync(curveSvg)) {
  curve = `<section class="k-section"><h2>Crystallization curve</h2>
<p class="k-note">Cost per node against corpus run index. The run order is part of the
measurement — the curve is a claim about ordered probe accumulation, so a reshuffle
changes it by design. If cost per node does not fall, that is published as-is.</p>
${readFileSync(curveSvg, 'utf8')}</section>`;
} else {
  curve = `<section class="k-section"><h2>Crystallization curve</h2>
<p class="k-note">Not yet produced for this run.</p></section>`;
}

// --- the ratio table ---------------------------------------------------------
const ok = (summary.entries ?? []).filter((e: any) => e.status === 'ok');
const bad = (summary.entries ?? []).filter((e: any) => e.status !== 'ok');

function row(e: any): string {
  const judged = e.nodesJudged ?? 0;
  const classified = (e.anchored ?? 0) + (e.selfReferential ?? 0) + (e.unknown ?? 0);
  // A ratio over zero classified edges is not a result — say so instead of printing 0.000.
  const ratioCell =
    classified === 0
      ? `<span class="k-nothing">nothing gathered</span>`
      : `<strong class="k-ratio-inline">${(e.ratio ?? 0).toFixed(3)}</strong>`;
  const cap =
    e.nodesSampled != null && e.nodesTotal != null && e.nodesSampled !== e.nodesTotal
      ? `<span class="k-cap">sampled ${e.nodesSampled} of ${e.nodesTotal}</span>`
      : '';
  const cov = Object.entries(e.coverageByKind ?? e.coverage ?? {})
    .map(([k, n]) => `${esc(k)} ${n}`)
    .join(' · ');
  return `<tr>
  <td><a href="${esc(e.name)}.html">${esc(e.name)}</a>
      <div class="k-sub k-mono">${esc((e.revision ?? '').slice(0, 12))}</div></td>
  <td class="k-num">${ratioCell}</td>
  <td class="k-num">${e.anchored ?? 0} of ${classified}</td>
  <td class="k-num">${e.selfReferential ?? 0}</td>
  <td class="k-num">${e.unknown ?? 0}</td>
  <td class="k-num k-inert">${e.notACheck ?? 0}</td>
  <td class="k-sub">${judged} judged ${cap}<div class="k-sub">${cov}</div></td>
</tr>`;
}

const totalAnchored = ok.reduce((n: number, e: any) => n + (e.anchored ?? 0), 0);
const totalClassified = ok.reduce(
  (n: number, e: any) => n + (e.anchored ?? 0) + (e.selfReferential ?? 0) + (e.unknown ?? 0),
  0
);
const totalNotACheck = ok.reduce((n: number, e: any) => n + (e.notACheck ?? 0), 0);
const pooled = totalClassified === 0 ? null : totalAnchored / totalClassified;

const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Keel — corpus grounding ratios</title>
<style>${css}
.k-num{text-align:right;white-space:nowrap}
.k-inert{color:var(--k-not-a-check)}
.k-sub{font-size:var(--k-fs-0);color:var(--k-ink-2)}
.k-cap{display:inline-block;margin-left:var(--k-s-2);color:var(--k-unknown)}
.k-nothing{color:var(--k-ink-2);font-style:italic}
.k-ratio-inline{font-size:var(--k-fs-3);font-variant-numeric:tabular-nums}
table{width:100%;border-collapse:collapse}
th,td{padding:var(--k-s-2);border-bottom:1px solid var(--k-rule);vertical-align:top}
th{text-align:left;font-size:var(--k-fs-0);color:var(--k-ink-2);text-transform:uppercase;letter-spacing:.08em}
th.k-num{text-align:right}
</style>
</head>
<body class="k-page">
<main class="k-wrap">
<header class="k-hero">
  <h1>Keel — corpus grounding ratios</h1>
  <p class="k-lede">Every verification edge in each repository below was classified by who
  produces the signal, and whether the actor being verified can write to that producer.
  <strong>A check is only a check if the signal it reads comes from somewhere the thing
  being checked cannot write to.</strong></p>
  <p class="k-note k-mono">generated ${esc(summary.generatedAt ?? '')} ·
  ${ok.length} target(s) measured${bad.length ? ` · ${bad.length} failed` : ''}</p>
</header>

<section class="k-section">
  <h2>Pooled across the corpus</h2>
  <p class="k-ratio-block">
    ${pooled === null ? '<span class="k-nothing">nothing gathered</span>' : `<strong>${pooled.toFixed(3)}</strong>`}
    <span class="k-note">= ${totalAnchored} anchored / ${totalClassified} classified edges
    across ${ok.length} repositories · ${totalNotACheck} <span class="k-inert">not_a_check</span>
    excluded from the denominator</span>
  </p>
  <p class="k-note"><strong>Scope.</strong> Keel measures the shape of verification, not its
  quality. A repo can be 100% anchored with terrible tests. Anchoring says the signal comes
  from outside; it does not say the signal is sufficient.</p>
  <p class="k-note">The pooled figure weights repositories by how many edges each
  contributed, so it is not the mean of the column below. Both are reported because neither
  alone is honest: the mean hides size, the pooled figure hides spread.</p>
</section>

<section class="k-section">
  <h2>By repository</h2>
  <table>
    <thead><tr>
      <th>target</th><th class="k-num">ratio</th><th class="k-num">anchored</th>
      <th class="k-num">self_ref</th><th class="k-num">unknown</th>
      <th class="k-num">not_a_check</th><th>coverage (judged)</th>
    </tr></thead>
    <tbody>
${ok.map(row).join('\n')}
    </tbody>
  </table>
  <p class="k-note"><code class="k-mono">not_a_check</code> is excluded from the ratio
  entirely, which makes it the one <em>shoppable</em> class: mis-filing a real check there
  shrinks the denominator and inflates the score. It is printed here for exactly that
  reason. <code class="k-mono">unknown</code> fails closed and counts against the ratio
  like <code class="k-mono">self_referential</code>.</p>
</section>

${curve}

${
  bad.length
    ? `<section class="k-section"><h2>Targets that failed</h2>
<p class="k-note">Listed rather than dropped. A corpus that quietly omits what it could not
measure is shopping its own denominator.</p>
<ul>${bad.map((e: any) => `<li class="k-mono">${esc(e.name)} — ${esc(e.error ?? e.status)}</li>`).join('')}</ul>
</section>`
    : ''
}

<section class="k-section">
  <h2>Reproducing this</h2>
  <p class="k-note">Every target is pinned to a revision (shown under its name). The corpus
  ran sequentially in a recorded order, because the crystallization curve measures ordered
  probe-library growth and a parallel run would destroy the signal being measured.</p>
  <pre class="k-mono k-pre">npx skills add broomva/keel</pre>
</section>

<footer class="k-foot">
  <p class="k-note">Run order: <span class="k-mono">${esc((summary.runOrder ?? []).join(' → '))}</span></p>
</footer>
</main>
</body>
</html>
`;

writeFileSync(join(OUT, 'index.html'), html, 'utf8');

console.log(`publish: ${rendered.length} report(s) → ${OUT}`);
if (failedRender.length) console.log(`publish: ${failedRender.length} render failure(s): ${failedRender.join(', ')}`);
console.log(`publish: index → ${join(OUT, 'index.html')}`);
console.log(
  `publish: pooled ${pooled === null ? 'nothing gathered' : pooled.toFixed(3)} (${totalAnchored}/${totalClassified}) over ${ok.length} target(s)`
);
