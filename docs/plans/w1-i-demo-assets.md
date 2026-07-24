# W1·I · Demo assets (MVP — rehearsal + insurance, minus the video)

Pulled forward from Wave 2: nothing here needs code. The **fallback video** is
the one exception — it needs working demo beats, so it stays in Wave 2 (record
at ~01:00; MemorIA was blocked from presenting when prod broke minutes before
pitching — record it before you need it).

**Owns:** `docs/demo/**`

## Deliverables

- **Three-beat run sheet** with timings (handoff §6): published corpus → live
  run mints a probe → `npx skills add broomva/keel` and the room installs it.
- **The volunteer-repo path**, rehearsed against a repo Keel has never seen, so
  beat 2 is genuinely live rather than staged. (Gather now reads
  `pyproject.toml`, CircleCI, and common deploy configs — a Python volunteer
  repo is fine; a Bazel monorepo is not, steer accordingly.)
- **The RCS mapping table** as a slide/site asset — this is the substrate
  story and nobody else on that stage will have it:

  | Keel loop | RCS level | Frozen from below |
  |---|---|---|
  | gather + classify | L0 plant | output contract, the question asked |
  | probe dispatch in sandbox, kill-timer | L1 controller | timeout/network policy |
  | ε-audit (sampled, verdict-hidden, incl. agent verdicts) | L2 watching loop | sampling policy |
  | schema freeze, rubric, human probe review | L3 governance | everything — changes rare by design |

- **Objection cards**, one each:
  - *"You're running LLM-generated code?"* — probe code (including **loading**)
    runs only in a kill-timed subprocess with a stripped env and a read-only
    view of the target; deny-default `sandbox-exec` profile if it landed —
    claim exactly what W1·C enforced, nothing more. Firecracker is the
    year-two answer.
  - *"Isn't the classifier subjective?"* — every verdict ships a falsifiable
    causal-path argument; the argument is the evidence, checkable in seconds
    without trusting the model. Plus the repeatability number: verdict
    agreement X% across independent runs — stability is a property of the
    loop, not the agent (arXiv:2605.03034).
  - *"Does a high ratio mean well-tested?"* — no. Shape, not quality; and the
    ratio never travels alone — anchored count + coverage are printed beside
    it, so a 1.0-over-one-edge cannot masquerade as a result.
  - *"The agent writes the probes — who verifies the verifier?"* — query
    provenance: the target cannot select the question, the output contract,
    or the audit sample. The ε-audit detects **probe drift** with real
    query-independence; what it cannot detect — shared-model bias — is
    disclosed, and mitigated by probes-as-code plus human-checkable
    arguments.
  - *"What if the repo prompt-injects your classifier?"* — the target writes
    **content**, never the query, the contract, or the audit policy. Bounded
    influence at L0, detection probability at L2 (the audit samples agent
    verdicts too). Adversarial-target hardening is year-two, same lane as
    Firecracker — and note injection is conceded unsolvable at the reasoning
    level industry-wide; constraining the environment is the move.

## Acceptance

A full timed dry run, twice, one of them with the network off to prove the
fallback path (video slot reserved in Wave 2).

## Do not touch

Everything outside `docs/demo/**`.
