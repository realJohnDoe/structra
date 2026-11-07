# Tree optimization algorithms and in-browser scaling

Research for ticket realJohnDoe/structra#7. Question: which algorithms find a near-minimum-cost **Tree** (GLOSSARY.md) over a repo's **Dependency Graph**, for structural entropy, the hierarchical map equation, Dasgupta cost, or Structra's own cost

```
Total Cost(λ) = λ · Σ_edges Σ_{crossed internal nodes t} ln k_t  +  (1−λ) · Σ_internal t ln k_t
```

and what can run interactively in a Web Worker at numpy (~500 files, a few thousand edges), django (~2–3k files) and Linux kernel (~60k files, ~500k include edges) sizes.

## TL;DR

1. **No library optimizes Structra's cost directly.** We will write the optimizer ourselves. The literature gives three reusable building blocks: (a) a greedy *agglomerative* builder that makes a binary dendrogram (Li & Pan "merge/combine", Paris, average linkage), (b) a *coarsening* step that flattens that dendrogram into a multi-way tree (HCSE "compress", SEAT's DP contraction, Infomap's super-module search), and (c) *local-move refinement* (Louvain/Leiden/Infomap node moves, NNI/regraft moves on trees).
2. **Split the work into a λ-independent part and a λ-dependent part.** Build one binary dendrogram per repo (expensive, λ-independent). Then, for each λ, *contract* it by greedily flattening internal nodes into their parents whenever that lowers Total Cost(λ) (cheap). I prototyped this in plain JS (see the Benchmarks section): the contraction takes **~1–3 ms for numpy size, ~5–12 ms for django size and ~85–170 ms for a 60k-node / 500k-edge graph**. That is interactive on a slider in a Web Worker at every target size.
3. **Building the dendrogram is the bottleneck.** In naive JS it takes ~25 ms (numpy), ~220 ms (django) and **~25 s (Linux size)**. Infomap's WASM build takes ~10 s for the Linux-size graph. For Example Repos the Linux-size dendrogram should be **precomputed offline** and shipped with the Graph File. Small repos can build it in the browser.
4. **You don't need to precompute trees at discrete λ values** if we adopt the dendrogram-plus-contraction design. Per-λ contraction is fast enough to run live. Discrete-λ precomputation only becomes necessary if we want a *full* search (fresh agglomeration plus refinement) per λ at Linux size. Even then, it is optional caching rather than a requirement.
5. **Infomap (`@mapequation/infomap`, WASM) works in a browser worker, but its fit is weak.** It optimizes the map equation, not our cost, its only resolution-like knob is Markov time (not λ), it is GPL-3.0-or-later, and it ships a ~5 MB JS bundle with the WASM inlined. It's fine as a seed tree or a comparison baseline, but not as the engine.

## Source access note

This session's network allowed GitHub and npm/PyPI but **not** arxiv.org, nature.com, PLOS, PMC, PMLR, ACM, or Semantic Scholar. Paper claims below come from (i) the papers' own abstracts/snippets as surfaced by web search, with the canonical paper URL cited, and (ii) the official code repositories, which I cloned and read. A claim marked *(abstract)* has been checked only against the abstract or search snippet, not the full text. A claim marked *(code)* was read directly in the source repo. *(measured)* means I ran it here.

---

## 1. Objectives in brief

| Objective | What a tree pays for | Tree shape it favours | Primary source |
|---|---|---|---|
| Structural entropy of an encoding tree (Li & Pan) | For each tree node α: −(g_α / vol G)·log(vol α / vol parent(α)), where g_α is the cut leaving α. Information needed to locate a random walk step in the hierarchy | Multi-level, height usually capped at K | Li & Pan, "Structural Information and Dynamical Complexity of Networks", IEEE TIT 62(6):3290–3339, 2016, doi:10.1109/TIT.2016.2555904 |
| Hierarchical map equation (Infomap) | Bits per step to describe a random walker with nested codebooks | Multi-level, number of levels chosen by the objective | Rosvall & Bergstrom, "Multilevel compression of random walks…", PLoS ONE 6(4):e18209, 2011, https://arxiv.org/abs/1010.0431 |
| Dasgupta cost | Σ_edges w(u,v)·\|leaves(LCA(u,v))\| | The optimum is a binary tree | Dasgupta, "A cost function for similarity-based hierarchical clustering", STOC 2016, https://arxiv.org/abs/1510.05043 |
| Structra Total Cost | λ·Σ edges·ln k on crossed nodes + (1−λ)·Σ ln k | λ→0: one flat root (Node Cost only). λ→1: deeper trees whose nodes still have k>2 (see benchmark) | GLOSSARY.md |

