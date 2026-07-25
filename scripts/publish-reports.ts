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
const routed = new Set<string>();
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
  // The constructive half, when it exists: <name>.bindings.html routes each
  // ungrounded node to an anchored producer already present in the same report.
  // Copied, never regenerated here — route.ts owns that artifact.
  const bsrc = join(REPORTS, `${e.name}.bindings.html`);
  if (existsSync(bsrc)) {
    writeFileSync(join(OUT, `${e.name}.bindings.html`), scrub(readFileSync(bsrc, 'utf8')), 'utf8');
    routed.add(e.name);
  }
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
  curve = `<section><h2 class="k-eyebrow">Crystallization curve</h2>
<p class="k-scope">Cost per node against corpus run index. The run order is part of the
measurement — the curve is a claim about ordered probe accumulation, so a reshuffle
changes it by design. If cost per node does not fall, that is published as-is.</p>
${readFileSync(curveSvg, 'utf8')}</section>`;
} else {
  curve = `<section><h2 class="k-eyebrow">Crystallization curve</h2>
<p class="k-scope">Not yet produced for this run.</p></section>`;
}

// --- the ratio table ---------------------------------------------------------
// Three outcomes, and lumping the last two together publishes a false statement.
// `ok` measured something. `empty` was measured successfully and HAS NO
// VERIFICATION SURFACE — a docs repo with no CI is a real finding, not a failure,
// and calling it one would be the mirror image of publishing 0.000 for it.
// `bad` genuinely failed: the clone or the gather did not complete, so nothing is
// known either way.
const ok = (summary.entries ?? []).filter((e: any) => e.status === 'ok');
const empty = (summary.entries ?? []).filter((e: any) => e.status === 'nothing_gathered');
const bad = (summary.entries ?? []).filter(
  (e: any) => e.status !== 'ok' && e.status !== 'nothing_gathered'
);

function row(e: any): string {
  const judged = e.nodesJudged ?? 0;
  const classified = (e.anchored ?? 0) + (e.selfReferential ?? 0) + (e.unknown ?? 0);

  // Three distinct states, and collapsing any two of them publishes a false
  // statement. "nothing gathered" means the gatherer found no surface at all.
  // "no denominator" means edges WERE judged and every one landed in
  // `not_a_check` — a real finding, and emphatically not the same claim. A ratio
  // prints only when something is actually in the denominator; `0.000` over an
  // empty one would read as "this repo has no grounded checks", which is false.
  //
  // A ratio over a handful of edges is a weak claim however precise the decimals
  // look, and `1.000` over 7 is the shape most likely to be quoted and least able
  // to bear it. `data-smell` is the design system's existing marker for exactly
  // this — "closer to unknown than its colour suggests" — so the weakness rides
  // the number itself rather than a bespoke class.
  const thin = classified > 0 && classified < THIN_DENOMINATOR;
  const ratioCell =
    judged === 0
      ? `<em class="k-meta">nothing gathered</em>`
      : classified === 0
        ? `<em class="k-meta">no denominator — every judged edge is not_a_check</em>`
        : `<span class="k-ratio__value k-ratio__value--inline${thin ? ' k-ratio__value--thin' : ''}">${(e.ratio ?? 0).toFixed(3)}</span>` +
          (thin ? `<div class="thin-note">thin — ${classified} classified edge${classified === 1 ? '' : 's'}</div>` : '');

  // Two independent disclosures; a target can trip either or both.
  //  - `capped`:  judged fewer nodes than it gathered (a sampling cap)
  //  - `partial`: some sampled nodes came back unjudged, so the ratio rests on
  //    less than the sample it claims. corpus.ts calls publishing that
  //    without disclosure indefensible, and it is right.
  const notes: string[] = [];
  if (e.capped || (e.nodesSampled != null && e.nodesTotal != null && e.nodesSampled !== e.nodesTotal)) {
    // The fraction, not just the pair. "sampled 25 of 1014" is a footnote;
    // "2% of the surface" is the actual claim.
    const pct = e.nodesTotal ? Math.round((e.nodesSampled / e.nodesTotal) * 100) : null;
    notes.push(`sampled ${e.nodesSampled} of ${e.nodesTotal}${pct !== null ? ` — ${pct}% of the surface` : ''}`);
  }
  if (e.partial || (e.nodesUnjudged ?? 0) > 0) {
    const frac = typeof e.judgedFraction === 'number' ? ` (${(e.judgedFraction * 100).toFixed(0)}% judged)` : '';
    notes.push(`PARTIAL — ${e.nodesUnjudged ?? 0} unjudged${frac}`);
  }
  const disclosure = notes.length ? `<div class="k-meta">${esc(notes.join(' · '))}</div>` : '';

  // The field is `coverageJudged`. Reading a name corpus.ts never writes left
  // this column silently empty, which broke "the ratio never travels alone" on
  // the one surface the public actually sees.
  const cov = Object.entries(e.coverageJudged ?? {})
    .map(([k, n]) => `<span class="k-tag">${esc(k)} ${n}</span>`)
    .join(' ');

  // Keel measuring Keel is the one run where query provenance collapses: the
  // measured system and the system choosing the question are the same. Reported
  // because refusing to publish our own number would be the failure this project
  // names, flagged because it is not evidence of the same kind as the rows above.
  const selfNote =
    e.name === 'keel'
      ? `<div class="k-meta">self-measured — Keel judging Keel, the one run where query
         independence collapses. Published because refusing to print our own number
         would be the failure this project names; flagged because it is not evidence
         of the same kind as the rows around it.</div>`
      : '';

  return `<tr>
  <td><a href="${esc(e.name)}.html">${esc(e.name)}</a>
      <div class="k-meta k-mono">${esc((e.revision ?? '').slice(0, 12))}</div>${selfNote}</td>
  <td>${ratioCell}</td>
  <td>${e.anchored ?? 0} of ${classified}</td>
  <td>${e.selfReferential ?? 0}</td>
  <td>${e.unknown ?? 0}</td>
  <td>${e.notACheck ?? 0}</td>
  <td>${judged} judged ${disclosure}<div>${cov || '—'}</div></td>
  <td>${
    routed.has(e.name)
      ? `<a href="${esc(e.name)}.bindings.html">routes</a>`
      : '<span class="k-meta">—</span>'
  }</td>
</tr>`;
}

