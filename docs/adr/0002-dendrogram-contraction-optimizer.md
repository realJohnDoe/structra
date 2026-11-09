# Optimizer: one offline dendrogram per repo, contracted by one sweep along λ

**Status:** accepted (resolves "Choose the optimizer approach and where it runs", #10). Amended by "Tune the mapping from Dependency Graph to Optimal Tree" (#22): contraction is a sweep along λ, not a greedy pass per λ.

For each Example Repo we build one binary dendrogram offline. It does not depend on λ and is built by structural-entropy merge/combine behind a `buildDendrogram(graph)` seam. It ships as its own artifact next to the Graph File, keyed to the Graph File's hash, so the Graph File stays pure Parser output. In the browser, a Web Worker contracts that dendrogram for all 101 λ steps in one **sweep up λ**. It starts from the flat tree (only the root survives) at λ = 0. At each step it takes the most improving *split* (re-introducing a contracted dendrogram node) until no split improves, then carries the result on to the next step. Each move uses the closed-form Δ, which must agree with `scoreTree` (ADR 0001). We chose this over a full search per λ (live or precomputed at discrete λ values) because it is the only design that stays interactive up to Linux size (≈60k files / 500k edges, ~0.1–0.2 s per contraction on desktop). It also gives a property we now treat as an invariant: **Optimal Trees at different λ are nested coarsenings of one hierarchy**, so the slider never shuffles files between unrelated branches. The sweep guarantees this by construction, because a higher λ only ever adds splits. The price is optimality. The result is a heuristic bounded by the dendrogram's merge order, which is why the glossary defines the Optimal Tree as what the optimizer finds, not the true minimum.

## Consequences

- **Single language.** Everything is TypeScript: the same code runs under Node offline and in the worker. Use WASM only if contraction at Linux size proves too slow on mobile.
- **Determinism without seeds.** Nothing is random. A move is taken only if Δ < −ε (ε ≈ 1e-9 nats), so `Math.log` differences between engines can't flip near-ties. Ties break by a stable order (file path, then node id). Tests assert byte-identical output in the pinned engine (Node and Playwright Chromium).
- **λ snaps to 101 steps** (0.00–1.00, applied after any non-linear slider mapping), with results memoized per step. Tests, screenshots and URLs name exact λ values.
- **Fixed v1 scope.** No refinement passes, and a heuristic sweep rather than exact (DP) contraction. A future refinement must keep nesting, e.g. by refining the dendrogram once rather than per λ.
- **Shapes are the objective's.** Chains of near-identical levels, a flat hub blob of a repo's tests and other consumers, and import-less files hanging at the root are what ADR 0001's cost prefers, not optimizer artifacts. The exact contraction keeps them. Consumers of a single hub carry no dependency signal that could split them, and volume-weighted codes wouldn't split them either. v1 shows them as the imports imply. It adds no directory prior and no display-only regrouping.

## Why a sweep, not greedy per λ

Measured in the prototype (branch `prototype/optimizer-tuning`, `src/prototype-mobile-ui/tuning/`) on requests, flask and django with a Paris-style dendrogram:

- **Greedy per λ gets trapped.** Taking the most negative contraction first lets the root snowball: once its k is large, every child joins it cheaply. On django the λ = 0.5 greedy tree beats the λ = 0.1 greedy tree *at λ = 0.1* (0.841 vs 0.909 nats). On django the sweep is 13–16% cheaper than greedy for λ ≤ 0.4 and 1–13% cheaper above. On flask the two are within 0.2% of each other.
- **Close to exact.** Against an exact tree-knapsack DP over the same dendrogram (feasible for flask and requests only), the sweep is at most 0.15% worse at every λ tested. Greedy is up to 0.8% worse there. The exact optimum itself is not perfectly nested (two violations on flask), so the nesting invariant costs almost nothing.
- **Nesting.** Greedy per λ broke nesting 378 times across django's 101 steps, and its group count fell from 403 at λ = 0.4 to 380 at λ = 0.5. The sweep has no violations, and its group count rises monotonically.
- **λ = 1 is no longer mostly binary.** With the sweep, 61% of django's groups are binary at λ = 1, down from 85% (flask: 27%, down from 67%). Django has 458 groups at λ = 1 instead of 1,225.
- **Cheap.** All 101 steps for django (2,943 files) take about 0.1 s in Node, even with a full O(n) rescan per move. Repos far beyond v1's ~4.5k files would need incremental Δ maintenance (a heap).
- **Merge rule barely matters.** Under the sweep, size-normalized Paris, degree-normalized Paris, and a linkage derived from our own Δ differ by 1–2% in cost, with no consistent winner and no visible change in shape. The `buildDendrogram` seam stays. The merge rule isn't a lever for shape.
- **Infomap** is a comparison baseline only (GPL-3.0, ~5 MB bundle).
