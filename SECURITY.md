# Security policy

## Reporting a vulnerability

Report privately via [GitHub Security Advisories][advisory] on this repository.
Please do not open a public issue for a vulnerability.

[advisory]: https://github.com/broomva/keel/security/advisories/new

Include what an attacker gains, the steps to reproduce, and the version or
commit. You will get an acknowledgement within a few days. Keel is maintained
by one person, so please allow reasonable time before disclosing publicly.

## What Keel does on your machine

Worth stating plainly, because it informs what counts as a vulnerability here.

**Keel reads your repository and executes probes.** Probes are small scripts —
shipped in `skills/keel/probes/`, or minted locally into
`~/.config/keel/probes/` — that classify recurring verification shapes without
a model call. They are executed code.

This has two consequences:

1. **Review probes like you review dependencies.** A probe from a pull request
   is untrusted code until someone has read it. That is the point of shipping
   probes as small reviewable scripts rather than as an opaque model — the
   review is possible — but it only helps if the review happens.
2. **Keel runs against a target you point it at.** It reads CI definitions,
   task scripts, and configuration. Do not run it against a repository you
   would not otherwise clone and open in an editor.

Keel does not transmit your repository anywhere. Classification that cannot be
handled by a probe is performed by whichever agent harness you are running
Keel inside, under that harness's own model and network policy — so the
relevant data-handling terms are your agent provider's, not Keel's.

## In scope

- Probe execution escaping its intended sandbox.
- A crafted target repository causing code execution during `gather`.
- A crafted `report.json` causing code execution in the HTML renderer, or
  script injection into the rendered artifact.
- Path traversal writing outside the intended output location.

## Not in scope

- **Keel classifying a node incorrectly.** That is a correctness bug and a
  genuinely useful one — file it as a *Misclassification* issue instead.
- A low grounding ratio on your own repository. That is a finding, not a flaw.
- Vulnerabilities in the agent harness Keel runs inside; report those upstream.

## Supported versions

Keel ships as an agent skill installed from `main` via `npx skills add`. Fixes
land on `main`; there are no maintained release branches. Re-run
`npx skills add broomva/keel` to update.
