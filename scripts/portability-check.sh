#!/usr/bin/env bash
# portability-check.sh — refuse to ship a machine-specific path.
#
# Keel is installed by strangers (`npx skills add broomva/keel`) and cloned by
# contributors. Anything committed here runs on their machine, not ours, so a
# hardcoded `/Users/<someone>/...` is a latent break that is invisible on the
# machine that introduced it — the one place it happens to work.
#
# This regresses easily and quietly: `bstack bootstrap` substitutes absolute
# paths into .claude/settings.json by design (correct for a private workspace,
# wrong for a public repo), so re-running it silently re-breaks portability.
# Hence a gate rather than a convention.
#
# Anchored by construction: it greps the actual committed bytes and exits
# non-zero. The signal comes from the file contents, which no assertion in this
# repo can talk out of.
#
# Usage:
#   scripts/portability-check.sh            # scan tracked files (CI default)
#   scripts/portability-check.sh --staged   # scan staged files (pre-commit)

set -uo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")" || exit 1

MODE="${1:-tracked}"
if [ "$MODE" = "--staged" ]; then
    mapfile -t FILES < <(git diff --cached --name-only --diff-filter=ACM)
    SCOPE="staged"
else
    mapfile -t FILES < <(git ls-files)
    SCOPE="tracked"
fi

# ── Exemptions, stated out loud rather than silently skipped ────────────────
# Narrative records legitimately quote the paths of the machine they describe;
# rewriting them would falsify the record. They ship as prose, and no tool reads
# a path out of them. This script is exempt because it contains the patterns it
# searches for.
#
# Measurement artifacts are exempt for a different and stronger reason. Keel's
# whole method is to carry the LITERAL snippet of a target's verification edge
# into `raw` and reason over the real text, because a summary is already a
# judgment. So a report legitimately quotes whatever the measured repository
# contained — openai-python's CI really does reference `/home/codex`, and
# rewriting that would falsify the evidence a reader is meant to check the
# verdict against. The same applies to a verdict argument quoting the output of
# a command it actually ran.
#
# The machine-local paths that DID leak here (a probe-dir warning, a curve
# disclosure naming the reports dir) are a real defect and are fixed at the
# source: `scripts/publish-reports.ts` rewrites the repo root and $HOME to
# `<repo>`/`<home>` before anything is published. This exemption covers quoted
# CONTENT, never our own paths.
is_exempt() {
    case "$1" in
        scripts/portability-check.sh)   return 0 ;;
        docs/handoffs/*|docs/decisions/*) return 0 ;;
        reports/*|site/reports/*)       return 0 ;;
        *) return 1 ;;
    esac
}

# Operational files: read by a tool at run time, so a personal-workspace path
# here is a functional break, not a stale sentence.
is_operational() {
    case "$1" in
        .claude/*|.control/*|.githooks/*|.github/*|scripts/*|bin/*|Makefile|skills/*) return 0 ;;
        *) return 1 ;;
    esac
}

fail=0
exempted=()

report() { printf '  %-52s %s\n' "$1" "$2"; fail=1; }

for f in "${FILES[@]}"; do
    [ -f "$f" ] || continue
    if is_exempt "$f"; then exempted+=("$f"); continue; fi

    # Rule 1 — absolute home directories. Breaks on every other machine.
    while IFS= read -r hit; do
        [ -n "$hit" ] && report "$f:${hit%%:*}" "absolute home path: $(echo "${hit#*:}" | grep -oE '/(Users|home)/[A-Za-z0-9._-]+' | head -1)"
    done < <(grep -nE '/Users/[A-Za-z0-9._-]+|/home/[A-Za-z0-9._-]+' "$f" 2>/dev/null \
             | grep -vE '/home/runner' | head -5)

    # Rule 2 — a personal workspace root, in a file a tool actually reads.
    if is_operational "$f"; then
        while IFS= read -r hit; do
            [ -n "$hit" ] && report "$f:${hit%%:*}" "personal workspace ref (use \$CLAUDE_PROJECT_DIR / discovery)"
        done < <(grep -nE '~/broomva|\$HOME/broomva|\$\{HOME\}/broomva' "$f" 2>/dev/null | head -5)
    fi
done

echo "[portability] scanned ${#FILES[@]} $SCOPE file(s)"
if [ ${#exempted[@]} -gt 0 ]; then
    echo "[portability] exempt (narrative records, not read by any tool): ${#exempted[@]}"
    for e in "${exempted[@]}"; do echo "    - $e"; done
fi

if [ "$fail" -ne 0 ]; then
    echo ""
    echo "[portability] FAIL — the paths above exist only on the machine that wrote them."
    echo ""
    echo "  hook commands   → \"\$CLAUDE_PROJECT_DIR/scripts/<hook>.sh\""
    echo "  machine-local   → .claude/settings.local.json (gitignored)"
    echo "  tool locations  → discover at run time (see BSTACK in the Makefile)"
    exit 1
fi

echo "[portability] OK — no machine-specific paths in committed files."
exit 0
