# Contributing to Keel

The highest-value contribution is **a probe**. Everything else is welcome too,
but probes are what make Keel cheaper for everyone the more it gets used.

## The one hard rule

`skills/keel/schemas/keel.ts` is **frozen**. It is the contract between the
engine and every consumer, and changing it mid-flight silently invalidates work
in progress elsewhere. If you believe the schema is wrong, **open an issue
rather than a PR** — say what breaks and why, and it gets re-frozen and
re-published deliberately.

## Setup

```bash
git clone https://github.com/broomva/keel.git
cd keel
bun install          # Bun + TypeScript + Biome. No npm, no yarn, no ESLint.
```

Keel has **zero runtime dependencies** unless a plan names one. `gather.ts`
parses YAML-ish text without a YAML library on purpose: carrying the literal
snippet forward beats half-understanding it.

## Contributing a probe

A probe is a small, reviewable script that classifies a recurring verification
shape without a model call. Mint one when you have judged something the library
could not and the shape will recur.

1. Put it in `skills/keel/probes/<id>.ts`.
2. In the PR, include **the node it came from** and **the reasoning** — the
   causal path you traced, not just the conclusion.
3. **A probe must abstain when unsure.** Return `null`.
4. **A probe may never return `unknown`.** `unknown` is a claim about the
   world, and only the agent gets to make it. This is what keeps the class
   unshoppable: a lazy probe degrades to *ask*, never to *looks fine*.

Probes are code, which means they are diffable, testable, and rejectable. A
probe that encodes a lookup table from check-name to class will be rejected —
that table is precisely the ungrounded artifact Keel exists to detect.

## Checks

| Command | What it gates |
|---|---|
| `bun test` | The engine. Executed assertions, not assertions about assertions |
| `make design-audit` | Design-system adherence — raw literals, token drift, schema/CSS agreement |
| `make design-sync` | Regenerates the derived design assets the audit compares against |
| `make portability-check` | Fails if a committed file hardcodes a machine-specific path |
| `make bstack-l3-trust` | Governance-change structural validity |

Run `make help` for the full list.

## Keel's own CI is a verification edge Keel will classify

Write checks that would score `anchored` — executed assertions whose signal
comes from a process this repo cannot talk its way out of. A test that asserts
a constant is `self_referential` by our own definition, and publishing a poor
grounding ratio for ourselves at a pitch about grounding ratios is a bad look.
Fixing that by filing checks under `not_a_check` is worse.

## Pull requests

- Branch from `main`, one concern per PR.
- Explain the *why*. A diff shows what changed; the PR body is where the
  reasoning lives.
- Say what you verified and how. "Tests pass" is weaker than the command you
  ran and what it printed.
- If something is unfinished or you are unsure, say so in the PR rather than
  leaving it to be discovered in review.

Docs, design-system, and site changes follow the same route. `SKILL.md`,
`README.md`, `site/index.html`, and `skills/keel/design/**` are maintainer-owned
— propose edits in the PR body rather than making them directly, so parallel
work does not collide.

## Reporting a bad classification

Keel being wrong about a node is a **bug report worth filing**, and the most
useful kind. Include the target, the node, the class Keel assigned, the class
you believe is correct, and the write boundary you traced. Use the
*Misclassification* issue template.

## License

By contributing you agree your contributions are licensed under the
[MIT License](LICENSE).
