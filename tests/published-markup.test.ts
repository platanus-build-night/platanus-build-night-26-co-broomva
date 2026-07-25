/**
 * The published corpus pages must be PARSEABLE, not merely path-free.
 *
 * This file exists because of a bug that every other gate in the repo waved
 * through. `publish-reports.ts` rewrites machine-local absolute paths to a
 * `<repo>` placeholder at the publish boundary — correct in intent, and
 * `portability-check.sh` went green precisely because the private path was
 * genuinely gone. But the substitution ran over already-rendered HTML, so the
 * bare angle brackets landed inside the crystallization curve's SVG `<desc>`.
 * A lenient HTML parser read `<repo>` as an unknown element and adopted every
 * following sibling as its child: the 1080x1510 chart reserved its full height
 * and painted nothing at all.
 *
 * Nothing caught it. `bun test` passed, `tsc` passed, `design-audit` passed,
 * `portability-check` passed *because of* the very edit that broke the artifact,
 * and the failure was invisible in the HTML source — the page looked fine to
 * everything except a human looking at the pixels.
 *
 * By Keel's own vocabulary the old arrangement was `not_a_check` for this
 * property: no gate asserted anything about whether the published markup still
 * described a drawing.
 *
 * WHY PYTHON DECIDES. Bun exposes no XML parser, and adding a dependency for
 * one check would break the zero-runtime-dependency rule. Hand-rolling a parser
 * here would be worse than either: the assertion would then rest on markup
 * logic this repo also wrote, which is `self_referential` by the project's own
 * definition. `python3` is already a toolchain dependency (`design-audit.py`),
 * and `xml.etree` is a parser nobody here maintains — so the verdict below is
 * `anchored`, and it is not arguable.
 */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const SITE = join(ROOT, 'site', 'reports');

const CHECKER = `
import json, pathlib, re, sys
import xml.etree.ElementTree as ET

site = pathlib.Path(sys.argv[1])
out = {}
for f in sorted(site.glob('*.html')):
    html = f.read_text()
    islands = re.findall(r'<svg\\b[\\s\\S]*?</svg>', html)
    rec = {'islands': len(islands), 'errors': [], 'rawPlaceholder': bool(re.search(r'<repo>|<home>', html)), 'curvePolylines': None}
    for svg in islands:
        try:
            root = ET.fromstring(svg)
        except ET.ParseError as e:
            rec['errors'].append(str(e))
            continue
        if 'keel-curve' in (root.get('class') or ''):
            # Count polylines that are reachable as descendants of the SVG root.
            # Under the bug these were nested inside a <repo> element, which is
            # not in the SVG namespace, so nothing under it renders.
            ns = '{http://www.w3.org/2000/svg}'
            rec['curvePolylines'] = len(root.findall('.//' + ns + 'polyline')) + len(root.findall('.//polyline'))
            foreign = sorted({
                el.tag for el in root.iter()
                if isinstance(el.tag, str) and not el.tag.startswith(ns) and el.tag not in ('style',)
            })
            if foreign:
                rec['errors'].append('foreign elements in curve: ' + ', '.join(foreign))
    out[f.name] = rec
print(json.dumps(out))
`;

type Rec = {
  islands: number;
  errors: string[];
  rawPlaceholder: boolean;
  curvePolylines: number | null;
};

const proc = Bun.spawnSync({
  cmd: ['python3', '-c', CHECKER, SITE],
  stdout: 'pipe',
  stderr: 'pipe',
});

if (proc.exitCode !== 0) {
  throw new Error(`markup checker failed: ${proc.stderr.toString()}`);
}

const report: Record<string, Rec> = JSON.parse(proc.stdout.toString());
const pages = Object.keys(report);

describe('published corpus pages', () => {
  test('there are pages to check at all', () => {
    // Guards against this whole file silently passing on an empty directory —
    // a suite that asserts nothing about nothing is the shape it exists to catch.
    expect(pages.length).toBeGreaterThan(0);
  });

  for (const page of pages) {
    const rec = report[page];

    test(`${page} — no raw path placeholder survives into markup`, () => {
      // The escaped form is the only correct one at the HTML boundary. A bare
      // one is an element, not a placeholder.
      expect(rec.rawPlaceholder).toBe(false);
    });

    test(`${page} — every inline SVG parses, with no foreign elements`, () => {
      expect(rec.errors).toEqual([]);
    });
  }

  test('the crystallization curve actually draws something', () => {
    // Asserting the <svg> is PRESENT would have passed all the way through the
    // bug — the element was always there, at full height, drawing nothing.
    const withCurve = pages.filter((p) => report[p].curvePolylines !== null);
    expect(withCurve.length).toBeGreaterThan(0);

    for (const page of withCurve) {
      expect(report[page].curvePolylines, `${page} curve polylines`).toBeGreaterThan(0);
    }
  });
});