All four objectives *decompose over internal nodes*, and the change from a local edit can be computed from aggregates (volume, cut, number of LCA edges, branching). That property is what makes greedy merge and local-move algorithms cheap for them. Everything below relies on it.

For Structra's cost, take an internal node t with branching k_t. Let c_t = cut(t) + (#edges whose LCA is t). This assumes "crossed nodes" includes the LCA, which GLOSSARY.md still lists as open. Then

```
cost(t) = ln k_t · (λ·c_t + (1−λ))
```

**Contracting** a child u into its parent p (u's children become p's children) changes only p and u:

```
k_p' = k_p − 1 + k_u
c_p' = c_p + lca(u)          # u's LCA edges now have p as LCA; u's cut edges already crossed p
Δ    = ln k_p'·(λ c_p' + 1−λ) − cost(p) − cost(u)
```

So each move is an O(1) evaluation. I derived this myself from GLOSSARY.md's definitions and checked it in the prototype. I did not take it from a paper.

---

## 2. Greedy merge/combine for structural-entropy encoding trees

### Li & Pan merge and combine operators
- **What they do.** *Merge* puts two sibling subtrees under one node, which flattens them into a single module. *Combine* inserts a new intermediate node above two siblings, which adds depth. The standard 2-level heuristic starts with each vertex as its own module and repeatedly applies the merge with the largest entropy decrease. Deeper trees come from greedily *combining* the root's children until entropy stops dropping, which builds a binary tree, and then lifting or squeezing subtrees to meet a height limit K. Sources: Li & Pan 2016 (above). The operator descriptions as restated by SE-GSL, https://arxiv.org/abs/2303.09778 *(abstract)*. SEAT implements exactly this pipeline: `_merge_phase`, then `_binary_combine`, then a DP `contract_tree` down to a k-level tree (https://github.com/deepomicslab/seat, `src/SEAT.py`) *(code)*.
- **Locality.** The entropy change of merging or combining α and β depends only on the volumes and cuts of α, β and their parent. The cost of each evaluation is O(1), plus O(deg) to update adjacency.
- **Complexity.** A later paper credits Pan et al. with O(m·log² n) for merge-plus-combine optimization (SeSE, https://arxiv.org/abs/2511.16275) *(abstract, secondary)*. In practice an implementation with a lazy heap is O(m log m) heap operations plus adjacency-map merging. Small-into-large merging gives O(m log n) map updates. **Caveat (measured):** a merged high-degree module must re-score every neighbour pair, so graphs with hub files (e.g. `linux/kernel.h`-style headers) pay much more than m log n.
- **Quality.** Greedy and with no approximation guarantee. Good on modular graphs, and it is the standard baseline in the SE literature. deDoc (Li et al., Nat. Commun. 9:3265, 2018) uses this greedy SE minimization on Hi-C graphs. The released code is a Java jar (https://github.com/yinxc/structural-information-minimisation) *(code: README)*. deDoc2 (https://github.com/zengguangjie/deDoc2) uses a **dynamic program over contiguous partitions**, which only works because genome bins are linearly ordered. It **does not transfer** to file graphs *(code: README)*.

### HCSE (Pan, Zheng, Fan)
- "An Information-theoretic Perspective of Hierarchical Clustering (on Graphs)", arXiv 2108.06036, UAI 2025 (PMLR v286, https://proceedings.mlr.press/v286/pan25a.html) *(abstract)*.
- **How it works.** Two operators. *Stretch* turns a node's children into a binary subtree by greedy combine. *Compress* flattens the binary subtree back so that the tree gains exactly one level, picking the "sparsest" level. Iterating stretch and compress adds levels until a stopping criterion fires, so the number of levels is chosen automatically, with no hyperparameter.
- **Complexity** *(abstract/search snippet)*: O(k·m·h_max·log n + k·h_max·n) for k levels, with h_max = O(log n) after balancing. That is roughly O(k·m·log² n).
- **Quality.** Reported to beat Louvain and hierarchical label propagation on synthetic hierarchical benchmarks, especially at recovering the true number of levels. Competitive on real graphs.
- **Relevance.** HCSE's "build binary, then compress to the right depth" is the closest published analogue of the recommended Structra design (§7).
- **Implementations.** I found no official HCSE code. There is no JS/TS/WASM implementation of any structural-entropy optimizer on npm (searched for "structural entropy": nothing relevant). Python options: `pyseat` (SEAT, https://github.com/deepomicslab/seat) and `selib` (https://github.com/SuuTTT/selib). selib is a small personal research library with greedy 2D-SE, `se_hier`, and exact-delta NNI refinement of encoding trees. It is low-trust but readable.

### Incremental SE
Yang, Peng, Liu, Li, "Incremental Measurement of Structural Entropy for Dynamic Graphs", Artificial Intelligence 334 (2024), arXiv 2207.12653 *(abstract)*. It shows how to adjust a 2-level encoding tree under edge insertions without recomputing it. That matters if Structra later animates commits. It does not help with the λ slider.

---

## 3. Infomap's hierarchical search

- **Objective.** The hierarchical map equation (Rosvall & Bergstrom 2011, above). It chooses the number of levels itself.
- **Algorithm** *(code: `src/core/InfomapBase.cpp`, `hierarchicalPartition()`)*:
  1. **Two-level partition** with a Louvain-style core loop: nodes move to the neighbouring module with the best codelength change, modules are aggregated and the loop repeats. Coarse-tune and fine-tune steps then re-run the moves on sub-modules and on single nodes.
  2. **Super-modules, bottom-up** (`findHierarchicalSuperModules`): run the two-level search again on the network of modules, repeatedly, adding levels on top while the hierarchical codelength improves.
  3. **Recursive top-down partition** (`recursivePartition`): run a sub-Infomap inside each module to find sub-modules. Then `dissolveUnprofitableModules`. If the result ends up worse than the super-level tree, the code falls back to that tree.
- **Complexity.** Each core-loop sweep is O(m). The paper and docs give no closed-form bound. In practice the cost is near-linear in m times the number of trials and levels.
- **Quality.** The reference implementation, widely benchmarked. `-N` trials improves results.
- **JS/WASM.** `@mapequation/infomap` 2.16.0 on npm is the official package. It's compiled with Emscripten and ships a browser **Web Worker** build, a Node entry point, a React hook and a CLI. Its README calls it "used by Infomap Online". **License GPL-3.0-or-later.** The unpacked package is 19.6 MB. The browser `index.js` is ~5.2 MB because the WASM is inlined (`SINGLE_FILE=1`, `mk/js.mk`) *(code)*. The WASM build is **single-threaded**: OpenMP is only for native builds, and the Emscripten flags have no pthreads *(code)*. The older `infomap` npm package (1.0.5) is unrelated and stale.
- **Fit for Structra.** Infomap optimizes the map equation, not our cost, and λ has no counterpart. `--markov-time` changes module granularity and is the closest knob, but a slider over Markov time would need a full re-run, which takes ~10 s at Linux size. Use it as a baseline and possibly as a seed tree that our contraction or refinement then adapts to λ. The GPL license needs a decision before bundling it into the static app.

---

## 4. Agglomerative / linkage clustering

- **Average linkage on graph similarity.** Cohen-Addad, Kanade, Mallmann-Trenn & Mathieu, "Hierarchical Clustering: Objective Functions and Algorithms", SODA 2018 / JACM 2019, https://arxiv.org/abs/1704.02147 *(abstract)*: average linkage is a 2-approximation for the *dissimilarity* version of Dasgupta's objective. For the similarity version (ours), the known good guarantee is **recursive sparsest cut, O(√log n)**: Charikar & Chatziafratis (SODA 2017) and Cohen-Addad et al., improving Dasgupta's O(log^{3/2} n). Sparsest cut needs an SDP/LP solver and is not practical in a browser at 60k nodes.
- **Paris** (Bonald, Charpentier, Galland, Hollocou, MLG 2018, https://arxiv.org/abs/1806.01664) *(abstract + code)*. Agglomerative clustering with the distance p(a)p(b)/p(a,b), the node-pair-sampling ratio. The distance is *reducible*, which allows the **nearest-neighbour-chain** algorithm, so no global heap is needed. The output is a regular dendrogram. It is parameter-free and runs in near-O(m log n) on sparse graphs. Implementations: `tbonald/paris` (Python/networkx) and scikit-network's `Paris` in Cython (https://github.com/sknetwork-team/scikit-network, `sknetwork/hierarchy/paris.pyx`). scikit-network also provides `LouvainHierarchy`, `dasgupta_cost`, `dasgupta_score` and dendrogram cutting utilities *(code)*.
- **Structural-entropy merge** (§2) is the same agglomerative scheme with ΔSE as the merge score.
- **JS/npm.** `ml-hclust` 4.0.0 and `hierarchical-clustering` work on distance matrices, which needs O(n²) memory: fine for numpy and django, impossible at 60k (3.6·10⁹ pairs). No npm package does *graph* agglomeration (Paris or SE). It's ~150 lines to write (my prototype was).
- **Quality notes.** A binary dendrogram is the right *intermediate* for our cost because contraction can only remove nodes. Agglomeration decides the nesting order once, and later steps can't undo a bad early merge except through refinement moves (§5).

---

## 5. Local-move refinement

- **Node moves between modules (flat partitions).** Louvain (Blondel et al. 2008) and Leiden (Traag, Waltman & van Eck, Sci. Rep. 9:5233, 2019, https://arxiv.org/abs/1810.08473) *(abstract)*. Leiden adds a refinement phase that guarantees connected communities and converges to partitions where every subset is locally optimally assigned. One sweep is O(m), and a few sweeps usually converge. The same moves apply to any objective with O(1) or O(deg) deltas: modularity, CPM, map equation (Infomap's core loop), 2D-SE (selib's `se_louvain`). JS implementations: `graphology-communities-louvain` 2.0.2 (MIT), `ngraph.leiden` 0.3.0, `leiden-ts` 0.1.0. All optimize modularity or CPM, so we'd re-target the delta function rather than use them as-is.
- **Tree moves.**
  - *Contract/expand*: flatten a node into its parent, or split a node's children with a new intermediate node. This is the Li–Pan merge/combine applied locally, and the move my prototype uses.
  - *NNI* (swap a node with its uncle) and *subtree prune-and-regraft*. selib implements exact-delta NNI and graft moves for SE trees and reports it much faster than its greedy hierarchical builder (its README benchmark; low-trust source) *(code: README)*.
  - Infomap's coarse-tune and fine-tune are the same idea for map-equation trees.
- **Complexity.** With per-node aggregates (k, cut, lca count), a contract, expand or NNI move costs O(1) to score plus O(k) to apply. A sweep is O(#internal nodes · avg k). Prune-and-regraft has to score candidate destinations, so restrict destinations to the tree neighbourhood of nodes adjacent in the graph.
- **Quality.** Refinement fixes greedy agglomeration's early mistakes. It's a local optimum, not a guarantee. Exact optimization over all trees is hopeless beyond ~18 leaves (selib's exact DP verifier limit).

---

## 6. Benchmarks (measured here)

**Setup.** Node 22, one core of a 4-vCPU Xeon @ 2.1 GHz, so roughly a desktop browser worker; expect mobile to be 2–4× slower. I used a synthetic "directory-like" graph generator: files placed in a 4-level folder hierarchy, 50% of edges within the same leaf folder, decreasing shares at higher levels, and 10% going to hub files. The repo's `data/numpy2.dot` is only 204 files and 307 edges, too small to be representative. The prototype scripts were throwaway scratch code and aren't in the repo. The numbers are indicative, not a benchmark suite. A real kernel include graph has heavier hubs.

| Step | numpy-size (500 / 3k edges) | django-size (3k / 20k) | Linux-size (60k / 500k) |
|---|---|---|---|
| Infomap WASM (`@mapequation/infomap/node`, hierarchical, default 1 trial) | 140 ms incl. WASM init (≈50 ms warm) | 450 ms | **9.7 s** |
| Infomap WASM `--two-level` | 136 ms | 280 ms | 12 s |
| scikit-network Paris (native Cython) | 23 ms | 176 ms | 9.1 s |
| scikit-network LouvainHierarchy (native) | 13 ms | 48 ms | 1.2 s |
| My JS greedy 2D-SE merge (stop when ΔSE ≥ 0, lazy heap) | 23 ms | 148 ms | 12 s |
| My JS SE merge run to a full binary dendrogram (unoptimized `Map`s) | 25 ms | 220 ms | **25 s** |
| My JS **per-λ contraction** of that dendrogram under Structra's cost (λ ∈ (0,1]) | **1–3 ms** | **4–12 ms** | **84–170 ms** |
| Same, λ = 0 (degenerate: everything collapses into one root) | 3 ms | 12 ms | 1.9 s (O(k²) child-list splice; easy to special-case) |

Real numpy graph (`data/numpy2.dot`, 204 files / 307 edges): Infomap WASM takes 53 ms warm and finds 5 levels.

What the contraction outputs: at λ=0.5 the Linux-size graph contracts to ~9.7k internal nodes with max branching 86. At λ→1 it contracts to ~10.2k internal nodes. At λ=0 it gives a single root, as the cost demands. For numpy size: ~60 internal nodes at λ=0.1 and ~120 at λ=1.

---

## 7. What can run interactively, and whether to precompute λ

| Repo size | Build the λ-independent dendrogram | Per-λ update (slider) | Full search per λ (agglomerate + refine) |
|---|---|---|---|
| numpy (~500) | In browser, <50 ms | Live, ~ms | Live (<100 ms), possible on slider release |
| django (2–3k) | In browser, ~0.2 s | Live, ~10 ms | ~0.3–1 s; run on slider release |
| Linux (60k / 500k) | **Precompute offline** (10–25 s in a worker is possible but poor UX, and memory grows to GBs with naive `Map`s) | Live in a worker, ~0.1–0.2 s with debounce | Not interactive. Precompute at discrete λ if we want it |

Recommendations:

1. **Engine design: dendrogram, then contraction, then optional refinement.**
   - Build a binary dendrogram once. Candidates: SE merge/combine (closest in spirit to our ln k cost), or Paris (reducible, NN-chain, fast). Neither depends on λ.
   - For each λ, run greedy contraction with the Δ formula in §1. Then, if time allows, run a few sweeps of expand/contract/NNI moves under Total Cost(λ).
   - This mirrors HCSE (binary tree → compress) and SEAT (merge → binary combine → DP contract).
2. **Precomputing trees at discrete λ is not needed** for numpy, django or Linux if we accept "best coarsening of one dendrogram". For Linux-size Example Repos, ship the precomputed dendrogram (≈2n integers) in or next to the Graph File and contract live. Precomputing discrete-λ trees is only worth it if a λ-specific *full* search turns out to beat contraction noticeably. That's a quality question for a prototype ticket.
3. **Infomap** is a baseline or seed only. Note the GPL-3.0 license and the ~5 MB bundle.
4. **Open risks / follow-ups.**
   - Measure how much worse dendrogram contraction is than a per-λ full search, on numpy and django where both are cheap.
   - Settle the "which path nodes count" question in GLOSSARY.md, because it changes c_t.
   - The dendrogram builder needs a typed-array/CSR rewrite before it can run at Linux size in the browser. The prototype's `Map`-of-`Map`s needed >2 GB heap at 60k nodes in one variant.
   - **Exact contraction by DP.** Structural decomposition suggests that, for a *fixed* dendrogram and a cap K on branching, the optimal contraction is a tree DP over (node, frontier size). Our ln k·(λc + 1−λ) term couples k with c, so a direct DP costs about O(n·K³). That is feasible for numpy and django but not obviously for Linux. This is my own derivation and is unverified. SEAT's `_contract_tree_dp` is the closest precedent.

## Sources

- Li, A. & Pan, Y. (2016). Structural Information and Dynamical Complexity of Networks. IEEE Trans. Inf. Theory 62(6). doi:10.1109/TIT.2016.2555904
- Pan, Y., Zheng, F., Fan, B. An Information-theoretic Perspective of Hierarchical Clustering (on Graphs). arXiv:2108.06036; UAI 2025, https://proceedings.mlr.press/v286/pan25a.html
- Li, A. et al. (2018). deDoc, Nat. Commun. 9:3265. Code: https://github.com/yinxc/structural-information-minimisation ; deDoc2: https://github.com/zengguangjie/deDoc2
- Yang, R., Peng, H., Liu, C., Li, A. Incremental Measurement of Structural Entropy for Dynamic Graphs. Artificial Intelligence 334 (2024); arXiv:2207.12653
- SE-GSL (operator restatement): https://arxiv.org/abs/2303.09778 ; SeSE (complexity attribution): https://arxiv.org/abs/2511.16275
- SEAT: https://github.com/deepomicslab/seat (`src/SEAT.py`); selib: https://github.com/SuuTTT/selib
- Rosvall, M. & Bergstrom, C. T. (2011). Multilevel compression of random walks… PLoS ONE 6(4):e18209; arXiv:1010.0431
- Infomap source: https://github.com/mapequation/infomap (`src/core/InfomapBase.cpp`, `mk/js.mk`); npm `@mapequation/infomap` 2.16.0 (README, `package.json`)
- Dasgupta, S. (2016). A cost function for similarity-based hierarchical clustering. STOC; arXiv:1510.05043
- Cohen-Addad, Kanade, Mallmann-Trenn, Mathieu. Hierarchical Clustering: Objective Functions and Algorithms. SODA 2018 / JACM 2019; arXiv:1704.02147
- Bonald, Charpentier, Galland, Hollocou (2018). Hierarchical Graph Clustering using Node Pair Sampling. arXiv:1806.01664; scikit-network `sknetwork/hierarchy/paris.pyx`, `metrics.py`
- Traag, Waltman, van Eck (2019). From Louvain to Leiden. Sci. Rep. 9:5233; arXiv:1810.08473
- npm registry (versions/licenses checked 2026-11-07): `@mapequation/infomap`, `graphology-communities-louvain`, `ngraph.leiden`, `leiden-ts`, `ml-hclust`, `hierarchical-clustering`
