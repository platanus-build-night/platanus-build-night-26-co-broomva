# W1·A · Classify engine (MVP-critical, critical path)

## Context

Read `docs/handoffs/2026-07-24-keel-build-night.md` §1, §4.1.
Read `skills/keel/SKILL.md` §2 (the classify stage) — it is the spec.
Read `skills/keel/schemas/keel.ts` (frozen).
Read `skills/keel/scripts/gather.ts` for the upstream node shape.

## You own (write only these)

- `skills/keel/scripts/probe-loader.ts`
- `skills/keel/scripts/classify.ts`

## Deliverable

**`probe-loader.ts`** — discover and load probes from, in order:
1. `skills/keel/probes/*.ts` (shipped)
2. `~/.config/keel/probes/*.ts` (runtime-minted; survives skill updates)

Validate each against the `Probe` interface. A malformed probe is **skipped
with a warning, never silently** — that failure mode is documented upstream in
skills.sh and it cost real debugging time. Return `Probe[]`.

**`classify.ts`** — cache-first dispatch:

```
for each node:
  for each probe where probe.match(node):
    v = probe.assess(node)
    if (v !== null) -> verdict, decidedBy:'probe', probeId; break
  if no verdict -> node goes to the PENDING set
```

Output two artifacts:
- `decided[]` — probe verdicts
- `pending[]` — nodes needing agent judgment, emitted as a structured prompt
  payload the agent can consume (node id, kind, name, source, **full raw**)

**The zero-probe path must be complete.** With an empty library, everything
lands in `pending` and the run is still valid. Probes are strictly a cache
layer; the pure-agentic path is the product.

## Hard requirements

- **No rule tables.** If you write `if (cmd.includes('vitest')) return 'anchored'`
  you have built the thing this project exists to argue against. Judgment is
  agentic; this file is dispatch plumbing only.
- **`assess()` returning `null` means ABSTAIN → falls through to pending.** A
  probe returning `unknown` is a contract violation: reject it at load time
  with a clear error.
- Never default a node to `anchored`. Absence of a verdict is `pending`, not a
  class.
- Probe execution must not be able to hang the run — wrap `match`/`assess` in a
  try/catch and a time guard; a throwing probe is skipped and reported.

## Acceptance

```bash
cd skills/keel
# Target this repo — portable, so the acceptance run reproduces off a bare clone.
bun scripts/gather.ts ../.. --json > /tmp/nodes.json
bun scripts/classify.ts /tmp/nodes.json --json | head -40
# with an empty probe library: decided=0, pending=<node count>, exit 0
# then add a deliberately-throwing probe to ~/.config/keel/probes/ and confirm
# it is skipped WITH a warning and the run still completes
```

## Do not touch

`schemas/keel.ts` · `gather.ts` · `SKILL.md` · `README.md` · `site/**` ·
`probes/README.md`
