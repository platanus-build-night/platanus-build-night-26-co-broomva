# Handoff — Keel · Platanus Build Night Bogotá

**Arc:** Keel — grounding-ratio measurement for agent-maintained systems
**Session:** 2026-07-24, 15:00 → 03:00 COT (Buk offices, Bogotá)
**Written at:** 17:23 COT · ~9h35m remaining
**Repo:** `~/keel` · HEAD `55aacb3` · clean tree · `main`

---

## TL;DR

**Keel measures whether a codebase's verification actually touches the world, or
whether it is only checking itself.**

One sentence carries the whole product:

> A check is only a check if the signal it reads comes from somewhere the thing
> being checked cannot write to.

Every verification edge in a target (CI steps, test targets, review gates,
deploy conditions, integration signals) is classified `anchored` /
`self_referential` / `unknown`, producing a **grounding ratio**. Novel shapes
are judged agentically; recurring shapes crystallize into **probes** — small
reviewable scripts — so cost per node falls as the library grows. Keel audits
its own probe library and reports the agreement rate as a counter-metric.

Shipped as an **open agent skill** (`npx skills add broomva/keel`), so it runs
inside an existing agent harness rather than reimplementing one.

Two results on stage, not one:
1. **Grounding ratio** across a corpus of well-known repos — a number that does
   not currently exist.
2. **The crystallization curve** — tokens/seconds per node falling as probes
   accumulate. This is the platform thesis proven empirically, and it is the
   more novel of the two.

---

## 1 · The intellectual core

### 1.1 The predicate

From `research/entities/concept/evidentiary-independence-conservation.md` (1,010
lines, two months of adversarial refinement in the broomva workspace):

- **Independence is conserved, not manufactured.** More detectors,
  re-observation, debate, and pooling add *signatures*, not independent paths.
- **The operational form:** `h ⟂ U` — the observation must be causally
  independent of the control input. Computably: *is the most-recent-common-
  ancestor (MRCA) of the action and its evidence outside the action's writable
  scope?*
- **Build-time, not audit-time.** "Add a verifier" is an audit-time move;
  exogeneity is a structural property fixed at the fork, not something you can
  inspect your way to afterwards.
- **Query-provenance refinement:** independence of the *query* is the binding
  invariant; independence of the substrate is sufficient-but-not-necessary. A
  verifier can share the actor's exact state and still be real, provided the
  actor could not have selected the question.
- **Tri-state, unshoppable:** `{independent | shared | unknown}` where `unknown`
  **fails closed**, and the tag is set by observation, never by the actor's
  self-report. If the measured thing could choose, it would never choose
  `unknown`.

Related entities: `correlated-verifier-is-no-verifier` (the actionable
predicate; rule-of-three met), `self-improvement-verifier-ceiling` (the verifier
is the ceiling — self-improvement amplifies only what the verifier can already
recognize), `verifier-independence-depletes-under-optimization` (independence is
a depletable resource, spent by selection).

### 1.2 Why this is a real problem in 2026

The market admitted the gap the same month:

- Every agent payment/identity rail shipped and **explicitly punted identity**.
  Google AP2: trusted key issuance "out of scope." **Anthropic MCP
  authorization: "beyond the scope."** Visa TAP: deferred to "context-specific
  trust frameworks." Proof calls it *"the identity layer nobody built."*
- a16z: *"the bottleneck for the agent economy is shifting from intelligence to
  identity"* — names **KYA (Know Your Agent)** as the missing primitive.
- Prompt injection is conceded unsolvable (OWASP, OpenAI); **the permissions
  problem is solvable.** ~34% of deployed agents affected; 88% of orgs report
  agent security incidents.
- **88% of MCP servers require credentials; only 8.5% use OAuth** — the rest are
  long-lived static keys.
- **MCP spec RC ships 2026-07-28** (four days after this event) adding
  `Mcp-Method`/`Mcp-Name` headers so tool calls can route through per-call
  authorization at a gateway.

Keel does not attack that lane directly (see §3 for why) but it is the same
structural gap one level up: *verification whose provenance sits inside the
write boundary.*

