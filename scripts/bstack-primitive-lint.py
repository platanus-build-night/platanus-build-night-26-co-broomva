#!/usr/bin/env python3
"""bstack-primitive-lint.py — G-L3-1 structural completeness gate.

Validates that every bstack primitive (P-N section) in AGENTS.md has:
  - the four required body sections: **What**, **How**, **Why**, **Invariant**
  - a corresponding row in the CLAUDE.md primitives table
  - a count in the CLAUDE.md §Bstack Core Automation Primitives header that
    matches the actual number of P-N sections in AGENTS.md

Recommended-but-not-enforced (emits warnings):
  - **Reflexive Trigger Rule** section (mandatory for reasoning-enforced
    primitives; not needed for hook-enforced ones like P1, P2, P8, P9)

Exit codes:
  0 — clean (no errors; warnings OK)
  1 — errors present (governance docs structurally incomplete)

The "gates are the trust" principle: this is the gate that auto-merge of L3
governance changes consults. If it fails, the structural contract for primitives
is broken and merging would degrade the workspace's self-operating substrate.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent.parent
AGENTS_MD = WORKSPACE / "AGENTS.md"
CLAUDE_MD = WORKSPACE / "CLAUDE.md"

REQUIRED_SECTIONS = ("**What**", "**How**", "**Why**", "**Invariant**")
RECOMMENDED_SECTIONS = ("**Reflexive Trigger Rule",)  # prefix match — title varies

# Primitives that are hook-enforced (no Reflexive Trigger Rule needed because
# the hook IS the trigger). These get the recommendation waived.
HOOK_ENFORCED = {"P1", "P2", "P8"}
# Mechanism-only primitives (a make target or external script — no agent reflex needed)
MECHANISM_ONLY = {"P9"}


def parse_primitive_sections(text: str) -> dict[str, str]:
    """Extract each `### P-N: ...` or `### P-N — Label: ...` section from a markdown doc.

    Accepts both formats:
      `### P1: Conversation Bridge`              (original bstack)
      `### P1 — Bridge: Conversation Bridge`     (extended with categorical label)

    Returns {primitive_id: section_body_text}.
    """
    # `### P\d+` followed by `:` or ` —` (em-dash separator for the label form)
    pattern = re.compile(
        r"^### (P\d+)(?::|\s+—).*?$(.*?)(?=^### |\Z)",
        re.MULTILINE | re.DOTALL,
    )
    return {m.group(1): m.group(2) for m in pattern.finditer(text)}


def parse_claude_table_rows(text: str) -> set[str]:
    """Extract the P-N identifiers from the CLAUDE.md primitives table."""
    # Match table rows starting with `| P\d+ |`
    return set(re.findall(r"^\|\s*(P\d+)\s*\|", text, re.MULTILINE))


def parse_claude_count_header(text: str) -> int | None:
    """Extract the declared primitive count from CLAUDE.md header.

    Looks for patterns like:
        Sixteen irreducible building blocks
        Thirteen irreducible building blocks
    Returns None if not found.
    """
    word_to_int = {
        "One": 1, "Two": 2, "Three": 3, "Four": 4, "Five": 5,
        "Six": 6, "Seven": 7, "Eight": 8, "Nine": 9, "Ten": 10,
        "Eleven": 11, "Twelve": 12, "Thirteen": 13, "Fourteen": 14,
        "Fifteen": 15, "Sixteen": 16, "Seventeen": 17, "Eighteen": 18,
        "Nineteen": 19, "Twenty": 20,
    }
    m = re.search(
        r"(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve|Thirteen|Fourteen|Fifteen|Sixteen|Seventeen|Eighteen|Nineteen|Twenty) irreducible",
        text,
    )
    return word_to_int[m.group(1)] if m else None


def check_primitive_body(pid: str, body: str) -> tuple[list[str], list[str]]:
    """Check a single P-N section body for required + recommended sections.

    Returns (errors, warnings).
    """
    errors, warnings = [], []
    for section in REQUIRED_SECTIONS:
        if section not in body:
            errors.append(f"{pid}: missing required section {section}")
    if pid not in HOOK_ENFORCED and pid not in MECHANISM_ONLY:
        if not any(rec in body for rec in RECOMMENDED_SECTIONS):
            warnings.append(
                f"{pid}: missing Reflexive Trigger Rule "
                "(recommended for reasoning-enforced primitives)"
            )
    return errors, warnings


def main() -> int:
    if not AGENTS_MD.exists():
        print(f"[FAIL] {AGENTS_MD} not found", file=sys.stderr)
        return 1
    if not CLAUDE_MD.exists():
        print(f"[FAIL] {CLAUDE_MD} not found", file=sys.stderr)
        return 1

    agents_text = AGENTS_MD.read_text()
    claude_text = CLAUDE_MD.read_text()

    agents_primitives = parse_primitive_sections(agents_text)
    claude_table_rows = parse_claude_table_rows(claude_text)
    claude_count = parse_claude_count_header(claude_text)

    all_errors: list[str] = []
    all_warnings: list[str] = []

    # 1. Structural completeness per primitive
    for pid, body in sorted(agents_primitives.items(), key=lambda kv: int(kv[0][1:])):
        errors, warnings = check_primitive_body(pid, body)
        all_errors.extend(errors)
        all_warnings.extend(warnings)

    # 2. CLAUDE.md table row present for each AGENTS.md primitive
    for pid in agents_primitives:
        if pid not in claude_table_rows:
            all_errors.append(
                f"{pid}: defined in AGENTS.md but missing row in CLAUDE.md primitives table"
            )
    for pid in claude_table_rows:
        if pid not in agents_primitives:
            all_errors.append(
                f"{pid}: row in CLAUDE.md primitives table but no section in AGENTS.md"
            )

    # 3. Count consistency
    actual_count = len(agents_primitives)
    if claude_count is None:
        all_errors.append(
            "CLAUDE.md: could not find 'N irreducible building blocks' header"
        )
    elif claude_count != actual_count:
        all_errors.append(
            f"CLAUDE.md header says {claude_count} primitives "
            f"but AGENTS.md has {actual_count} P-N sections"
        )

    # Report
    print(f"[bstack-primitive-lint] G-L3-1 structural completeness check")
    print(f"  Primitives found in AGENTS.md: {actual_count}")
    print(f"  Primitives in CLAUDE.md table:  {len(claude_table_rows)}")
    print(f"  Header count claim:             {claude_count}")
    print()

    for warn in all_warnings:
        print(f"  [WARN ] {warn}")
    for err in all_errors:
        print(f"  [ERROR] {err}")

    print()
    if all_errors:
        print(f"[bstack-primitive-lint] FAIL — {len(all_errors)} error(s), "
              f"{len(all_warnings)} warning(s)")
        return 1
    print(f"[bstack-primitive-lint] OK — {len(all_warnings)} warning(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
