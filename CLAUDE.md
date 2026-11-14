# Structra

Structra visualizes the information-theoretic Optimal Tree of a repository's file dependency graph. See `GLOSSARY.md` for the domain glossary. It is this repo's `CONTEXT.md`: skills that read or update `CONTEXT.md` should use `GLOSSARY.md` instead.

## Planning: wayfinder map on GitHub Issues

Planning lives on GitHub Issues in `realJohnDoe/structra`:

- The map is the issue labelled `wayfinder:map`. Its tickets are sub-issues.
- Ticket type labels: `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, `wayfinder:task`.
- Blocking: GitHub's native issue dependencies where they're available; otherwise a `## Blocked by` section in the ticket body.

## Model labels

Before creating or labelling a ticket, or opening a PR, follow the [workshop](https://github.com/realJohnDoe/agent-skills) plugin's `issue-conventions` skill. Every ticket, the map included, gets a model label; HITL grilling and prototyping tickets are `opus`.

## Research output

Research findings go in `docs/research/<topic>.md`, and the ticket links to them.

## Closing issues

- **If resolving an issue produces changes to keep:** open a PR for them, and close the issue through it by putting `Closes #N` in the PR description. GitHub then closes it on merge.
- **Otherwise:** close the issue directly, with a summary comment.

When a Wayfinder ticket closes, by either route, add its line to the map's "Decisions so far".

## Trace Map on PRs

Use the `tracemap-pr` skill from [realJohnDoe/tracemap](https://github.com/realJohnDoe/tracemap) (`skills/tracemap-pr/SKILL.md`) on every PR to add trace map images to its description; it decides itself when none would help.

## Package manager

Use pnpm, never npm or yarn. `parsers/typescript` is a workspace member, so install from the repo root. Dependabot proposes updates; non-major ones auto-merge once CI passes.
