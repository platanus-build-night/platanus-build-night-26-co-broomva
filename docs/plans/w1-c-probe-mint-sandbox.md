# W1·C · Probe minting + sandbox (MVP-critical — demo beat 2)

This unit is what makes the library *compound*, and it is the beat where the
audience watches the system learn.

## Context

Read `docs/handoffs/2026-07-24-keel-build-night.md` §1, §3.2 (sandbox posture).
Read `skills/keel/SKILL.md` §3 (crystallize).
Read `skills/keel/probes/README.md` — the contract and its rules.
Read `skills/keel/schemas/keel.ts` (frozen) — `Probe`, `ProbeMeta`.

## You own (write only these)

- `skills/keel/scripts/mint-probe.ts`
- `skills/keel/scripts/probe-sandbox.ts`
- `skills/keel/probes/*.ts` (example probes only — see below)

## Deliverable

**`mint-probe.ts`** — given a node + the agent's verdict for it, scaffold a
probe to `~/.config/keel/probes/<id>.ts`:
- valid `Probe` implementation, `mintedFrom` = the originating node id
- `match` keys on **structure, never on a repo name or path literal**
- validate the minted file loads and satisfies the interface before writing
- refuse to overwrite an existing probe id; version instead

**`probe-sandbox.ts`** — the sandbox CHILD per the contract in
`00-orchestration.md` (the contract is the interface — code to it, not to
W1·A's implementation):

- Invoked as `bun scripts/probe-sandbox.ts <nodes.json> [--probe-dir <dir>]...`
- Loads probes via W1·A's `loadProbes(dirs)` (loading executes probe files —
  that is WHY loading happens here and not in the parent), runs
  `match`/`assess` over **all** nodes in one process, writes `ClassifyOutput`
  JSON to stdout. One spawn per run — a process per probe would wreck the
  economics D measures.
- Per-probe try/catch: a throwing probe is **skipped and reported** in
  `warnings`, never fatal. A hang is the PARENT's problem (kill-timer) — do
  not pretend to time out synchronous code in-process.
- **Before hand-rolling isolation, spend ≤15 min checking the workspace
  control kernel** (`~/broomva/.control/policy.yaml`, S3/S4 shield surface)
  for reusable enforcement — Keel's sandbox posture *being* the workspace
  policy beats an ad-hoc reimplementation.
- **Network: claim only what is enforced.** Preferred: a macOS `sandbox-exec`
  deny-default profile (~10 lines: allow file-read of target + probes,
  deny network). If that fails in ~20 min, fall back to subprocess + stripped
  env (no keys) + parent kill-timer, and **say exactly that** — in this
  product, an overclaimed sandbox is self-refuting on stage. Firecracker is
  the year-two answer for probes running against customer infrastructure.

**Example probes** — ship **at most two**, and only as *contract references*
clearly marked as examples. Do not seed a library of hand-written rules: the
thesis is that probes are crystallized agent judgment, and a hand-authored rule
table smuggled in as "seeds" would falsify the crystallization curve W1·G
measures.

## Hard requirements

- A minted probe **abstains** (`return null`) whenever unsure, and **may never
  return `unknown`**. Enforce at mint time.
- One probe, one shape. Reject a `match` that would obviously match everything.
- Probes are code so humans can reject them — keep each under ~40 lines.

## Acceptance

```bash
cd skills/keel
# mint from a real node + verdict, then prove it loads and runs sandboxed
bun scripts/mint-probe.ts --node /tmp/node.json --verdict /tmp/verdict.json
bun scripts/probe-sandbox.ts /tmp/nodes.json --probe-dir ~/.config/keel/probes

# adversarial: these must all be non-fatal and reported
#   probe that throws                 -> skipped, in warnings
#   probe that returns 'unknown'      -> REJECTED at load with a clear error
#   probe with `while(true){}`        -> child hangs; killed by the PARENT's
#                                        timer (verify with `timeout 12 bun ...`
#                                        until A's classify.ts is merged)
#   probe attempting network access   -> blocked IF sandbox-exec landed;
#                                        otherwise documented as not-enforced
```

## Do not touch

`schemas/keel.ts` · `scripts/classify.ts` (W1·A owns dispatch) · `SKILL.md` ·
`README.md` · `probes/README.md` · `site/**`
