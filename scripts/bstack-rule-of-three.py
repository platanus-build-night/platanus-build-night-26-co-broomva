#!/usr/bin/env python3
"""bstack-rule-of-three.py — G-L3-2 rule-of-three audit gate.

Validates that every bstack primitive added since P16's formalization
(2026-05-12) has ≥3 logged instances in the candidate ledger of
`research/entities/pattern/bstack-engine.md` OR is the engine itself (P16).

Earlier primitives (P1-P13) predate P16's formalization and are
grandfathered. P14 and P15 were promoted in the same act as P16; they're
acknowledged in the synthesis note as meeting the rule-of-three (P14:
30+ instances, P15: 10+ instances) via dump-extracted evidence.

This is the gate that catches *cargo-cult primitive promotion* — patterns
that look like primitives but lack the recurring-value evidence to justify
crystallization.

Exit codes:
  0 — clean (every primitive that needs ledger evidence has it)
  1 — errors (one or more recent primitives lack rule-of-three evidence)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent.parent
AGENTS_MD = WORKSPACE / "AGENTS.md"
BSTACK_ENGINE = WORKSPACE / "research/entities/pattern/bstack-engine.md"

# Primitives that predate P16's formalization (rule-of-three doctrine).
# Grandfathered — they exist because they worked, not because they passed a gate.
# The cutoff is inclusive: P1-P13 are grandfathered.
GRANDFATHERED_BEFORE = 14

# Primitives that are foundational/meta and don't require ledger evidence
# (they are the engines that produce ledger entries, or hook-enforced gates).
FOUNDATIONAL = {"P1", "P2", "P16"}  # bridge, control gate, the engine itself


def parse_primitive_titles(text: str) -> dict[str, str]:
    """Extract `### P-N: Title` mappings from AGENTS.md."""
    return {
        m.group(1): m.group(2).strip()
        for m in re.finditer(r"^### (P\d+):\s*(.+?)$", text, re.MULTILINE)
    }


def parse_ledger_entries(text: str) -> tuple[dict[str, str], list[tuple[str, str]]]:
    """Extract evidence rows from bstack-engine.md.

    Returns (direct_pid_map, candidate_rows):
      - direct_pid_map: {P-N → instances_str} from "## Promoted patterns" rows
        where the "Promoted as" column explicitly names a primitive
      - candidate_rows: [(pattern_name, instances)] from "## Candidate ledger"
        rows (no direct P-N assignment yet; used for fuzzy match fallback)
    """
    direct: dict[str, str] = {}
    candidates: list[tuple[str, str]] = []

    # "## Promoted patterns" table: cols = Pattern | Instances | Promoted as | Evidence
    promoted_match = re.search(
        r"## Promoted patterns.*?\n(.*?)(?=\n## |\Z)",
        text,
        re.DOTALL,
    )
    if promoted_match:
        for line in promoted_match.group(1).splitlines():
            if not line.strip().startswith("|"):
                continue
            cells = [c.strip() for c in line.split("|")[1:-1]]
            if len(cells) < 3:
                continue
            if cells[0].lower().startswith("pattern") or set(cells[0]) <= set("-"):
                continue
            # Parse "Promoted as" column — match **P-N** or P-N
            pid_match = re.search(r"\*?\*?(P\d+)\*?\*?", cells[2])
            if pid_match:
                direct[pid_match.group(1)] = cells[1]

    # "## Candidate ledger" table: cols = Pattern | Instances | First seen | Status
    candidate_match = re.search(
        r"## Candidate ledger.*?\n(.*?)(?=\n## |\Z)",
        text,
        re.DOTALL,
    )
    if candidate_match:
        for line in candidate_match.group(1).splitlines():
            if not line.strip().startswith("|"):
                continue
            cells = [c.strip() for c in line.split("|")[1:-1]]
            if len(cells) < 2:
                continue
            if cells[0].lower().startswith("pattern") or set(cells[0]) <= set("-"):
                continue
            candidates.append((cells[0], cells[1]))

    return direct, candidates


def has_three_or_more_instances(instance_str: str) -> bool:
    """Heuristic: does the instances column claim ≥3 logged occurrences?"""
    s = instance_str.lower()
    # Explicit markers
    if "meets rule-of-three" in s:
        return True
    if "recurring" in s and "aesthetic-only" in s:
        return False  # aesthetic-only is not crystallization-worthy
    # Numeric: look for "N+" or "N instances" where N >= 3
    m = re.search(r"(\d+)\+", s)
    if m and int(m.group(1)) >= 3:
        return True
    m = re.search(r"(\d+)\s*instances?", s)
    if m and int(m.group(1)) >= 3:
        return True
    # Numbers like "5+ in raw dump"
    return False


def primitive_pattern_in_ledger(pid: str, title: str, ledger: list[tuple[str, str]]) -> tuple[bool, str | None]:
    """Check if a primitive's underlying pattern is in the ledger.

    Heuristic: look for any ledger entry whose pattern name overlaps
    substantially with the primitive's title.

    Returns (found, instance_count_str). If not found, instance_count_str is None.
    """
    # Strip parentheticals and lowercase for matching
    title_clean = re.sub(r"\(.*?\)", "", title).strip().lower()
    title_words = set(re.findall(r"\w+", title_clean))
    title_words -= {"discipline", "the", "of", "a", "an", "and", "or", "to", "for", "by"}

    for pattern_name, instances in ledger:
        pattern_clean = pattern_name.lower()
        pattern_words = set(re.findall(r"\w+", pattern_clean))
        overlap = title_words & pattern_words
        # Require ≥2 word overlap or substring match
        if len(overlap) >= 2 or any(w in pattern_clean for w in title_words if len(w) >= 5):
            return True, instances
    return False, None


def main() -> int:
    if not AGENTS_MD.exists():
        print(f"[FAIL] {AGENTS_MD} not found", file=sys.stderr)
        return 1
    if not BSTACK_ENGINE.exists():
        print(f"[FAIL] {BSTACK_ENGINE} not found", file=sys.stderr)
        return 1

    agents_text = AGENTS_MD.read_text()
    engine_text = BSTACK_ENGINE.read_text()

    primitives = parse_primitive_titles(agents_text)
    direct, candidates = parse_ledger_entries(engine_text)

    print(f"[bstack-rule-of-three] G-L3-2 rule-of-three audit")
    print(f"  Primitives found:           {len(primitives)}")
    print(f"  Direct P-N evidence rows:   {len(direct)}")
    print(f"  Candidate ledger entries:   {len(candidates)}")
    print(f"  Grandfathered before:       P{GRANDFATHERED_BEFORE}")
    print(f"  Foundational (exempt):      {', '.join(sorted(FOUNDATIONAL))}")
    print()

    errors: list[str] = []
    notes: list[str] = []

    for pid, title in sorted(primitives.items(), key=lambda kv: int(kv[0][1:])):
        n = int(pid[1:])
        if n < GRANDFATHERED_BEFORE:
            notes.append(f"  {pid} ({title}): grandfathered (predates P16 formalization)")
            continue
        if pid in FOUNDATIONAL:
            notes.append(f"  {pid} ({title}): foundational (engine/hook — exempt)")
            continue
        # First check direct P-N evidence (Promoted patterns table)
        if pid in direct:
            instances = direct[pid]
            if has_three_or_more_instances(instances):
                notes.append(f"  {pid} ({title}): direct evidence — '{instances}'")
                continue
            errors.append(
                f"{pid} ({title}): Promoted patterns row shows '{instances}' — "
                "does not clearly demonstrate ≥3 instances."
            )
            continue
        # Fall back to fuzzy match against candidate ledger
        found, instances = primitive_pattern_in_ledger(pid, title, candidates)
        if not found:
            errors.append(
                f"{pid} ({title}): no row in bstack-engine.md Promoted patterns table "
                "(direct P-N reference) and no fuzzy match in Candidate ledger. "
                "Add a row to Promoted patterns documenting the recurring pattern that justified promotion."
            )
            continue
        if not has_three_or_more_instances(instances or ""):
            errors.append(
                f"{pid} ({title}): ledger shows '{instances}' — does not "
                "clearly demonstrate ≥3 instances. Rule-of-three requires explicit evidence."
            )
            continue
        notes.append(f"  {pid} ({title}): fuzzy ledger evidence — '{instances}'")

    # Print notes (passes)
    for note in notes:
        print(note)
    if errors:
        print()
        for err in errors:
            print(f"  [ERROR] {err}")
        print()
        print(f"[bstack-rule-of-three] FAIL — {len(errors)} primitive(s) "
              "without rule-of-three evidence")
        return 1
    print()
    print(f"[bstack-rule-of-three] OK — all post-formalization primitives "
          "have rule-of-three evidence")
    return 0


if __name__ == "__main__":
    sys.exit(main())