const totalAnchored = ok.reduce((n: number, e: any) => n + (e.anchored ?? 0), 0);
const totalClassified = ok.reduce(
  (n: number, e: any) => n + (e.anchored ?? 0) + (e.selfReferential ?? 0) + (e.unknown ?? 0),
  0
);
const totalSelfRef = ok.reduce((n: number, e: any) => n + (e.selfReferential ?? 0), 0);
const totalUnknown = ok.reduce((n: number, e: any) => n + (e.unknown ?? 0), 0);
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
/* Page-local layout only. Every component below is the frozen design system's;
   nothing here re-declares a colour, a size, or a component. */
.corpus-table td:first-child { max-width: 22em; }
.corpus-table td:nth-child(2) { white-space: nowrap; }
.k-ratio__value--inline { font-size: var(--k-fs-h1); line-height: 1; }
/* "Weaker than it looks" — the same claim the data-smell marker makes about a
   verdict, applied to a ratio standing on too few edges. Reuses the system's
   own token rather than inventing a colour. */
.k-ratio__value--thin { color: var(--k-smell); }
.thin-note { font-size: var(--k-fs-xs); color: var(--k-smell); }
</style>
</head>
<body>
<main class="k-report">
<header>
  <p class="k-eyebrow">Keel</p>
  <h1 class="k-display">Corpus grounding ratios</h1>
  <p class="k-lede">Every verification edge in each repository below was classified by who
  produces the signal, and whether the actor being verified can write to that producer.</p>
  <blockquote class="k-callout">A check is only a check if the signal it reads comes from
  somewhere the thing being checked cannot write to.</blockquote>
  <p class="k-meta k-mono">generated ${esc(summary.generatedAt ?? '')} ·
  ${ok.length} target(s) measured${empty.length ? ` · ${empty.length} with no verification surface` : ''}${bad.length ? ` · ${bad.length} failed` : ''}</p>
</header>

