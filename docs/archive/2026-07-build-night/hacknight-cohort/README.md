# The build-night cohort, pseudonymised

Twenty-one repositories were built at Platanus Build Night Bogotá on 2026-07-24.
Seven of them were measured; those measurements are here, and the cohort
aggregate is published at `/reports/hacknight-anon/`.

## Why the names are gone

The named reports — `site/reports/hacknight/<handle>.html` — were committed and
deployed. Nothing linked to them, but they were publicly fetchable by URL, and an
anonymised variant already existed beside them, unused.

Publishing a named individual's grounding ratio is a different act from
publishing a cohort aggregate, and the two lowest scores were the least
defensible ones: **0.000 with 8 of 8 edges `unknown`, and 0.111 with 8 of 9.**
Under Keel's own fail-closed rule `unknown` means *"Keel could not trace the fork
point"* — not *"this person does not test their code"*. A reader seeing a GitHub
handle beside a 0.0 will not make that distinction, and asking them to is not a
reasonable thing to ask.

The aggregate carries the finding without naming anyone, and it already says the
thing that matters: *"these were written in one night against a deadline, and
shipping something that works is the correct priority at hour four. Wiring a gate
is a Tuesday problem."*

## What is here

The raw `Report` JSON for each measured repository, with the participant's handle
replaced by a stable `participant-NN` alias everywhere it appeared — the `target`
field and any other occurrence. Aliases are assigned in sorted-handle order, so
they carry no information about scores.

The data is kept so the published cohort ratio stays reproducible from artifacts
rather than from a claim. Nothing here is deployed: GitHub Pages uploads `site/`
only.