---

## 2 · Loop engineering → graph engineering (the research chain)

This is the discourse Keel is positioned against, and it is **six days old**.

### 2.1 The turn

- **Peter Steinberger**, 2026-07-18: *"Are we still talking loops or did we
  shift to graphs yet?"* — 7,679 likes / **3.0M views**. [verbatim, HIGH]
- **Carlos E. Perez**, *"From Loop Engineering to Graph Engineering?"*,
  2026-07-18 — **1.12M views** / 9.0k bookmarks. [read verbatim, HIGH]

Lineage per `research/entities/concept/loop-engineering.md`: prompt engineering
(≈2023, optimize the input) → context/harness engineering (≈2024–25, shape what
one agent sees) → **loop engineering** (2026, design the system that prompts the
agent) → the "graph" turn (2026-07).

### 2.2 The correction that Keel is built on

From `research/entities/concept/grounded-vs-ungrounded-improvement.md`:

A graph of loops genuinely fixes the four structural failures of a single loop —
**but a graph built without anchors fails the same way, "only later and more
expensively, with far more green lights on the way down."**

> *"Every loop watches another loop, and no loop touches the ground. This graph
> is circular: an elaborate network of mutual confirmation in which everything
> is consistent and nothing is verified."*

**The durable axis is grounded vs ungrounded, not loops vs graphs.**

| Single-loop failure | Mechanism | Topological answer |
|---|---|---|
| **Goodhart** | A loop sees only its metric, so it finds every way to move it, including ones that betray its purpose | **Pairing** — every optimizing loop gets a watching loop on a counter-metric |
| **Blindness upward** | Nothing inside a loop can ask whether its reference is right | **Hierarchy** — a slower loop owns the faster loop's reference |
| **Conflict** | Independently-built loops fight; each is "working" alone | **Explicit arbitration** — a loop above that owns the trade-off |
| **Measurement decay** | Sensors drift; measurement slides into checking paperwork against paperwork | **Audit loops** that check the other loops' numbers still touch the world |

**What the topology cannot supply** (must come from outside the graph):

1. **Anchors** — measurements that cannot be argued with: revenue that landed in
   the bank, tests that actually executed, customers who actually stayed.
2. **Frozen nodes** — rules the optimizing loops may never tune, *precisely
   because* they are what the optimizer would weaken. "The way a training loop
   must never see the held-out set."
3. **The root definition of "better"** — cannot be generated by the machinery,
   because every loop presumes it.

> *"The most sophisticated improvement architectures are the ones honest enough
> to mark where their own authority ends."*

### 2.3 The four-loop taxonomy → RCS levels

| Nested loop | bstack primitive(s) | RCS level | λ margin |
|---|---|---|---|
| **Agent loop** (model→tools→repeat) | Arcan execution | L0 plant | 1.455 |
| **Verification loop** (grade vs rubric, retry) | P11 · P4 · P9 · P20 | L1 controller | 0.411 |
| **Event-driven loop** (trigger replaces manual invoke) | P19 · /loop · P12 | L2 meta-control | 0.069 |
| **Hill-climbing loop** (traces → improve prompts/tools) | P6 · P16 · P13 | L3 governance | 0.006 |

Cascade control's "outer must be slower than inner" is the external
corroboration of λ₃ ≈ 0.006 — governance changes must be rare.

External formal grounding: *Stable Agentic Control* (arXiv:2605.03034) — Lean-4
proof that **"stability becomes a formal property of the loop rather than of the
agent."** Action-level variance Jaccard 0.74–0.93, yet **σ=0 outcome variance
across 40 runs** when the environment (not the reasoning) is constrained.

### 2.4 The two gaps Perez exposed — and which one Keel closes

Verified by grep across the broomva workspace: **zero hits** for
`counter-metric` / `metric pairing`, **zero hits** for `arbitration` /
`conflicting loops`.

