# Decision record — bstack bootstrap of the Keel workspace

**Date:** 2026-07-24 · **bstack:** v0.37.1 · **Scope:** governance layer only —
no changes to `skills/keel/**`, the frozen schema, or any Wave-1 unit's files.

Records the non-obvious calls made while installing the governance layer, so the
next agent does not re-litigate them or "fix" a deliberate gap.

---

## 1 · G-L3-2 (rule-of-three) is scoped out of `make bstack-l3-trust`

**Decision.** `bstack-l3-trust` runs G-L3-1 (primitive-lint) only. G-L3-2 stays
available as its own target but is not wired into the trust pack.

**Why.** G-L3-2 audits *primitive promotion* — it requires every primitive added
since P16's formalization to carry ≥3 logged instances in the candidate ledger
at `research/entities/pattern/bstack-engine.md`. Keel authors no primitives; it
inherits P1–P20 and promotes nothing. There is no ledger here, so the script
fails on a missing file rather than on a real violation.

Wiring it anyway would ship a gate that fails by construction. A gate that
always fails is not a gate — it gets ignored, then bypassed, and its red stops
carrying information. That is precisely the failure this repository exists to
name, so shipping one in our own Makefile was not an option.

**Scope of the exemption.** Narrow. The moment Keel promotes its own primitive
(a P21, or a Keel-specific governance rule), G-L3-2 becomes load-bearing and
belongs in the pack. Revisit then, not before.

## 2 · `.control/policy.yaml` gates rewritten to name their enforcer

**Decision.** Every gate now carries `pattern` and/or `measurement` naming the
mechanism that actually enforces it. Added G3b (hard reset onto a remote ref),
which the deployed hook enforces but the policy did not declare.

**Why.** The scaffolded template declared G1–G4 as `severity: blocking` with no
`pattern` and no `measurement` — a status field reading "blocking" because
something set it to "blocking". Under Keel's own classification that is
`self_referential`, and it sat in the governance file of the tool that exists to
flag it. `bstack doctor` §11 independently flagged the same thing.

**Verified by execution, and it corrected a first draft of this record.** All
five blocking gates were exercised against the hook with synthetic PreToolUse
payloads (blocked, exit 2) alongside five false-positive probes (`git push`
without `--force`, `bun test`, writing a `.ts` file, `gh auth status
--show-credentials`, a grep containing `autoApprove: true`) — all allowed.

That run falsified the claim this record originally made. The `pattern:` fields
here **document** the rules; they do not enforce them:

- Every refusal carried the hook's own embedded label, never `policy.yaml gate`
  — the hardcoded list in the script is what blocks.
- The merge scan is `^\s*pattern:`, which matches mapping-form keys but not
  `- pattern:` list items, so the six content-scanning entries lower in
  `policy.yaml` are read by nothing.
- Merged values are taken as raw file text with no YAML unescaping, so `\\s`
  reaches `re.search` as an escaped literal backslash. Every pattern in the
  gates block is therefore inert as a matcher: `git\\s+push\\b...` does not
  match `git push --force origin main`.

The one real hazard is narrower than first written, and still worth the CAUTION
comment: a **backslash-free** pattern in mapping form does merge and does match,
as a Bash-command regex. A bare `credentials` would block `gh auth status
--show-credentials`. G4 (secret-file writes) is path-scoped via `measurement:`
only and deliberately carries no `pattern:`.

The `measurement:` fields were rewritten to name the embedded rule list as the
producer rather than the adjacent `pattern:` field. Naming the wrong producer in
a field whose entire job is to name the producer is the failure this repository
exists to detect; it survived one draft here.

## 3 · No repo-local knowledge graph

**Decision.** Do not create `research/entities/` or `docs/knowledge-index.md`
here. `bstack doctor` will keep reporting the P6 catalog as a gap; that gap is
expected and correct.

**Why.** `bookkeeping` resolves to the workspace-global graph at `~/broomva`
(~746 entities, ~2,569 edges). A second catalog rooted in this repo would make
`/kg load` route to a near-empty graph instead of the real one — fragmenting
retrieval to satisfy a checker. Keel's arc belongs in the global graph, wired to
`evidentiary-independence-conservation`, `grounded-vs-ungrounded-improvement`,
`correlated-verifier-is-no-verifier`, and `loop-engineering`; that is already
listed as a post-event follow-up in the build-night handoff §7.

## 4 · Stack detection says Pattern H; the Dogfood Plan says otherwise

**Decision.** The Dogfood Plan is written to Pattern D (CLI) discipline plus a
clean-room install gate, and says so explicitly.

**Why.** `bstack doctor` §13 detects **Pattern H (knowledge vault)** because the
repo has no root build manifest — but `skills/keel/**` is TypeScript run by Bun.
Keel's real shape (an agent skill shipping a SKILL.md plus executable scripts,
installed via `npx skills add`, driven from inside a host harness) has no
cookbook pattern. Accepting H would have downgraded the evidence bar to
"markdown repo".

**Upstream candidate.** An "agent skill" pattern for
`bstack/references/dogfood-patterns.md`. First instance — not yet rule-of-three,
so it is recorded here rather than promoted.

