<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="skills/keel/design/lockup.svg" />
    <img src="skills/keel/design/lockup-on-light.svg" alt="Keel" width="268" />
  </picture>
</p>

**Your agents are grading their own homework. Keel measures how much.**

```bash
npx skills add broomva/keel
```

A ship's keel is the reference line everything else is measured from — and an
*even keel* is a stability property, not a decoration.

Keel measures one thing:

> A check is only a check if the signal it reads comes from somewhere the thing
> being checked cannot write to.

Most verification in an agent-maintained codebase fails this. An LLM reviews
what an LLM wrote. A doc is validated against another doc. A status field reads
"passed" because something set it to "passed". The pipeline is green and
nothing has been verified.

## What it does

Keel walks a target's verification edges — CI steps, test targets, review
gates, deploy conditions, integration signals — and classifies each one:

| Class | The signal's producer is… |
|---|---|
| `anchored` | outside the actor's write boundary — a process exit code, a type checker, a payment that settled, a customer action |
| `self_referential` | inside it — an LLM judging output, a doc checked against a doc, a self-set status |
| `unknown` | untraceable. **Fails closed.** |
| `not_a_check` | nothing — the node asserts no property. Excluded from the ratio, which is why it is the one class worth shopping into |

**Grounding ratio** = `anchored / (anchored + self_referential + unknown)`.

`unknown` counts against, deliberately. Absence of evidence of dependence is
not evidence of independence.

## It gets cheaper every run

Novel shapes are judged by the agent. Recurring shapes get crystallized into
**probes** — small, reviewable scripts — so the next occurrence costs no model
call at all. The probe library is code, which means it is diffable, testable,
and rejectable, and it compounds across everyone who runs Keel.

Probes may **abstain**. They may never return `unknown`. A probe that is unsure
falls through to the agent, so a lazy probe degrades to "ask" rather than to
"looks fine."

## And it audits itself

Probes drift. Keel re-decides a sampled fraction of probe-classified nodes
agentically, with the cached verdict hidden, and retires probes that disagree.
The library's agreement rate is Keel's own counter-metric — a tool that
measures groundedness while refusing to measure its own would be making the
exact mistake it exists to find.

## Scope, honestly

Keel measures the *shape* of verification, not its quality. A repo can be 100%
anchored with terrible tests. Anchoring says the signal comes from outside; it
does not say the signal is enough.

## License

MIT.
