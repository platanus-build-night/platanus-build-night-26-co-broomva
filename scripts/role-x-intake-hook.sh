#!/usr/bin/env bash
# role-x-intake-hook.sh — portable shim for P17 (Lens) request intake.
#
# The real hook ships with the `role-x` skill, which lives in a per-user skill
# store whose absolute path differs on every machine. Committing that path would
# break every clone; omitting the hook entirely would drop P17 for the operators
# who do have it. So this repo vendors a shim: it delegates when role-x is
# installed and exits 0 silently when it is not.
#
# Contributors without role-x need to do nothing — this is a no-op for them, and
# deliberately a *silent* one, because a hook that prints a warning on every
# prompt gets disabled, and a disabled hook is worse than an absent one.
#
# Override the lookup with ROLE_X_HOME=/path/to/role-x.

set -uo pipefail

for candidate in \
    "${ROLE_X_HOME:-}" \
    "$HOME/.claude/skills/role-x" \
    "$HOME/.agents/skills/role-x" \
; do
    [ -n "$candidate" ] || continue
    target="$candidate/scripts/role-x-intake-hook.sh"
    # exec preserves stdin, so the hook payload reaches the real implementation.
    [ -x "$target" ] && exec "$target" "$@"
done

exit 0
