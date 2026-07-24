#!/usr/bin/env bash
# role-x-coverage-hook.sh — portable shim for P17 (Lens) coverage report.
#
# See scripts/role-x-intake-hook.sh for why this repo vendors a shim rather than
# committing the absolute path of a per-user skill install. Delegates when
# role-x is present; exits 0 silently otherwise.
#
# Override the lookup with ROLE_X_HOME=/path/to/role-x.

set -uo pipefail

for candidate in \
    "${ROLE_X_HOME:-}" \
    "$HOME/.claude/skills/role-x" \
    "$HOME/.agents/skills/role-x" \
; do
    [ -n "$candidate" ] || continue
    target="$candidate/scripts/role-x-coverage-hook.sh"
    [ -x "$target" ] && exec "$target" "$@"
done

exit 0
