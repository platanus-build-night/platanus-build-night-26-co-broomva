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
skills.sh and it cost real debugging time. Export exactly
`loadProbes(dirs: string[]): Promise<{probes: Probe[]; warnings: string[]}>` —
this signature is part of the sandbox contract
(`00-orchestration.md`) and W1·C's child imports it. **Loading a probe
executes its file**, so `loadProbes` is only ever called inside the sandbox
child — never call it from `classify.ts`.

**`classify.ts`** — the sandbox PARENT (see the sandbox contract in
`00-orchestration.md` — it is the interface, do not improvise):

1. Spawn `bun scripts/probe-sandbox.ts <nodes.json> --probe-dir ... ` (W1·C's
   child; code to the contract, not to their implementation — a thin stub of
   the child is fine for local testing until merge).
2. Hold a **wall-clock kill-timer on the child** (~10s default). Child dead,
   hung, or killed → ALL nodes `pending`, warning recorded, exit 0.
3. Parse the child's `ClassifyOutput` (schema v2), then emit:
   - `decided[]` — probe verdicts
   - `pending[]` — nodes needing agent judgment, as structured prompt payloads
     **batched 10–20 nodes per payload** (node id, kind, name, source, **full
     raw**). One node per call does not survive a 15-repo corpus night.

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
- **Never execute probe code in-process.** A synchronous `while(true)` cannot
  be preempted in JS — an in-process "time guard" is fiction. The only place
  probe code runs (including load) is the sandbox child, and the only real
  timeout is the parent's kill-timer on the process handle.

## Acceptance

```bash
cd skills/keel
# Target this repo — portable, so the acceptance run reproduces off a bare clone.
bun scripts/gather.ts ../.. --json > /tmp/nodes.json
bun scripts/classify.ts /tmp/nodes.json --json | head -40
# with an empty probe library: decided=0, pending=<node count>, exit 0
# then add a deliberately-throwing probe to ~/.config/keel/probes/ and confirm
# it is skipped WITH a warning and the run still completes
# then add a probe whose match() is `while(true){}` and confirm the batch is
# killed at the timeout, all nodes land pending, and the run STILL exits 0
```

## Do not touch

`schemas/keel.ts` · `gather.ts` · `SKILL.md` · `README.md` · `site/**` ·
`probes/README.md`
