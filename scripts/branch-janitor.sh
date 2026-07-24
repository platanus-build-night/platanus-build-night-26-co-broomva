#!/bin/bash
# branch-janitor.sh — bstack P8: Branch + Worktree Janitor
#
# Detects merged branches (including squash-merged) and dead worktrees,
# removes them safely. Closes the orphaned-branch accumulation bug where
# squash-merged feature branches and their worktrees would otherwise
# accumulate indefinitely (squash-merge breaks `git branch --merged`).
#
# Usage:
#   branch-janitor.sh [--dry-run] [--include=PATTERN] [--scope=current|workspace]
#
# Defaults:
#   --dry-run by default (safe). Pass --apply to actually delete.
#   --include="feat/*,fix/*,chore/*,docs/*"
#   --scope=current (only operate on cwd repo)
#
# Safety invariants:
#   - Never touches main, master, develop, HEAD, gh-pages
#   - Never touches any branch listed in ~/.config/broomva/p8-janitor/protected.txt
#   - Only deletes branches whose tip is an ancestor of origin/main OR
#     whose patch content has been squash-merged into origin/main
#   - Skips worktrees on protected branches; prunes only dead worktrees
#     (where the underlying branch is gone)
#
# Detection of squash-merged branches uses the canonical git idiom:
# create a synthetic commit (branch's tree on top of merge-base) and
# check if its patch is in main via `git cherry`.

set -euo pipefail

# ───── defaults ─────
APPLY=0
INCLUDE_PATTERN="feat/*,fix/*,chore/*,docs/*"
SCOPE="current"
P8_JANITOR_DIR="${BROOMVA_P8_JANITOR_HOME:-${XDG_CONFIG_HOME:-$HOME/.config}/broomva/p8-janitor}"
PROTECTED_BRANCHES_DEFAULT="main master develop HEAD gh-pages"

# ───── arg parsing ─────
while [ $# -gt 0 ]; do
    case "$1" in
        --apply) APPLY=1; shift ;;
        --dry-run) APPLY=0; shift ;;
        --include=*) INCLUDE_PATTERN="${1#--include=}"; shift ;;
        --scope=*) SCOPE="${1#--scope=}"; shift ;;
        --help|-h)
            grep -E '^#( |$)' "$0" | sed 's/^# \?//' | head -40
            exit 0 ;;
        *) echo "unknown arg: $1" >&2; exit 2 ;;
    esac
done

mkdir -p "$P8_JANITOR_DIR"
PROTECTED_FILE="$P8_JANITOR_DIR/protected.txt"
[ -f "$PROTECTED_FILE" ] || touch "$PROTECTED_FILE"

# ───── repos to scan ─────
declare -a REPOS=()
if [ "$SCOPE" = "current" ]; then
    if git rev-parse --show-toplevel >/dev/null 2>&1; then
        REPOS+=("$(git rev-parse --show-toplevel)")
    else
        echo "p8-janitor: not in a git repo (use --scope=workspace to walk all)" >&2
        exit 2
    fi
elif [ "$SCOPE" = "workspace" ]; then
    BROOMVA="${BROOMVA:-$HOME/broomva}"
    while IFS= read -r d; do
        REPOS+=("$d")
    done < <(find "$BROOMVA" -maxdepth 4 -name ".git" -type d 2>/dev/null | xargs -I{} dirname {})
else
    echo "p8-janitor: bad --scope ($SCOPE); use current or workspace" >&2; exit 2
fi

# ───── branch checks ─────
is_protected() {
    local b="$1"
    for p in $PROTECTED_BRANCHES_DEFAULT; do
        [ "$b" = "$p" ] && return 0
    done
    if grep -qx "$b" "$PROTECTED_FILE" 2>/dev/null; then
        return 0
    fi
    return 1
}

matches_include() {
    local b="$1"
    local IFS=','
    for pat in $INCLUDE_PATTERN; do
        # shellcheck disable=SC2053
        case "$b" in $pat) return 0 ;; esac
    done
    return 1
}

