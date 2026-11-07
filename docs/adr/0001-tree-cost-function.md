# Tree cost function: both-sides uniform codes, normalized, one Balance λ

**Status:** accepted (resolves "Lock the cost function", #9)

## Decision

The optimizer minimizes, and every scorer reports, this **Total Cost** of a Tree T for a Dependency Graph with N files and directed edge set E:

```
Total Cost(T; λ) = λ · (1/|E|) · Σ_{e ∈ E} c(e)  +  (1−λ) · (1/N) · Σ_{internal x} ln k(x)

c(u→v) = Σ ln k(x) over the internal nodes x on the tree path u … LCA … v
         (every ancestor of u below the LCA, the LCA once, every ancestor of v below the LCA)
```

- **Both sides of the path count.** Equivalently, an internal node is crossed when it contains exactly one endpoint, or when it is the LCA.
- **Uniform codes.** Each crossed node costs ln k, where k is its number of children. Codes are not weighted by volume or flow.
- **Directed edges count individually.** A mutual import a→b, b→a pays twice, and |E| counts directed edges. A self-import has an empty path and costs 0. Multiplicity doesn't exist, because the Graph File stores each pair at most once.
- **Normalization.** The edge term is per dependency and the node term is per file. Both are in nats. If |E| = 0, the edge term is 0. The node term divides by N (the number of files) and not by the number of internal nodes, so the denominator doesn't depend on the tree.
- **λ ∈ [0, 1]** is the only parameter, and the slider sets it directly (possibly through a non-linear UI mapping). λ = 0 gives one flat root. λ = 1 drops Node Cost, and the both-sides edge term still regularizes itself.
- **Single-child nodes cost nothing** (ln 1 = 0), so the score of a Directory Tree with folder chains is well defined. Optimal Trees still collapse them.
- **Reference function:** `scoreTree(tree, graph, λ) → { total, edgeTerm, nodeTerm }`. `edgeTerm` and `nodeTerm` are the normalized values before λ weighting. The optimizer's incremental Δ must agree with it, checked by a property test. The UI-hidden Directory Tree scorer is just `scoreTree` applied to the Directory Tree.

## Why

- **Both sides, not descent-only.** Counting only LCA→target is structural entropy with uniform branches. Exact search over all 8-leaf trees showed that it prefers binary trees even for K8, a graph with no structure. Both-sides counting is the hierarchical map equation with uniform codebooks: it picks flat for K8 and two-level for 2K4 (see `docs/research/tree-cost-objectives.md`).
- **Uniform ln k, not volume-weighted.** It shares units with Node Cost, keeps the closed-form contraction Δ that the optimizer research benchmarked, and is easy to explain. Volume weighting remains a possible later refinement.
- **Normalization.** Within one repo it only reparametrizes λ, so the set of optimal trees doesn't change. Across repos it lets one default λ work and makes costs comparable ("nats per dependency", "nats per file"). It is *not* scale invariance, because edge costs still grow like ln N.
- **Slider = λ, not a target outcome.** A target such as average branching or depth would need a λ search, and those outcomes aren't guaranteed to change monotonically with λ. A direct weight is predictable and costs one contraction per slider move.

## Considered and rejected

- **Hierarchical map equation (Infomap) as the objective.** It has no true trade-off parameter (Markov time is only related), and it is GPL. It stays the comparison baseline.
- **Structural entropy without a height cap, and Dasgupta.** Both are optimized by binary trees, and Dasgupta is not information-theoretic.
- **Unnormalized sums.** The λ that gives a useful tree would drift with repo size.
- **Merging reciprocal imports into one undirected edge.** That would drop real coupling information, and summing over the Graph File's edge list is simpler.