<h2 class="k-eyebrow">Pooled across the corpus</h2>
${
  pooled === null
    ? '<p class="k-meta"><em>nothing gathered</em></p>'
    : `<div class="k-ratio">
  <span class="k-ratio__value">${pooled.toFixed(3)}</span>
  <p class="k-ratio__formula">anchored / (anchored + self_referential + unknown)</p>
  <div class="k-meter">
    <div class="k-meter__seg" data-class="anchored" style="width:${((totalAnchored / totalClassified) * 100).toFixed(1)}%"></div>
    <div class="k-meter__seg" data-class="self_referential" style="width:${((totalSelfRef / totalClassified) * 100).toFixed(1)}%"></div>
    <div class="k-meter__seg" data-class="unknown" style="width:${((totalUnknown / totalClassified) * 100).toFixed(1)}%"></div>
  </div>
  <div class="k-ratio__counts">
    <span class="k-ratio__count"><span class="k-class" data-class="anchored">anchored</span> ${totalAnchored}</span>
    <span class="k-ratio__count"><span class="k-class" data-class="self_referential">self_referential</span> ${totalSelfRef}</span>
    <span class="k-ratio__count"><span class="k-class" data-class="unknown">unknown</span> ${totalUnknown}</span>
    <span class="k-ratio__count k-ratio__count--excluded">
      <span class="k-class" data-class="not_a_check">not_a_check</span> ${totalNotACheck}
      <span class="k-meta">excluded from the denominator</span>
    </span>
  </div>
</div>`
}

<p class="k-scope"><strong>Scope.</strong> Keel measures the shape of verification, not its
quality. A repo can be 100% anchored with terrible tests. Anchoring says the signal comes
from outside; it does not say the signal is sufficient.</p>

<p class="k-meta">Across ${ok.length} repositories. The pooled figure weights each
repository by how many edges it contributed, so it is not the mean of the column below.
Both are printed because neither alone is honest: the mean hides size, the pooled figure
hides spread. <strong>Mean of the ${withDenominator.length} target(s) with a denominator:
${meanOfTargets === null ? 'n/a' : meanOfTargets.toFixed(3)}</strong>.</p>

<hr class="k-rule" />

<h2 class="k-eyebrow">By repository</h2>
<p class="k-meta">The <strong>routes</strong> column is the constructive half. A grounding
ratio on its own is a diagnosis nobody can act on; a route names, for each ungrounded
check, an anchored producer <em>the repository already owns</em> and the change that would
wire it in. Keel never invents an anchor — every proposed producer is a node already
classified <span class="k-class" data-class="anchored">anchored</span> in that same report,
and one that does not resolve is refused. Where no route exists the page says so and names
the decision required instead, because a proposal that raises the number without grounding
the claim is the failure this project exists to name. Every route is a
<strong>proposal</strong>: the constructing loop emits, a human admits.</p>
<table class="k-table k-table--num corpus-table">
  <thead><tr>
    <th>target</th><th>ratio</th><th>anchored</th>
    <th>self_referential</th><th>unknown</th>
    <th>not_a_check</th><th>coverage (judged)</th><th>routes</th>
  </tr></thead>
  <tbody>
${ok.map(row).join('\n')}
  </tbody>
</table>
<p class="k-meta"><code class="k-mono">not_a_check</code> is excluded from the ratio
entirely, which makes it the one <em>shoppable</em> class: mis-filing a real check there
shrinks the denominator and inflates the score. It is printed here for exactly that reason.
<code class="k-mono">unknown</code> fails closed and counts against the ratio like
<code class="k-mono">self_referential</code>.</p>

<hr class="k-rule" />

${curve}

${
  empty.length
    ? `<section><h2 class="k-eyebrow">Measured, and found nothing to measure</h2>
<p class="k-scope">The clone and the gather both succeeded; these repositories simply carry
no verification edge the gatherer can read. That is a result about the repository, not a
failure of the run, and it is reported as "nothing gathered" rather than as a ratio —
publishing <code class="k-mono">0.000</code> here would read as "no grounded checks", which
is a different and false claim.</p>
<ul>${empty.map((e: any) => `<li class="k-mono">${esc(e.name)} — nothing gathered (0 edges)</li>`).join('')}</ul>
</section>`
    : ''
}

${
  bad.length
    ? `<section><h2 class="k-eyebrow">Targets that failed</h2>
<p class="k-scope">Listed rather than dropped. A corpus that quietly omits what it could not
measure is shopping its own denominator.</p>
<ul>${bad.map((e: any) => `<li class="k-mono">${esc(e.name)} — ${esc(e.error ?? e.status)}</li>`).join('')}</ul>
</section>`
    : ''
}

<section>
  <h2 class="k-eyebrow">Reproducing this</h2>
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
