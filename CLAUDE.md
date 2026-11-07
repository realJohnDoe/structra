# Structra

Structra visualizes the information-theoretic Optimal Tree of a repository's file dependency graph. See `CONTEXT.md` for the domain glossary.

## Planning: wayfinder map on GitHub Issues

Planning lives on GitHub Issues in `realJohnDoe/structra`:

- The map is the issue labelled `wayfinder:map`. Its tickets are sub-issues.
- Ticket type labels: `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, `wayfinder:task`.
- Blocking: GitHub's native issue dependencies where they're available; otherwise a `## Blocked by` section in the ticket body.

## Model labels

Every ticket (and the map) carries exactly one model label that says which Claude model should drive it:

- `model:opus`: open-ended reasoning, design decisions, HITL grilling and prototyping, research where judgment matters.
- `model:haiku`: well-specified, mechanical work with a clear done-state (deploy config, deleting code, simple chores).

When you create a ticket, always add a model label. When in doubt, use `model:opus`.

## Research output

Research findings go in `docs/research/<topic>.md`, and the ticket links to them.
