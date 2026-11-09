# PROTOTYPE: optimizer tuning (throwaway)

Ticket: "Tune the mapping from Dependency Graph to Optimal Tree". Node scripts (run from the repo root, Node ≥ 22.18):

- `node src/prototype-mobile-ui/tuning/strategies.ts django`: contraction strategies (cost, groups, nesting violations)
- `node src/prototype-mobile-ui/tuning/exact.ts flask`: exact DP contraction vs the heuristics (small repos only)
- `node src/prototype-mobile-ui/tuning/compare.ts django`: dendrogram linkages under the sweep
- `node src/prototype-mobile-ui/tuning/blob.ts django 0.4`: whether a hub blob's loose files have any improving move
- `node src/prototype-mobile-ui/tuning/cross.ts django`: every λ's greedy tree evaluated at every λ
- `node src/prototype-mobile-ui/tuning/show.ts flask sweepUp 0.6 6`: print a tree

UI: `npm run dev`, then `?opt=1|2|3|4` (bottom bar) on the icicle view.
