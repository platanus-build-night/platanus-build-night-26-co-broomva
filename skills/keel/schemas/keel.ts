/**
 * Keel — core contracts.
 *
 * One idea, stated once:
 *   A check is only a check if the signal it reads comes from somewhere the
 *   thing being checked cannot write to.
 *
 * Everything below is bookkeeping for that sentence.
 */

// ---------------------------------------------------------------------------
// Nodes — candidate verification edges gathered from a target.
// Gathering is mechanical (find the surfaces). Judging is not (see Verdict).
// ---------------------------------------------------------------------------

export type NodeKind =
  | 'ci_step' //  a step in a pipeline
  | 'script' //  a package/make/task script
  | 'test_target' //  a declared test suite
  | 'review_gate' //  human or bot review requirement
  | 'deploy_gate' //  promotion / release condition
  | 'doc_claim' //  a doc asserting something is verified
  | 'integration' //  an external system wired in
  | 'other';

export interface Node {
  /** stable id: `${source}#${slug}` */
  id: string;
  kind: NodeKind;
  /** human name, e.g. "test (unit)" */
  name: string;
  /** where it was found — repo-relative path (+ line if known) */
  source: string;
  /** the literal snippet. The agent reasons over this, not over our summary. */
  raw: string;
  /** free-form extras the gatherer happened to learn. Never authoritative. */
  hints?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Verdicts — the classification.
// ---------------------------------------------------------------------------

/**
 * anchored        the signal is produced by something the target's agents /
 *                 authors cannot write to. Execution, external systems,
 *                 physical reality, third parties.
 *
 * self_referential the signal is produced inside the write boundary. An LLM
 *                 judging its own output, a doc checked against a doc, a
 *                 status field the actor sets.
 *
 * unknown         we could not establish the fork point.
 *                 FAILS CLOSED. Counts against the ratio. Never a default
 *                 green, and never settable by the thing being measured.
 */
export type GroundingClass = 'anchored' | 'self_referential' | 'unknown';

export interface WriteBoundaryArgument {
  /** what actually emits the signal ("vitest process exit code", "an LLM") */
  producer: string;
  /**
   * Can the actor being verified write to that producer's output?
   * true  -> self_referential
   * false -> anchored
   * null  -> unknown (fails closed)
   */
  actorCanWrite: boolean | null;
  /** one or two sentences. Must name the causal path, not restate the class. */
  argument: string;
}

export interface Verdict {
  nodeId: string;
  class: GroundingClass;
  writeBoundary: WriteBoundaryArgument;
  /** concrete citations — file:line, config keys, command names. */
  evidence: string[];
  /** 0..1 — how sure. Low confidence + anchored is a smell; surface it. */
  confidence: number;
  /** provenance of the decision itself */
  decidedBy: 'probe' | 'agent';
  probeId?: string;
  /** set when an ε-audit re-decided this node agentically */
  audit?: {
    agentClass: GroundingClass;
    agreed: boolean;
    at: string;
  };
}

// ---------------------------------------------------------------------------
// Probes — crystallized judgment. Code, because code is reviewable.
// ---------------------------------------------------------------------------

export interface ProbeMeta {
  id: string;
  version: number;
  /** ISO date */
  mintedAt: string;
  /** the node id whose novelty caused this probe to exist */
  mintedFrom: string;
  /** what shape of node this generalizes. Plain language. */
  description: string;
}

export interface Probe extends ProbeMeta {
  /** cheap structural filter. Must be pure and fast. */
  match(node: Node): boolean;
  /**
   * The judgment.
   *
   * Returning `null` is a first-class outcome and means ABSTAIN — the probe
   * recognizes the shape but cannot establish the fork point here. Abstention
   * falls through to the agent.
   *
   * A probe may never return `unknown` as a verdict. `unknown` is a statement
   * about the *world* and only the agent may make it; a probe that cannot tell
   * says so by abstaining. This is what keeps `unknown` unshoppable: the thing
   * being measured can never cause a cheap green, and a lazy probe degrades to
   * "ask the agent" rather than to "looks fine".
   */
  assess(node: Node): Omit<Verdict, 'nodeId' | 'decidedBy' | 'probeId'> | null;
}

// ---------------------------------------------------------------------------
// Report — the artifact.
// ---------------------------------------------------------------------------

export interface Report {
  target: string;
  /** commit sha / version of what was measured */
  revision: string;
  generatedAt: string;
  nodes: Node[];
  verdicts: Verdict[];
  grounding: GroundingRatio;
  economics: RunEconomics;
}

export interface GroundingRatio {
  anchored: number;
  selfReferential: number;
  unknown: number;
  /** anchored / total. `unknown` counts against — fail closed. */
  ratio: number;
}

/**
 * The second result: the crystallization curve.
 * Per-run cost, so a sequence of runs shows structure emerging.
 */
export interface RunEconomics {
  nodesTotal: number;
  decidedByProbe: number;
  decidedByAgent: number;
  probesMinted: number;
  probeLibrarySize: number;
  tokensIn: number;
  tokensOut: number;
  wallClockMs: number;
}

export function groundingRatio(verdicts: Verdict[]): GroundingRatio {
  const anchored = verdicts.filter((v) => v.class === 'anchored').length;
  const selfReferential = verdicts.filter((v) => v.class === 'self_referential').length;
  const unknown = verdicts.filter((v) => v.class === 'unknown').length;
  const total = anchored + selfReferential + unknown;
  return {
    anchored,
    selfReferential,
    unknown,
    ratio: total === 0 ? 0 : anchored / total,
  };
}
