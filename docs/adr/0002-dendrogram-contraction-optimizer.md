# Optimizer: one offline dendrogram per repo, contracted live per λ

**Status:** accepted (resolves "Choose the optimizer approach and where it runs", #10)

For each Example Repo we build one binary dendrogram offline. It does not depend on λ and is built by structural-entropy merge/combine behind a `buildDendrogram(graph)` seam. It ships as its own artifact next to the Graph File, keyed to the Graph File's hash, so the Graph File stays pure Parser output. In the browser, a Web Worker greedily contracts that dendrogram for the current λ. Each contraction move uses the closed-form Δ, which must agree with `scoreTree` (ADR 0001). We chose this over a full search per λ (live or precomputed at discrete λ values) because it is the only design that stays interactive up to Linux size (≈60k files / 500k edges, ~0.1–0.2 s per contraction on desktop). It also gives a property we now treat as an invariant: **Optimal Trees at different λ are nested coarsenings of one hierarchy**, so the slider never shuffles files between unrelated branches. The price is optimality. The result is a heuristic bounded by the dendrogram's merge order, which is why the glossary defines the Optimal Tree as what the optimizer finds, not the true minimum.

## Consequences

- **Single language.** Everything is TypeScript: the same code runs under Node offline and in the worker. Use WASM only if contraction at Linux size proves too slow on mobile.
- **Determinism without seeds.** Nothing is random. A move is taken only if Δ < −ε (ε ≈ 1e-9 nats), so `Math.log` differences between engines can't flip near-ties. Ties break by a stable order (file path, then node id). Tests assert byte-identical output in the pinned engine (Node and Playwright Chromium).
- **λ snaps to 101 steps** (0.00–1.00, applied after any non-linear slider mapping), with results memoized per step. Tests, screenshots and URLs name exact λ values.
- **Fixed v1 scope.** No refinement sweeps, and greedy rather than exact (DP) contraction. A future refinement must keep nesting, e.g. by refining the dendrogram once rather than per λ.
- **Infomap** is a comparison baseline only (GPL-3.0, ~5 MB bundle).