- **Gap 1 — no counter-metric pairing.** *"A metric must never travel alone."*
  P20 (anti-slop ≥7/10), P6 (Nous ≥5/9), P11 (interaction evidence) are all
  unpaired thresholds, each winnable by shrinking scope. The one genuine pairing
  is m6 `meta_work_session_ratio`.
  → **Keel's ε-audit agreement rate is a counter-metric on its own probe
  library.** This is the design element with the strongest provenance and it
  should be said out loud in the pitch.
- **Gap 2 — no arbitration loop.** Unresolved; out of scope tonight.

### 2.5 Why the "AI-native platform" framing was rejected

> **⚠ SUPERSEDED 2026-07-24 18:xx COT — read
> [`docs/adrs/2026-07-24-ai-native-platform-reframe.html`](../adrs/2026-07-24-ai-native-platform-reframe.html)
> before acting on this section.** The rejection below is *too broad*. It
> conflates "build the graph" with "build the graph **and** let it author its
> own anchors" — only the second is fatal. `grounded-vs-ungrounded-improvement.md:58-69`
> enumerates exactly three things topology cannot supply (anchors, frozen nodes,
> the root definition of "better"); pairing, hierarchy, arbitration, and audit
> loops are explicitly *constructible*. The build decision for tonight is
> unchanged — see the ADR §Consequences.

The originally-proposed platform — agentic workspaces reading a company's ops,
source, docs, and integrations (Composio et al.) to synthesize a workflow graph
— is, by Perez's own argument, **the construction of a maximally ungrounded
graph**: agents verifying against artifacts that agents increasingly write. MRCA
inside the write boundary, at company scale.

So the product is not the graph builder (a crowded lane: Composio, Dust, Lindy,
Gumloop, n8n, Relevance, Zapier Agents). It is **the grounding layer over the
graph**, and the reframe is:

> **AI-native maturity is not how much of your operation is automated. It is
> what fraction of your operational graph has a verification signal the agents
> cannot author.**

That inverts the market narrative and yields a counterintuitive, true claim: a
40-year-old logistics company may be *more* AI-native-ready than an AI-native
startup, because it already has anchors — invoices paid, shipments delivered,
customers renewed — while the startup has agent-written docs checked by agent
reviewers.

### 2.6 Relationship to Assay (BRO-1963)

Assay is the same operator in a different substrate. Its thesis: *generator =
controller, structure predictor = observer, real-world binding = the stabilized
quantity*; the open problem is to construct a verification signal whose
independence from the generator is **quantified**, in a domain where
independence is *physically* measurable. The naive loop (ESMFold2 designs,
ESMFold2 scores) is a single-model echo chamber; even AF3/Boltz-2 share PDB
training data.

**The generalized operator, stated once:**

> An assay is a measurement whose provenance forks above the generator's write
> boundary.

Protein design → physics oracle / orthogonal architecture / wet lab.
Company operations → revenue that landed, a test that executed, a customer who
stayed. Same operator, different substrate. `h ⟂ U`.