## 5 · Portability — committed files must run on someone else's machine

Keel is installed by strangers (`npx skills add broomva/keel`) and cloned by
contributors, so a hardcoded path is a break that is invisible on the one
machine where it happens to work. The bootstrap's default output was not
portable: `bstack bootstrap` substitutes absolute paths into
`.claude/settings.json` by design — correct for a private workspace, wrong for a
public repo. Six hook commands pointed at `/Users/broomva/keel/scripts/...` and
three more at personal skill installs outside the repo entirely.

**Decisions.**

- **Hooks resolve via `$CLAUDE_PROJECT_DIR`**, which Claude Code sets for all
  command hooks. Never an absolute path in a committed hook.
- **Per-user skill hooks are wired through vendored shims.** `role-x-intake`,
  `role-x-coverage`, and `auth-preflight` now have shims in `scripts/` that
  delegate via `exec` when the skill is installed (preserving the stdin payload)
  and exit 0 silently otherwise. Chosen over the two alternatives: committing
  `$HOME/...` paths gives contributors a hook error on every prompt, and moving
  them to `.claude/settings.local.json` drops P17 from `bstack doctor`'s view.
  The shim keeps the primitive wired, the repo portable, and the clone quiet.
  Silence is deliberate — a hook that warns on every prompt gets disabled.
- **`--scope=workspace` refuses instead of guessing.** `branch-janitor.sh`
  defaulted to `$HOME/broomva`; on a stranger's machine that is either absent or,
  worse, a real directory. It now requires `BSTACK_WORKSPACE_ROOT` and exits 2
  without it. For a tool that deletes branches, refusing to guess is the only
  acceptable failure mode.
- **bstack is an optional dependency.** The `Makefile` discovers it across the
  usual roots and prints an actionable message when absent. Every repo-local
  gate (`bstack-l3-trust`, `janitor`, `portability-check`) runs from vendored
  scripts on a bare clone with no bstack at all.
- **Machine-local telemetry is gitignored.** `.control/leverage-*.json*` and
  `composite-omega-history.jsonl` embed absolute paths and per-session counters.
  `.control/*.yaml` and `*.toml` stay committed — those are configuration, not
  measurements. This mattered concretely: a concurrent actor had already swept
  untracked files into an unrelated commit once during this session.

**The gate.** `scripts/portability-check.sh` greps committed bytes for absolute
home paths and for personal-workspace references in files a tool actually reads,
and exits non-zero. It runs in `.github/workflows/portability.yml` on a clean
runner with none of the maintainer's tooling present — so the signal comes from
outside anything this repo can assert about itself. It found three violations I
had missed by reading (`policy.yaml`, `.githooks/pre-commit`,
`branch-janitor.sh`), which is the P11 argument in miniature.

The CI lane also asserts the control gate in **both** directions — a destructive
command blocked, an ordinary one allowed. Asserting only the block would pass
against a hook that denies everything.

**Exemptions are printed, not silent.** `docs/handoffs/` and `docs/decisions/`
are narrative records that legitimately quote the paths of the machine they
describe; rewriting them would falsify the record, and no tool reads a path out
of them. The checker lists what it skipped on every run.

---

## Upstream bstack findings (v0.37.1) — report, do not patch locally

Both were found by running the scaffold, not by reading it. Neither is patched
in this repo: `scripts/*-hook.sh` are deployed copies and a local edit would
drift from upstream and be silently overwritten on the next bootstrap.

1. **The scaffolded `AGENTS.md` cannot pass bstack's own G-L3-1 gate.**
   `assets/templates/AGENTS.md.template` omits the `**Why**` section for every
   primitive and emits a non-canonical `**How (PR CI canonical)**` header for P9,
   while `scripts/bstack-primitive-lint.py` requires all four of What / How /
   Why / Invariant. A fresh `bstack bootstrap` therefore produces a workspace
   that fails the trust gate the same bootstrap wires — 21 errors here before
   the sections were authored. The hand-maintained `~/broomva` workspace passes,
   which is why this has stayed invisible.

2. **`control-gate-hook.sh` cannot read the policy patterns it claims to merge.**
   Two independent defects compound:

   - *The scan misses list form.* The merge loop greps `^\s*pattern:`, which
     matches mapping-form keys but not `- pattern:` list items. The shipped
     template's six content-scanning entries (`runOn:\s*folderOpen`,
     `chat\.tools\.autoApprove:\s*true`, `--dangerously-skip-permissions`, …)
     are written in list form, so nothing reads them.
   - *No YAML unescaping.* Values that do get merged are taken as raw file text,
     so `\\s` reaches `re.search` as an escaped literal backslash and the
     pattern never matches a real command.

   Net effect: `.control/policy.yaml` patterns are inert everywhere, and the
   only live enforcement is the list hardcoded in the script. Separately, those
   six entries are declared `severity: blocking` for file *content*, while the
   hook applies no content scanning at all — `Write` / `Edit` are matched
   against `file_path` only. They are decorative in two independent ways.

   The narrow live hazard: a backslash-free pattern in mapping form *does* merge
   and *does* match as a Bash-command regex.
