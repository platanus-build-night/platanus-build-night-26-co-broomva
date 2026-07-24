---
name: keel
description: >
  Measure whether a codebase's verification actually touches the world, or
  whether it is checking itself. Keel gathers every verification edge in a
  target (CI steps, test targets, review gates, deploy conditions, integration
  signals), classifies each one as anchored, self-referential, or unknown by
  asking whether the actor being verified can write to the signal's producer,
  and reports a grounding ratio. Novel cases are judged by the agent and then
  crystallized into probes — small reviewable scripts — so repeat shapes get
  cheaper every run. Use when: (1) auditing whether AI-generated or
  agent-maintained work is genuinely verified, (2) assessing how AI-native a
  company or repo actually is, (3) reviewing a CI/CD pipeline for circular
  verification, (4) someone claims tests pass and you want to know what that
  claim rests on, (5) measuring verifier independence. Triggers on keel,
  grounding ratio, grounded, is this actually verified, who checks the checker,
  circular verification, self-referential verification, verifier independence.
---

# Keel

A ship's keel is the reference line everything else is measured from. It is
also what keeps the ship from capsizing — an even keel is a stability
property, not a decoration.

Keel measures one thing:

> **A check is only a check if the signal it reads comes from somewhere the
> thing being checked cannot write to.**

Most verification in an agent-maintained codebase fails this. An LLM reviews
what an LLM wrote. A doc is validated against another doc. A status field says
"passed" because something set it to "passed". The pipeline is green and
nothing has been verified.

## The classification

Every verification edge gets exactly one class. The question is never "is this
a good check" — it is **who produces the signal, and can the actor write to
that producer?**

| Class | Means | Examples |
|---|---|---|
| `anchored` | The producer is outside the actor's write boundary | a test process exit code, a type checker, a payment that settled, a third-party API, a customer action, an independent prober |
| `self_referential` | The producer is inside it | an LLM judging output, a doc checked against a doc, a self-set status field, an agent asserting it completed |
| `unknown` | The fork point could not be established | anything you cannot trace |
| `not_a_check` | It asserts nothing about correctness | a dev server, a help target, a formatter that only rewrites, a step that cannot fail (`\|\| true`, `echo ok`) |

`unknown` **fails closed** — it counts against the ratio, exactly like
`self_referential`. Absence of evidence of dependence is not evidence of
independence. And `unknown` is never settable by the thing being measured:
if the target could choose its own class it would never choose `unknown`.

`not_a_check` is **excluded from the ratio** — a node that asserts nothing
would be a lie in either column. But it is the one **shoppable** class:
mis-filing a real check here shrinks the denominator and inflates the score.
So it carries the same burden of argument as any other verdict, the report
prints its count beside the ratio, and the audit samples it like everything
else. If you reach for it because a node is *hard*, the honest answer is
`unknown`.

Grounding ratio = `anchored / (anchored + self_referential + unknown)`.

## The loop

Run these in order. Stages 3 and 4 are optional — stage 2 alone produces a
complete, honest report.

### 1. Gather (mechanical)

Find candidate verification edges. This step *locates surfaces*; it does not
judge them. Look at CI workflow definitions, package/task/make scripts, test
configuration, review and branch-protection requirements, deploy and promotion
conditions, and any wired integrations. Emit `Node[]` per `schemas/keel.ts`.

Carry the **literal snippet** into `raw`. Downstream reasoning happens over the
real text, never over a summary you wrote — a summary is already a judgment.

### 2. Classify (agentic, cache-first)

For each node:

1. **Try the probe library.** Load probes from the shipped `probes/` directory
   and from `~/.config/keel/probes/`. Run `match(node)`; on a hit, run
   `assess(node)`. A non-null result is the verdict — record `decidedBy:
   'probe'` and move on. This costs no tokens.
2. **On no match, or on abstention, judge it yourself.** Read `raw`. Ask the
   only question that matters:

   > What actually produces this signal, and can the actor being verified
   > write to it?

   Trace the causal path. A test command is anchored because the runtime
   decides the exit code and no amount of persuasion changes it. An LLM review
   step is self-referential because the same class of system that produced the
   work produces the assessment. A deploy check that reads a status field the
   deployer sets is self-referential no matter how many green checkmarks it
   renders.

   Fill `writeBoundary.argument` with the causal path, not a restatement of the
   class. "Self-referential because it is self-referential" is a failed verdict.
   If you cannot trace it, say `unknown` — that is a real answer and it is
   often the correct one.

See `references/grounding-classes.md` for worked cases, including the ones that
look anchored and are not.

### 3. Crystallize (optional)

When you judged a node the library could not, and the shape will recur, write a
probe to `~/.config/keel/probes/<id>.ts` implementing the `Probe` interface.

Rules:

- A probe **abstains** (`return null`) whenever it is unsure. It may never
  return `unknown`. Abstention costs a model call; a wrong confident probe
  costs correctness.
- Generalize the *shape*, never the specific repo. `match` keys on structure.
- One probe, one shape. A probe matching everything is a rule table wearing a
  costume, and it will rot.
- Probes are code so they can be read, diffed, tested, and rejected. Keep them
  small enough to review in under a minute.

Minted probes live in `~/.config/keel/probes/` so a skill update never destroys
them. Contribute one back by copying it into this repo's `probes/` and opening
a PR — that is how the library compounds across everyone who runs Keel.

### 4. Audit (optional, and the honest part)

Probes drift. A generalization that over-matches will mis-classify silently
forever, and the failure is invisible precisely because it is cheap.

So: sample a fixed fraction of probe-decided nodes — start at ~10% — and
re-decide them agentically **with the cached verdict hidden from you.** Record
the comparison in `verdict.audit`. On disagreement, narrow the probe's `match`
or retire it.

The probe library's agreement rate is Keel's own counter-metric. Report it. A
system that measures groundedness while refusing to measure its own is telling
you something.

## Output

Write `Report` (see `schemas/keel.ts`) as JSON, then render a self-contained
HTML report alongside it. The HTML carries the grounding ratio, the node graph
with each class, the write-boundary argument for every verdict, and — across
runs — the crystallization curve of cost per node as the probe library grows.

**The ratio never travels alone.** Print the absolute anchored count and the
gathered-surface coverage (nodes by kind) beside it, always. A 1.0 over one
edge and a 0.7 over fifty are different claims, and a bare ratio rewards
*deleting* checks — the pair is the guard. A target with zero gathered nodes
gets an explicit "nothing gathered" state, never a ratio.

Report `unknown` prominently. It is the most honest number Keel produces.

## Scope

Keel measures the *shape* of verification, not its quality. A repo can be 100%
anchored and have terrible tests. Anchoring says the signal comes from outside;
it does not say the signal is sufficient. Do not let a high ratio be read as
"well tested", and say so in the report.
