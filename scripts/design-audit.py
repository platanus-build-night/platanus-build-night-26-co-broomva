#!/usr/bin/env python3
"""
Keel design-system adherence gate.

The Oasis system this borrows its structure from ships an oxlint config to
enforce adherence — no raw hex, no raw px, no undeclared component props. Keel
has no JSX and no lint runner, so the same discipline lands as an executed
script: it reads the real files, compares them, and exits non-zero. That
matters beyond convenience. A gate that asserted against a value this repo also
writes would be `self_referential` under Keel's own definition, and shipping
one in the repo that defines the term would be indefensible. The signal here is
a byte comparison and a parse of the frozen schema — neither of which this
file can talk its way out of.

    python3 scripts/design-audit.py [--fix-sync]

Checks:
  1. Raw hex colors outside the token file.
  2. Raw px values outside the token file (hairlines <=2px and media-query
     breakpoints exempted — they are not scale steps).
  3. site/ token copies byte-identical to the canonical files.
  4. The verdict swatches in tokens.css match `GroundingClass` in the frozen
     schema exactly — no inventing a fifth class in CSS.
  5. Every surface printing a grounding ratio also prints its denominator
     and the scope note.
  6. No check-mark or cross emoji on any Keel surface.
  7. Every rendered verdict carries its write-boundary argument.
  8. Brand assets are present (their pixels are reviewed, not gated —
     see check_brand_marks).

Escape hatch: put `audit-ok:` on the line with a reason. Checks 3-8 have no
escape hatch; they encode product invariants, not style preferences.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CANONICAL = ROOT / "skills/keel/design"
TOKENS = CANONICAL / "tokens.css"
SITE = ROOT / "site"

# Surfaces the system governs. tokens.css is excluded from 1 and 2 by design:
# it is the file that is allowed to contain literals.
GOVERNED_GLOBS = [
    "skills/keel/design/keel.css",
    "skills/keel/templates/**/*.css",
    "skills/keel/templates/**/*.html",
    "site/**/*.html",
    "docs/design/**/*.html",
]

# Brand assets. These are rendered raster emblems, not flat vector marks, so
# this gate can only verify that they exist and that the site/ copies match —
# it CANNOT verify their colours against tokens.css the way it does for CSS.
# That is a real loss of coverage compared with the vector marks these
# replaced, and it is recorded here rather than papered over: the brand
# palette is now enforced by review, not by a check.
BRAND_ASSETS = ["mark.png", "mark-compact.png", "icon.png"]

HEX = re.compile(r":\s*#[0-9a-fA-F]{3,8}\b")
PX = re.compile(r"\b(\d+(?:\.\d+)?)px\b")
BAD_EMOJI = re.compile(r"[✅❌✔✖✘]|✓️?")

# A hex literal is legitimate in exactly one position: the value of a --k-*
# custom property. That is what a token declaration IS. The @media print block
# in keel.css redefines the canvas and verdict tokens for paper and is the one
# intentional second site of declaration.
TOKEN_DECL = re.compile(r"^\s*--k-[a-z0-9-]+\s*:")

STYLE_OPEN = re.compile(r"<style\b", re.I)
STYLE_CLOSE = re.compile(r"</style>", re.I)

# Precise usage, not a mention. `standards.html` discusses `.k-ratio__value` in
# prose; that is documentation, not a rendered ratio, and must not trip a gate.
RENDERS_RATIO = re.compile(r'class="[^"]*\bk-ratio__value\b')
RENDERS_COUNTS = re.compile(r'class="[^"]*\bk-ratio__counts\b')
RENDERS_SCOPE = re.compile(r'class="[^"]*\bk-scope\b')
RENDERS_ARGUMENT = re.compile(r'class="[^"]*\bk-argument\b')
SPLIT_VERDICT = re.compile(r'class="[^"]*\bk-verdict\b[^"]*"')


def css_lines(path: Path) -> list[tuple[int, str]]:
    """Lines that are in a CSS context.

    For a stylesheet, that is every line. For HTML it is the inside of a
    <style> block plus any line carrying a style="" attribute — prose that
    happens to say "4px grid" is not a style violation.
    """
    lines = path.read_text().splitlines()
    if path.suffix == ".css":
        return list(enumerate(lines, 1))

    out: list[tuple[int, str]] = []
    in_style = False
    for lineno, line in enumerate(lines, 1):
        opened = bool(STYLE_OPEN.search(line))
        closed = bool(STYLE_CLOSE.search(line))
        if in_style or opened or 'style="' in line:
            out.append((lineno, line))
        if opened and not closed:
            in_style = True
        elif closed:
            in_style = False
    return out

failures: list[str] = []


def rel(p: Path) -> str:
    return str(p.relative_to(ROOT))


def governed_files() -> list[Path]:
    seen: dict[Path, None] = {}
    for pattern in GOVERNED_GLOBS:
        for path in sorted(ROOT.glob(pattern)):
            if path.is_file() and path != TOKENS:
                seen[path] = None
    return list(seen)


def check_literals(files: list[Path]) -> None:
    """1 + 2 — raw hex and raw px outside a token declaration."""
    for path in files:
        for lineno, line in css_lines(path):
            if "audit-ok:" in line:
                continue
            stripped = line.lstrip()
            if HEX.search(line) and not TOKEN_DECL.match(line):
                failures.append(
                    f"{rel(path)}:{lineno} raw hex color — use a --k-* token\n"
                    f"    {stripped[:100]}"
                )
            # Breakpoints cannot use custom properties: media queries are
            # evaluated before the cascade, so var() is unavailable there.
            if stripped.startswith("@media"):
                continue
            for value in PX.findall(line):
                if float(value) <= 2:
                    continue  # hairline / ring width, not a scale step
                failures.append(
                    f"{rel(path)}:{lineno} raw {value}px — use a --k-space-* / --k-fs-* token\n"
                    f"    {stripped[:100]}"
                )


def check_sync(fix: bool) -> None:
    """3 — the site copies must be byte-identical to the canonical files.

    site/ deploys as a standalone directory to GitHub Pages and cannot reach
    up into skills/, so it carries a copy. A copy is a drift risk, which is
    why the comparison runs as a gate rather than as a convention.
    """
    names = ["tokens.css", "keel.css"] + BRAND_ASSETS
    for name in names:
        src, dst = CANONICAL / name, SITE / name
        if not src.exists():
            continue  # a missing canonical file is reported by its own check
        want = src.read_bytes()
        if fix:
            dst.write_bytes(want)
            print(f"  synced {rel(dst)}")
            continue
        if not dst.exists():
            failures.append(f"{rel(dst)} missing — run `make design-sync`")
        elif dst.read_bytes() != want:
            failures.append(
                f"{rel(dst)} has drifted from {rel(src)} — run `make design-sync`"
            )


def token_value(text: str, name: str, *, within: str | None = None) -> str | None:
    """Read a --k-* hex value out of a stylesheet, optionally from one block."""
    if within is not None:
        start = text.find(within)
        if start == -1:
            return None
        text = text[start:]
    m = re.search(rf"--k-{name}:\s*(#[0-9a-fA-F]{{3,8}})", text)
    return m.group(1).lower() if m else None


def _unused_brand_palettes() -> tuple[dict[str, str], dict[str, str]] | None:
    """The on-dark and paper ink pairs, read from the stylesheets themselves.

    The paper values come from the `@media print` block in keel.css rather than
    from a second list here — the marks and the print theme have to agree, and
    the only way to guarantee that is to read one from the other.
    """
    tokens = TOKENS.read_text()
    keel = (CANONICAL / "keel.css").read_text()
    raw_dark = {k: token_value(tokens, k) for k in ("ink-0", "accent")}
    raw_light = {
        k: token_value(keel, k, within="@media print") for k in ("ink-0", "accent")
    }
    if any(v is None for v in (*raw_dark.values(), *raw_light.values())):
        failures.append(
            "could not read --k-ink-0 / --k-accent from tokens.css and the "
            "@media print block in keel.css"
        )
        return None
    dark = {k: v for k, v in raw_dark.items() if v is not None}
    light = {k: v for k, v in raw_light.items() if v is not None}
    return dark, light


def check_brand_marks(fix: bool) -> None:
    """8 — brand assets exist. Their pixels are reviewed, not gated.

    The mark is a rendered emblem (gradients, glow, faceted shading) rather
    than a flat token-coloured shape. That is a deliberate exception to the
    surface rules in keel.css — see the Brand section of the design README —
    and it means the palette agreement that check 8 used to enforce on the
    vector marks is now a human responsibility.
    """
    for name in BRAND_ASSETS:
        src = CANONICAL / name
        if not src.exists():
            failures.append(f"{rel(src)} missing")


def check_verdict_classes() -> None:
    """4 — swatches in tokens.css match the frozen schema's GroundingClass."""
    schema = (ROOT / "skills/keel/schemas/keel.ts").read_text()
    block = re.search(
        r"export type GroundingClass\s*=(.*?);", schema, re.S
    )
    if not block:
        failures.append("schemas/keel.ts: could not locate `GroundingClass` union")
        return
    schema_classes = set(re.findall(r"'([a-z_]+)'", block.group(1)))

    tokens = TOKENS.read_text()
    # A verdict swatch is a top-level --k-<class> whose name maps back to a
    # class; the wash/alias tokens are derived and not counted.
    declared = set(re.findall(r"^\s*--k-([a-z-]+):\s*#", tokens, re.M))
    swatches = {
        name.replace("-", "_")
        for name in declared
        if name.replace("-", "_") in schema_classes
    }

    missing = schema_classes - swatches
    if missing:
        failures.append(
            "tokens.css is missing a swatch for GroundingClass "
            + ", ".join(sorted(missing))
        )

    # The inverse — a swatch that names a class the schema does not have —
    # would mean a class was invented in CSS. Catch it by checking every
    # `data-class="..."` selector used anywhere in the governed surfaces.
    for path in governed_files():
        for lineno, line in enumerate(path.read_text().splitlines(), 1):
            for used in re.findall(r'data-class="([a-z_]+)"', line):
                if used not in schema_classes:
                    failures.append(
                        f'{rel(path)}:{lineno} data-class="{used}" is not a '
                        f"GroundingClass — the schema is frozen"
                    )


