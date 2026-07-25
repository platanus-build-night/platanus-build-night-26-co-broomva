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
import { homedir } from 'node:os';

const HOME = homedir();

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

// Below this many classified edges, a ratio is reported but flagged: it is too
// few for the decimals to mean much. Not a cutoff for publishing — suppressing a
// thin number would be its own dishonesty — just a cutoff for presenting it as
// though it were solid.
const THIN_DENOMINATOR = 10;

/**
 * Machine-local absolute paths leak into GENERATED artifacts through diagnostic
 * strings — a probe-shadow warning naming its probe dir, a curve disclosure
 * naming the reports dir, a verdict quoting a command's output. They are true
 * on the machine that wrote them and meaningless anywhere else, and committing
 * them fails scripts/portability-check.sh for good reason: a path that exists
 * only on one laptop is exactly the kind of unreproducible detail this project
 * argues against publishing.
 *
 * Rewritten to a repo-relative form rather than deleted, so the diagnostic still
 * says which file it meant.
 */
const scrub = (text: string): string =>
  text.split(REPO + '/').join('<repo>/').split(REPO).join('<repo>').split(HOME + '/').join('<home>/');

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
  if (r.exitCode === 0 && existsSync(dst)) {
    // The renderer faithfully carries whatever the report contained, so the scrub
    // belongs here — at the boundary where an artifact stops being local.
    writeFileSync(dst, scrub(readFileSync(dst, 'utf8')), 'utf8');
    rendered.push(e.name);
  }
  else {
    failedRender.push(e.name);
    console.error(`publish: render failed for ${e.name}: ${new TextDecoder().decode(r.stderr).slice(0, 300)}`);
  }
}

// --- the curve, if G has produced one ----------------------------------------
let curve = '';
const curveSvg = join(REPORTS, 'curve.svg');
if (existsSync(curveSvg)) {
  curve = `<section class="k-card"><h2>Crystallization curve</h2>
<p class="k-scope">Cost per node against corpus run index. The run order is part of the
measurement — the curve is a claim about ordered probe accumulation, so a reshuffle
changes it by design. If cost per node does not fall, that is published as-is.</p>
${readFileSync(curveSvg, 'utf8')}</section>`;
} else {
  curve = `<section class="k-card"><h2>Crystallization curve</h2>
<p class="k-scope">Not yet produced for this run.</p></section>`;
}

// --- the ratio table ---------------------------------------------------------
const ok = (summary.entries ?? []).filter((e: any) => e.status === 'ok');
const bad = (summary.entries ?? []).filter((e: any) => e.status !== 'ok');