# Detect if branch has been squash-merged into origin/main.
# Returns 0 if merged, 1 if not.
is_squash_merged() {
    local branch="$1"
    local main_ref="${2:-origin/main}"
    if ! git rev-parse --verify "$main_ref" >/dev/null 2>&1; then
        return 1  # no main ref to compare against
    fi
    # Plain ancestor check (regular merge or fast-forward)
    if git merge-base --is-ancestor "$branch" "$main_ref" 2>/dev/null; then
        return 0
    fi
    # Squash-merge detection via synthetic commit
    local mb tree synth
    mb=$(git merge-base "$main_ref" "$branch" 2>/dev/null) || return 1
    tree=$(git rev-parse "$branch^{tree}" 2>/dev/null) || return 1
    synth=$(git commit-tree "$tree" -p "$mb" -m "_squash_check_" 2>/dev/null) || return 1
    # `git cherry` lists patches. Lines starting with `-` are already in main.
    if git cherry "$main_ref" "$synth" 2>/dev/null | grep -qE '^-'; then
        return 0
    fi
    return 1
}

# ───── per-repo cleanup ─────
total_repos=0
total_branches_dropped=0
total_worktrees_pruned=0

for repo in "${REPOS[@]}"; do
    # `.git` is a directory in a normal checkout, a file in a worktree
    [ -e "$repo/.git" ] || continue
    total_repos=$((total_repos + 1))
    echo ""
    echo "═══ $repo ═══"
    cd "$repo"

    # Refresh remote ref for accurate squash-merge detection
    git fetch origin --quiet 2>/dev/null || echo "  (warn: fetch failed; using local refs)"

    # 1. Branches
    while IFS= read -r branch; do
        [ -z "$branch" ] && continue
        if is_protected "$branch"; then
            continue
        fi
        if ! matches_include "$branch"; then
            continue
        fi
        # Skip currently-checked-out branch
        if [ "$(git symbolic-ref --short HEAD 2>/dev/null)" = "$branch" ]; then
            echo "  [skip] $branch (currently checked out)"
            continue
        fi
        if is_squash_merged "$branch"; then
            if [ "$APPLY" = "1" ]; then
                if git branch -D "$branch" >/dev/null 2>&1; then
                    echo "  [drop] $branch (merged)"
                    total_branches_dropped=$((total_branches_dropped + 1))
                else
                    echo "  [skip] $branch (delete failed)"
                fi
            else
                echo "  [dry-run drop] $branch (merged)"
            fi
        fi
    done < <(git branch --format='%(refname:short)')

    # 2. Worktrees — prune any whose branch is gone or no longer exists
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        case "$line" in
            "worktree "*)
                wt_path="${line#worktree }"
                ;;
            "branch "*)
                wt_branch="${line#branch refs/heads/}"
                # Skip the main worktree
                if [ "$wt_path" = "$repo" ]; then
                    continue
                fi
                # Check if branch still exists
                if ! git rev-parse --verify "$wt_branch" >/dev/null 2>&1; then
                    if [ "$APPLY" = "1" ]; then
                        if git worktree remove --force "$wt_path" >/dev/null 2>&1; then
                            echo "  [prune] worktree $wt_path (branch $wt_branch gone)"
                            total_worktrees_pruned=$((total_worktrees_pruned + 1))
                        fi
                    else
                        echo "  [dry-run prune] worktree $wt_path (branch $wt_branch gone)"
                    fi
                fi
                ;;
        esac
    done < <(git worktree list --porcelain 2>/dev/null)

    # Always run the standard prune to clean up admin state
    git worktree prune 2>/dev/null || true
done

echo ""
echo "═══ summary ═══"
echo "  scope:    $SCOPE ($total_repos repo(s) scanned)"
echo "  mode:     $([ "$APPLY" = "1" ] && echo APPLY || echo DRY-RUN)"
echo "  dropped:  $total_branches_dropped branch(es)"
echo "  pruned:   $total_worktrees_pruned worktree(s)"
echo ""
[ "$APPLY" = "0" ] && echo "  Run with --apply to actually delete."
exit 0
