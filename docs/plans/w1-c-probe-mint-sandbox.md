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

**`probe-sandbox.ts`** — execute probe code safely:
- child process, **no network**, hard timeout (~2s), read-only view of the target
- a probe that hangs, throws, or exceeds budget is **skipped and reported**,
  never fatal to the run
- this is the honest answer to *"you're running LLM-generated code?"* — build
  the subprocess version; Firecracker is the year-two answer for probes running
  against customer infrastructure

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
bun scripts/probe-sandbox.ts ~/.config/keel/probes/<id>.ts /tmp/node.json

# adversarial: these must all be non-fatal and reported
#   probe with `while(true){}`        -> timeout, skipped
#   probe that throws                 -> skipped
#   probe that returns 'unknown'      -> REJECTED at load with a clear error
#   probe attempting network access   -> blocked
```

## Do not touch

`schemas/keel.ts` · `scripts/classify.ts` (W1·A owns dispatch) · `SKILL.md` ·
`README.md` · `probes/README.md` · `site/**`
