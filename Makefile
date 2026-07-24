# Keel — governance and verification targets.
#
# Every target below is a verification edge Keel itself would classify, so keep
# them anchored: the signal must come from a process this repo cannot talk out
# of. A target that only prints, or that asserts against a value this repo also
# writes, is `self_referential` by our own definition and should not be here.

# ── bstack discovery ─────────────────────────────────────────────────────────
# bstack is an OPTIONAL dependency. The targets that need it (doctor,
# bstack-check) locate it at run time across the usual install roots, and print
# an actionable message instead of a confusing `No such file` when it is absent.
# Everything else in this file — the gates, the janitor — runs from scripts
# vendored in this repo and works on a bare clone with no bstack at all.
#
# Override with `make BSTACK=/path/to/bstack doctor` or export BSTACK.
BSTACK ?= $(shell for d in \
	  "$$HOME/.claude/skills/bstack" \
	  "$$HOME/.agents/skills/bstack" \
	  "$$HOME/.local/share/bstack" \
	  "$(CURDIR)/.bstack" ; do \
	    [ -f "$$d/scripts/doctor.sh" ] && echo "$$d" && break ; \
	  done)

define REQUIRE_BSTACK
	@if [ -z "$(BSTACK)" ]; then \
	  echo "bstack not found — this target is optional and needs it."; \
	  echo ""; \
	  echo "  install:  git clone https://github.com/broomva/bstack.git ~/.claude/skills/bstack"; \
	  echo "  or point: make BSTACK=/path/to/bstack $@"; \
	  echo ""; \
	  echo "Repo-local gates need no bstack: make bstack-l3-trust | janitor"; \
	  exit 1; \
	fi
endef

.PHONY: help doctor bstack-check janitor janitor-apply portability-check \
        bstack-primitive-lint bstack-rule-of-three bstack-l3-trust \
        design-audit design-sync

help: ## Show available targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}'

doctor: ## bstack primitive-contract compliance report (needs bstack; always exits 0)
	$(REQUIRE_BSTACK)
	@bash "$(BSTACK)/scripts/doctor.sh"

bstack-check: ## Harness validation — doctor in strict mode (needs bstack; non-zero on gap)
	$(REQUIRE_BSTACK)
	@bash "$(BSTACK)/scripts/doctor.sh" --strict

portability-check: ## Fail if any committed file hardcodes a machine-specific path
	@bash scripts/portability-check.sh

design-audit: ## Design-system adherence gate (raw literals, token drift, schema/CSS agreement)
	@python3 scripts/design-audit.py

design-sync: ## Rewrite the site/ token copies from skills/keel/design/ (canonical)
	@python3 scripts/design-audit.py --fix-sync

janitor: ## P8 — dry-run branch/worktree cleanup
	@bash scripts/branch-janitor.sh

janitor-apply: ## P8 — apply branch/worktree cleanup
	@bash scripts/branch-janitor.sh --apply

bstack-primitive-lint: ## G-L3-1 — every P-N has What/How/Why/Invariant + a CLAUDE.md row
	@python3 scripts/bstack-primitive-lint.py

bstack-rule-of-three: ## G-L3-2 — rule-of-three ledger evidence (not applicable here, see note)
	@python3 scripts/bstack-rule-of-three.py

# ─────────────────────────────────────────────────────────────────────────────
# Why `bstack-l3-trust` runs G-L3-1 only.
#
# G-L3-2 audits *primitive promotion*: it requires that every primitive added
# since P16's formalization carry >=3 logged instances in the candidate ledger at
# `research/entities/pattern/bstack-engine.md`. That gate belongs in the
# workspace where primitives are authored. Keel authors none — it inherits
# P1-P20 from bstack and promotes nothing — so there is no ledger here and the
# script fails on a missing file rather than on a real violation.
#
# Wiring it anyway would produce a gate that fails by construction, and a gate
# that always fails is not a gate: it gets ignored, then bypassed, and its red
# stops carrying information. That is the exact failure this repository exists
# to name, so we decline to ship it.
#
# This is a scoped exemption, not a blanket one. The moment Keel promotes its
# own primitive (a P21, or a Keel-specific governance rule), G-L3-2 becomes
# load-bearing and belongs in this target. `make bstack-rule-of-three` stays
# available above so the gate can be run — and seen to fail, and read — at any
# time rather than being quietly deleted.
# ─────────────────────────────────────────────────────────────────────────────
bstack-l3-trust: bstack-primitive-lint ## L3 trust-gate pack (G-L3-1; G-L3-2 scoped out — see note)
	@echo "[bstack-l3-trust] G-L3-1 primitive-lint passed."
	@echo "[bstack-l3-trust] G-L3-2 rule-of-three not run: no primitives are promoted in this repo."
	@echo "[bstack-l3-trust] L3 trust gates passed — governance change is structurally valid."
