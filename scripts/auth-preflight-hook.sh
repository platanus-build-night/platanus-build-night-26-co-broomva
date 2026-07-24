#!/usr/bin/env bash
# auth-preflight-hook.sh — portable shim for the session-start auth warning.
#
# Warns (never blocks) when `gh` is unauthenticated, so an autonomous arc learns
# it at session start rather than dying on the push/PR step an hour in.
#
# The full implementation ships with bstack. This shim delegates when bstack is
# installed and otherwise falls back to a minimal inline check, so a bare clone
# still gets the warning. Either way it exits 0 — a preflight that blocks the
# session is a preflight nobody keeps.
#
# Override the lookup with BSTACK_REPO=/path/to/bstack.

set -uo pipefail

for candidate in \
    "${BSTACK_REPO:-}" \
    "$HOME/.claude/skills/bstack" \
    "$HOME/.agents/skills/bstack" \
    "$HOME/.local/share/bstack" \
; do
    [ -n "$candidate" ] || continue
    target="$candidate/scripts/auth-preflight-hook.sh"
    [ -x "$target" ] && exec "$target" "$@"
done

# Fallback: bstack absent. Keep it to the one check that actually bites here —
# Keel's PR pipeline and the corpus runner both need an authenticated gh.
if command -v gh >/dev/null 2>&1; then
    gh auth status >/dev/null 2>&1 || \
        echo "[preflight] gh is not authenticated — 'gh auth login' before any PR or corpus run." >&2
fi

exit 0