def check_accounting(files: list[Path]) -> None:
    """5 — a ratio never ships without its denominator or the scope note."""
    for path in files:
        text = path.read_text()
        if not RENDERS_RATIO.search(text):
            continue
        if not RENDERS_COUNTS.search(text):
            failures.append(
                f"{rel(path)} prints a grounding ratio without .k-ratio__counts "
                f"— a ratio with a hidden denominator is the move Keel exists to expose"
            )
        if not RENDERS_SCOPE.search(text):
            failures.append(
                f"{rel(path)} prints a grounding ratio without .k-scope — an "
                f"unqualified ratio gets read as 'well tested'"
            )


def check_arguments(files: list[Path]) -> None:
    """7 — every rendered `.k-verdict` carries its `.k-argument`.

    `keel.css` renders a visible defect banner for a missing argument, but a
    banner only helps whoever looks at the page. The gate is what makes the
    rule hold in a pipeline. Opt a row out with `data-specimen-defect` when the
    absence is the point — the design system documents the defect state, and a
    rule with no way to show its own violation is hard to teach.

    This is a coarse text scan, not a parse: it splits on verdict openings and
    looks for a rendered `.k-argument` before the next one. `:has()` in
    keel.css is the precise check; this is the backstop that runs in CI.
    """
    for path in files:
        text = path.read_text()
        chunks = SPLIT_VERDICT.split(text)[1:]
        for i, chunk in enumerate(chunks, 1):
            head = chunk[:2000]
            if "data-specimen-defect" in head:
                continue
            if not RENDERS_ARGUMENT.search(head):
                failures.append(
                    f"{rel(path)}: .k-verdict #{i} has no .k-argument — a class "
                    f"without its causal path is not a verdict"
                )