**Open ontology question (deferred, user's call):** if the general operator is
the parent, it deserves the name `Assay` and BRO-1963 becomes `assay-bio`.
Deferred to avoid disturbing the bio arc mid-hackathon.

---

## 3 · Decisions and their rationale

### 3.1 Ideas considered and rejected

| Idea | Why rejected |
|---|---|
| Signed-mandate gateway for MCP tool calls | Best long-term idea, worst tonight. **Ikarus won the CDMX public vote (613) doing MCP-gateway-contains-prompt-injection**; plus Vibefence, Specter, ChatWall, Hackan't, wardlm, Tranquera. AI Security is the densest lane in the Platanus corpus. Also produces no real measurement — "blocked N attacks I wrote myself" is a demo script, not a number. |
| Agent economy + emergent reputation (x402) | Most aligned with the emergence lens, but simulated economies yield simulated numbers, and 12h solo can't make settlement real. |
| Ocean / genomics wildcards (dark-vessel fishing, whale acoustics, eDNA, reef) | Explored and dropped by user directive — "hard win." Malpelo (UNESCO, patrolled 1 week/month) remains a genuinely strong standalone idea for later. |
| SECOP procurement audit (Themis-for-Colombia) | Guaranteed hard number, but a straight transplant of a known Platanus winner and outside the user's passion. |
| Full AI-native platform | See §2.5 — it *is* the failure mode. |

### 3.2 Form factor: skill, not web app

The decisive argument (user's, and correct): **Claude Code is already the loop
engine.** Rebuilding classify → probe-emit → audit as a web service means
reimplementing tool use, file access, subagents, session persistence, and
permissions. That is an agent harness, and spending the night rebuilding one to
get a worse loop is the most expensive available mistake.

Consequences:
- Host subscription = no API keys, no credit burn, no rate-limit surprise.
- `npx skills add` beats a web form for a room of hackers — they run it on their
  own repos with their own subscriptions.
- The long-horizon shape (a probe library compounding across runs) is what
  skills + `/loop` + P12 are built for.

**The visual becomes an artifact, not an app.** The skill emits a
self-contained HTML report (inline SVG graph, grounding ratio, crystallization
curve). Zero hosting. This is P18 Category-C by workspace rule — generatively
authored, presentation carries knowledge. Corpus reports get committed and
published as static files.

**Sandbox:** for tonight the sandbox question reduces to executing
agent-generated probes safely = subprocess, timeout, no network, read-only mount
of the target. Firecracker (per
`research/entities/tool/agent-sandbox-substrate-comparison.md`) is the year-two
answer for probes executing against customer infrastructure. **Expect to be
asked "you're running LLM-generated code?" — the honest answer above lands
better than having built it.**

### 3.3 skills.sh packaging — researched tonight, supersedes stale KG

`research/entities/tool/skills-sh.md` in the broomva workspace is **stale** and
should be corrected after the event.

- **[vercel-labs/skills#1523](https://github.com/vercel-labs/skills/issues/1523)
  is FIXED**, closed 2026-07-16. Fix is
  [PR #1609](https://github.com/vercel-labs/skills/pull/1609) "install full
  skill directory for root-level SKILL.md repos," merged 05:24Z, released in
  **v1.5.18** at 05:33Z, issue closed 05:36Z. 315 lines of new regression tests.
- **How it was fixed matters.** The special-case branch was *deleted*, so
  root-level repos now take the normal recursive copy path. The complete
  exclusion list in v1.5.20 `src/installer.ts`:
  ```ts
  const EXCLUDE_FILES = new Set(['metadata.json']);
  const EXCLUDE_DIRS  = new Set(['.git', '__pycache__', '__pypackages__']);
  ```
  Everything else at the repo root — `README`, `LICENSE`, `.github/`, `site/`,
  `reports/`, `node_modules/` — would ship into every user's
  `~/.claude/skills/<name>/`.
- **Therefore `skills/keel/` is still correct, for a better reason:** it is the
  packaging boundary between what ships to users and what is repo
  infrastructure. That rationale does not expire with the next CLI release.
- **Depth semantics** (v1.5.8+): `skills/<name>/` (depth-1) ✅ ·
  `skills/<category>/<name>/` (depth-2) ✅ · depth-3+ needs `--full-depth`.
  `--skill <name>` resolves by frontmatter `name`, path-independent.
- **Node floor:** v1.5.19+ requires **Node ≥22.20** (#1701). Local machine is
  **v22.14.0** → prints an `EBADENGINE` warning but still runs (exit 0).
  Mitigations: `nvm install 22.20`, or pin **`npx skills@1.5.18`** (has the
  #1523 fix, predates the Node bump). Validation was performed with 1.5.18.
- **v1.5.20 bonus:** *"warn instead of silently skipping malformed SKILL.md
  files"* (#1058) — the silent-total-frontmatter-rejection failure documented in
  the KG (the `livecoding` bisect) is now surfaced.
- **Frontmatter gotcha still applies:** list items with multiple quoted strings
  (`- "a", "b"`) silently kill the entire frontmatter. Keel's SKILL.md avoids
  lists entirely.
- **Validation discipline:** a skill is published when a clean `npx skills add`
  yields a *runnable* skill — `--list` only parses frontmatter and never
  exercises the file-copy path.

### 3.4 Naming

Rejected: Greek register (Basanos, Dokimos, Gnomon, Horos, Ephor, Stathme) —
accurate but not catchy, and Greek clusters plus silent letters die in a
bilingual Bogotá room (this also killed `plumb`).

**Keel** chosen: one syllable, universally sayable, zero baggage, and *"even
keel" is literally a stability property* — the research lane carried without
saying a word. A keel is the reference line everything is measured from.

Runner-up was **Sextant** (`sextante` is a clean Spanish cognate; you fix
position against references you cannot move). **Proctor** was catchiest and
self-explaining but borrows Proctorio's surveillance baggage in a product about
trust.

**The mark:** a hull section riding the waterline, with the keel descending past
the surface into what the vessel cannot author. *The part that does the work is
the part you cannot see from above.* Waterline drawn as two segments flanking
the hull; flared topsides (real hull sections flare) to avoid reading as a
goblet — the first iteration did.

---

## 4 · What is delivered

```
~/keel/                              HEAD 55aacb3 · clean · pushed to org repo
├── LICENSE                          MIT, Carlos D. Escobar-Valbuena
├── README.md                        concise, submission-ready
├── build-night-project.json         ✅ name + oneliner + description
├── project-logo.png                 ✅ 1000×1000, 16KB (limit 500KB)
├── docs/handoffs/                   this file
├── reports/                         corpus artifacts (repo-only)
├── site/
│   ├── index.html                   landing — dark, self-contained, no deps
│   ├── agents/index.html            agent-readable install+run instructions
│   ├── logo.svg / logo.png
│   └── .nojekyll
└── skills/keel/                     ← THE ONLY THING THAT SHIPS TO USERS
    ├── SKILL.md                     the four-stage loop
    ├── schemas/keel.ts              Node · Verdict · Probe · Report
    ├── references/grounding-classes.md   worked cases
    └── probes/README.md             contract + contribution flow
```

**Validated:** `npx skills@1.5.18 add ~/keel --list` → `Found 1 skill`.
Frontmatter parses; no silent rejection.

### 4.1 The two schemas (frozen — expensive to change late)

**`Verdict.writeBoundary`** is required on every verdict:
```ts
{ producer: string;            // what actually emits the signal
  actorCanWrite: boolean|null; // null → unknown → fails closed
  argument: string }           // the causal path, not a restatement of the class
```

**`Probe.assess()` returns `null` to ABSTAIN.** A probe may never return
`unknown` — `unknown` is a claim about the world and only the agent makes it.
This is what keeps `unknown` unshoppable: a lazy probe degrades to *ask*, never
to *looks fine*. Enforced at the type level via
`Omit<Verdict,'nodeId'|'decidedBy'|'probeId'> | null`.

**Grounding ratio** = `anchored / (anchored + self_referential + unknown)`.

### 4.2 The documented limit (put in the product deliberately)

**A test's execution is anchored; its oracle may not be.** When the same agent
writes the implementation and the assertions, the runtime honestly decides
pass/fail, but the *specification* was authored inside the write boundary — both
can drift together and stay green. Keel classifies the execution axis and names
the limit rather than silently upgrading it to proof.

This is the spec-code co-drift failure from the KG (formal-methods instance).
**Better named in the product than found by a heckler at 2AM.**

Corollary that rescues one case: an LLM judge scoring against a rubric **frozen
before generation** is meaningfully stronger than an ad-hoc judge, because the
verdict is a function of a constraint the generated content could not influence.
Still not anchored, but the argument should record it.

---

## 5 · First action (next agent, do these in order)

1. **Create the personal mirror** (blocked for the agent — needs the user):
   ```bash
   gh repo create broomva/keel --public --source=/Users/broomva/keel --push
   cd ~/keel
   git remote set-url --add --push origin https://github.com/platanus-build-night/platanus-build-night-26-co-broomva.git
   git remote set-url --add --push origin https://github.com/broomva/keel.git
   ```
   One `git push` then hits both. Org repo = judging; personal repo = deploys +
   the `npx skills add broomva/keel` install line. **Deploy platforms cannot
   connect to org repos** (stated in the Platanus README) — this is why the
   mirror exists.
2. **GitHub Pages:** Settings → Pages → `main` / `/site`. Prod green early; do
   not leave this to 2AM.
3. **Build block:** `scripts/gather.ts` + the classify driver → real
   `report.json`. **Point the first run at `~/keel` itself** — cheapest test
   target and the most honest thing the tool can do on stage.

---

## 6 · Pickup state

### Remaining plan (from 17:30)

| Block | Target |
|---|---|
| 17:30 → 19:30 | Loop end-to-end on one repo, fully agentic, emitting `report.json` |
| 19:30 → 21:00 | HTML report artifact — SVG graph, grounding ratio |
| 21:00 → 23:00 | Probe emission + cache-first dispatch, probes committed |
| 23:00 → 00:30 | Corpus batch (10–15 repos) → **the crystallization curve** |
| 00:30 → 01:30 | ε-audit + publish corpus to the site |
| 01:30 → 02:15 | Buffer (it will be needed) |
| 02:15 → 03:00 | Rehearse twice + fallback video |

**Ordering property:** every stage is independently demoable.
Classification-only still yields grounding ratios; probes are the upgrade; the
curve is the headline; ε-audit is the intellectual flourish. **Nothing after
21:00 is load-bearing for a complete pitch.**

### Architectural safety property

**Probe emission must remain a separate, optional stage.** Pure agentic
classification has to work standalone — slower and pricier, but working. If
probe generation goes sideways at 23:00, the demo is still complete.

### Demo, three beats

1. **Published corpus report on screen** — ratio table + curve. Static,
   precomputed, cannot fail.
2. **Live run on a volunteer's repo** — a shape it has not seen; a new probe is
   minted and the library visibly grows.
3. **`npx skills add broomva/keel`** — the room installs it while you are still
   talking. Probes are code, so the skill improves every time anyone runs it,
   and every run can PR its probe back. The commons is the moat.

### Risks

| Risk | Mitigation |
|---|---|
| Classification reads as subjective | Show the `writeBoundary.argument` for every node — the causal path is the evidence |
| Graph-extraction scope creep | Hard-cap: CI configs, scripts, test config, one integration. **No code graph.** |
| Node 22.14 `EBADENGINE` on stage | `nvm install 22.20`, or pin `skills@1.5.18` |
| Probe emission eats hours | Optional stage; degrade gracefully |
| Agent-generated code execution question | Subprocess + timeout + no network; Firecracker is the year-two answer |
| Ratio read as "well tested" | Scope note is already in SKILL.md, README, and the site — repeat it verbally |

### Validation gate before pitching

Per the workspace rule — a skill is published when a **clean install yields a
runnable skill**, not when `--list` shows it: clone to a scratch dir, install
into an empty store, run the loop. **Do this at ~00:30, not 02:50.**

---

## 7 · Post-event follow-ups

- **Correct `research/entities/tool/skills-sh.md`** — #1523 is fixed (v1.5.18);
  the "unfixed, no PR" framing produced wrong architectural advice this session.
  Add the EXCLUDE-list consequence and the Node ≥22.20 floor.
- **File the Keel arc to the KG** — new entity for the grounding-ratio operator;
  edges to `evidentiary-independence-conservation`,
  `grounded-vs-ungrounded-improvement`, `correlated-verifier-is-no-verifier`,
  `loop-engineering`.
- **Counter-metric pairing (Gap 1)** — Keel's ε-audit is a working instance.
  Rule-of-three candidate for a P16 promotion covering P20/P6/P11 unpaired
  thresholds.
- **Ontology call** — Assay as parent operator vs sibling (§2.6).
- **Team recruiting** — Platanus Hack 26 Bogotá is **21–23 Aug**; team
  applications close **14 Aug**. The signed-mandate gateway (§3.1) is the
  natural August build with a team, and tonight's measurement is its wedge.

---

*Keel measures the shape of verification, not its quality. A repo can be 100%
anchored with terrible tests. Anchoring says the signal comes from outside; it
does not say the signal is enough.*