function row(e: any): string {
  const judged = e.nodesJudged ?? 0;
  const classified = (e.anchored ?? 0) + (e.selfReferential ?? 0) + (e.unknown ?? 0);

  // Three distinct states, and collapsing any two of them publishes a false
  // statement. "nothing gathered" means the gatherer found no surface at all.
  // "no denominator" means edges WERE judged and every one landed in
  // `not_a_check` — a real finding (nothing here asserts correctness), and
  // emphatically not the same claim. A ratio is printed only when something is
  // actually in the denominator; `0.000` over an empty denominator would read as
  // "this repo has no grounded checks", which is a different and false claim.
  const ratioCell =
    judged === 0
      ? `<span class="k-nothing">nothing gathered</span>`
      : classified === 0
        ? `<span class="k-nothing">no denominator — every judged edge is not_a_check</span>`
        : // A ratio over a handful of edges is a weak claim however precise the
          // decimals look, and 1.000 over 7 is the shape most likely to be quoted
          // and least able to bear it. Mark it in the number itself: a reader who
          // sees only this cell must still see the weakness.
          `<strong class="k-ratio-inline">${(e.ratio ?? 0).toFixed(3)}</strong>` +
          (classified < THIN_DENOMINATOR
            ? `<div class="k-thin">thin — ${classified} classified edge${classified === 1 ? '' : 's'}</div>`
            : '');

  // Two independent disclosures, and a target can trip either or both:
  //  - `capped`: the run judged fewer nodes than it gathered (a sampling cap)
  //  - `partial`: some sampled nodes came back unjudged, so the ratio rests on
  //    less than the sample it claims. corpus.ts calls publishing that without
  //    disclosure indefensible, and it is right.
  const notes: string[] = [];
  if (e.capped || (e.nodesSampled != null && e.nodesTotal != null && e.nodesSampled !== e.nodesTotal)) {
    // The fraction, not just the pair. "sampled 25 of 1014" is technically a
    // disclosure and reads like a footnote; "2%" reads like what it is. A ratio
    // computed over 2% of a surface and one computed over 78% are different
    // claims, and the number that makes them different has to be legible.
    const pct = e.nodesTotal ? Math.round((e.nodesSampled / e.nodesTotal) * 100) : null;
    notes.push(`sampled ${e.nodesSampled} of ${e.nodesTotal}${pct !== null ? ` — ${pct}% of the surface` : ''}`);
  }
  if (e.partial || (e.nodesUnjudged ?? 0) > 0) {
    const frac = typeof e.judgedFraction === 'number' ? ` (${(e.judgedFraction * 100).toFixed(0)}% judged)` : '';
    notes.push(`PARTIAL — ${e.nodesUnjudged ?? 0} unjudged${frac}`);
  }
  const disclosure = notes.length ? `<span class="k-cap">${esc(notes.join(' · '))}</span>` : '';

  // The field is `coverageJudged`. Reading a name corpus.ts never writes left this
  // column silently empty, which broke "the ratio never travels alone" on the one
  // surface the public actually sees.
  const cov = Object.entries(e.coverageJudged ?? {})
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
  <td class="k-sub">${judged} judged ${disclosure}<div class="k-sub">${cov || '—'}</div></td>
</tr>`;
}

const totalAnchored = ok.reduce((n: number, e: any) => n + (e.anchored ?? 0), 0);
const totalClassified = ok.reduce(
  (n: number, e: any) => n + (e.anchored ?? 0) + (e.selfReferential ?? 0) + (e.unknown ?? 0),
  0
);
const totalNotACheck = ok.reduce((n: number, e: any) => n + (e.notACheck ?? 0), 0);
const pooled = totalClassified === 0 ? null : totalAnchored / totalClassified;

// The unweighted mean over targets that actually have a denominator. A target whose
// every judged edge is `not_a_check` has no ratio to average — including it as 0 would
// invent a claim the measurement never made.
const withDenominator = ok.filter(
  (e: any) => (e.anchored ?? 0) + (e.selfReferential ?? 0) + (e.unknown ?? 0) > 0
);
const meanOfTargets = withDenominator.length
  ? withDenominator.reduce((n: number, e: any) => n + (e.ratio ?? 0), 0) / withDenominator.length
  : null;

const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Keel — corpus grounding ratios</title>
<style>${css}
.k-num{text-align:right;white-space:nowrap}
.k-inert{color:var(--k-not-a-check)}
.k-sub{font-size:var(--k-fs-xs);color:var(--k-ink-2)}
.k-cap{display:inline-block;margin-left:var(--k-space-2);color:var(--k-unknown)}
.k-nothing{color:var(--k-ink-2);font-style:italic}
.k-thin{color:var(--k-unknown);font-size:var(--k-fs-xs);font-weight:400}
.k-ratio-inline{font-size:var(--k-fs-ratio);font-variant-numeric:tabular-nums}
table{width:100%;border-collapse:collapse}
th,td{padding:var(--k-space-2);border-bottom:1px solid var(--k-line);vertical-align:top}
th{text-align:left;font-size:var(--k-fs-xs);color:var(--k-ink-2);text-transform:uppercase;letter-spacing:.08em}
th.k-num{text-align:right}
</style>
</head>
<body class="k-page">
<main class="k-report">
<header class="k-meta">
  <h1>Keel — corpus grounding ratios</h1>
  <p class="k-lede">Every verification edge in each repository below was classified by who
  produces the signal, and whether the actor being verified can write to that producer.
  <strong>A check is only a check if the signal it reads comes from somewhere the thing
  being checked cannot write to.</strong></p>
  <p class="k-scope k-mono">generated ${esc(summary.generatedAt ?? '')} ·
  ${ok.length} target(s) measured${bad.length ? ` · ${bad.length} failed` : ''}</p>
</header>

<section class="k-card">
  <h2>Pooled across the corpus</h2>
  <p class="k-ratio">
    ${pooled === null ? '<span class="k-nothing">nothing gathered</span>' : `<strong>${pooled.toFixed(3)}</strong>`}
    <span class="k-scope">= ${totalAnchored} anchored / ${totalClassified} classified edges
    across ${ok.length} repositories · ${totalNotACheck} <span class="k-inert">not_a_check</span>
    excluded from the denominator</span>
  </p>
  <p class="k-scope"><strong>Scope.</strong> Keel measures the shape of verification, not its
  quality. A repo can be 100% anchored with terrible tests. Anchoring says the signal comes
  from outside; it does not say the signal is sufficient.</p>
  <p class="k-scope">The pooled figure weights repositories by how many edges each
  contributed, so it is not the mean of the per-repository column below. Both are printed
  because neither alone is honest: the mean hides size, the pooled figure hides spread.
  <strong>Mean of the ${withDenominator.length} target(s) that have a denominator:
  ${meanOfTargets === null ? 'n/a' : meanOfTargets.toFixed(3)}</strong>.</p>
</section>

<section class="k-card">
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
  <p class="k-scope"><code class="k-mono">not_a_check</code> is excluded from the ratio
  entirely, which makes it the one <em>shoppable</em> class: mis-filing a real check there
  shrinks the denominator and inflates the score. It is printed here for exactly that
  reason. <code class="k-mono">unknown</code> fails closed and counts against the ratio
  like <code class="k-mono">self_referential</code>.</p>
</section>

${curve}

${
  bad.length
    ? `<section class="k-card"><h2>Targets that failed</h2>
<p class="k-scope">Listed rather than dropped. A corpus that quietly omits what it could not
measure is shopping its own denominator.</p>
<ul>${bad.map((e: any) => `<li class="k-mono">${esc(e.name)} — ${esc(e.error ?? e.status)}</li>`).join('')}</ul>
</section>`
    : ''
}

<section class="k-card">
  <h2>Reproducing this</h2>
  <p class="k-scope">Every target is pinned to a revision (shown under its name). The corpus
  ran sequentially in a recorded order, because the crystallization curve measures ordered
  probe-library growth and a parallel run would destroy the signal being measured.</p>
  <pre class="k-mono k-code">npx skills add broomva/keel</pre>
</section>

<footer class="k-meta">
  <p class="k-scope">Run order: <span class="k-mono">${esc((summary.runOrder ?? []).join(' → '))}</span></p>
</footer>
</main>
</body>
</html>
`;

writeFileSync(join(OUT, 'index.html'), scrub(html), 'utf8');

console.log(`publish: ${rendered.length} report(s) → ${OUT}`);
if (failedRender.length) console.log(`publish: ${failedRender.length} render failure(s): ${failedRender.join(', ')}`);
console.log(`publish: index → ${join(OUT, 'index.html')}`);
console.log(
  `publish: pooled ${pooled === null ? 'nothing gathered' : pooled.toFixed(3)} (${totalAnchored}/${totalClassified}) over ${ok.length} target(s)`
);
