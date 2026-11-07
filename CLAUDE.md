# CLAUDE.md

## Closing issues

Never close an issue (or mark a ticket done) before its changes are merged to `main`. Close issues through the pull request instead, by putting `Closes #N` or `Fixes #N` in the PR description, so GitHub closes them on merge.

When working a Wayfinder ticket, post the resolution comment as usual but leave the ticket open until the PR merges, and add its line to the map's "Decisions so far" only once it is closed.

## Pull requests

Always open a PR when the working branch has none yet. Put `Closes #N` for each ticket the branch completes in the PR description.