def check_emoji(files: list[Path]) -> None:
    """6 — no check marks. The unaccountable green check is the subject."""
    for path in files:
        for lineno, line in enumerate(path.read_text().splitlines(), 1):
            if BAD_EMOJI.search(line):
                failures.append(
                    f"{rel(path)}:{lineno} check-mark emoji on a Keel surface — "
                    f"the green check is what this tool criticizes"
                )


def main() -> int:
    if not TOKENS.exists():
        print(f"design-audit: {rel(TOKENS)} not found", file=sys.stderr)
        return 2

    # --fix-sync is a fixer, not a gate: it rewrites the copies and returns.
    # Running the gate in the same breath would report violations the fix has
    # nothing to do with, which teaches people to ignore its exit code.
    if "--fix-sync" in sys.argv:
        check_brand_marks(fix=True)  # derive paper variants before copying them
        check_sync(fix=True)
        return 0 if not failures else 1

    files = governed_files()
    check_literals(files)
    check_brand_marks(fix=False)
    check_sync(fix=False)
    check_verdict_classes()
    check_accounting(files)
    check_arguments(files)
    check_emoji(files)

    if failures:
        print(f"design-audit: {len(failures)} violation(s)\n", file=sys.stderr)
        for f in failures:
            print(f"  {f}", file=sys.stderr)
        print(
            "\nSee skills/keel/design/README.md for the component contract.",
            file=sys.stderr,
        )
        return 1

    print(f"design-audit: {len(files)} governed file(s) clean.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
