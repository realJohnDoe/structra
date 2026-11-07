# Tree cost objectives: is there a canonical one?

Research for issue #3 ("Canonical tree description-length objectives").

**Question.** Is there a canonical information-theoretic cost for how well a hierarchy **Tree** fits a **Dependency Graph** that Structra should adopt or compare to? Current proposal (see `GLOSSARY.md`):

```
Total Cost = λ · Σ_edges Σ_{crossed internal nodes x} ln k(x)  +  (1−λ) · Σ_{internal nodes x} ln k(x)
```

**Short answer.** No single objective is canonical. Two serious information-theoretic objectives exist (structural entropy and the hierarchical map equation), and one standard combinatorial one (Dasgupta). Structra's edge term turns out to be a uniform-code version of one of them, depending on which path nodes count:

* **Descent-only** (LCA down to the target) with code length −log(1/k) is **structural entropy** with uniform branch probabilities instead of volume-proportional ones.
* **Both sides** (up from the source to below the LCA, then down from the LCA to the target) with code length ln k is the **hierarchical map equation** with every codebook replaced by a uniform code over the node's children, and edges counted by multiplicity instead of random-walk flow.

Recommendation (details in the last section): keep the two-term form, settle the open question in favour of **both sides**, normalise the edge term per edge, and use the hierarchical map equation as the reference comparison. Don't adopt Dasgupta, and don't adopt unbounded structural entropy: both are optimised by binary trees.

---

## Sources and how far they were checked

The session's network blocked arxiv.org, ar5iv, PMC, plos.org and mapequation.org, so the original PDFs could not be opened. What was used instead:

| Objective | Source actually read | Status |
|---|---|---|
| Structural entropy | Su, Peng, Pan & Li, *Structural Information Principles…* survey, IJCAI 2025 ([preprint PDF](https://ijcai-preprints.s3.us-west-1.amazonaws.com/2025/4603.pdf)), Defs 2.1–2.3. Two of its authors wrote the original paper, which it cites as A. Li & Y. Pan, "Structural information and dynamical complexity of networks", *IEEE Trans. Inf. Theory* 62(6):3290–3339, 2016 ([record](https://research.buaa.edu.cn/en/publications/structural-information-and-dynamical-complexity-of-networks/)). | Formula taken from the survey by the same authors, not from the 2016 paper. The degeneracy result below is my own derivation, checked numerically. |
| Hierarchical map equation | Infomap reference implementation by the map-equation group, `github.com/mapequation/infomap` @ `39e7876b` (2026-11-01): `src/core/MapEquation.h` (`calcCodelengthOnModuleOfLeafNodes`, `calcCodelengthOnModuleOfModules`), `src/core/InfomapBase.cpp` (`calcCodelengthOnTree`), `src/io/ParameterCatalog.cpp` (`--markov-time`), `src/io/Config.h`. Paper: M. Rosvall & C. T. Bergstrom, "Multilevel compression of random walks on networks reveals hierarchical organization in large integrated systems", *PLoS ONE* 6(4):e18209, 2011, [arXiv:1010.0431](https://arxiv.org/abs/1010.0431). | Formula taken from the code, not the paper text. |
| Dasgupta | S. Dasgupta, "A cost function for similarity-based hierarchical clustering", STOC 2016, [arXiv:1510.05043](https://arxiv.org/abs/1510.05043). Definition confirmed from search-indexed abstract and summary text. | The clique result ("every binary tree costs (n³−n)/3") is recalled from the paper; the computation below reproduces it exactly (168 for K₈). |

Rerun with arxiv.org allowed if the exact wording and equation numbers matter.

---

## The four objectives

Notation: G = (V, E), m = |E|, d(v) = degree, vol(S) = Σ_{v∈S} d(v), vol(G) = 2m, cut(S) = number of edges with exactly one end in S. For an internal tree node x: k(x) = number of children, T_x = leaves under x, x⁻ = parent of x. For an edge (u, v), the LCA is the lowest node containing both ends.

### 1. Structural entropy (Li & Pan 2016)

Formula from the survey's Def. 2.2, written for an undirected graph. Here p_α = cut(T_α)/vol(G) is the stationary random-walk flow into T_α:

```
H^T(G) = − Σ_{α ∈ T, α ≠ root}  (g_α / vol(G)) · log₂( vol(T_α) / vol(T_{α⁻}) ),     g_α = cut(T_α)
H(G)   = min_T H^T(G)
```

Leaves are included in the sum (g = d(v), vol = d(v)). For a depth-1 (flat) tree, H^T is the Shannon entropy of the stationary distribution d(v)/2m (survey, "1D SE").

* **Path nodes counted.** Rewrite the sum per random-walk step u→v. The step pays −log(vol(α)/vol(α⁻)) for every α that contains v but not u, that is, every node on the **descent from the LCA to v** (excluding the LCA itself). This is a code for "which child next" with probability proportional to volume. The ascent from u costs nothing.
* **Edge weighting.** Edges are weighted through the random walk. The 2016 paper is for (weighted) undirected graphs. The survey generalises to any non-negative irreducible matrix with stationary distribution π, which covers directed graphs. Multiplicity counts as weight.
* **Degeneracy.** It degenerates to binary trees. Insert a node β under α that groups some of α's children C. Each c ∈ C saves g_c·log(vol(α)/vol(β)), and β pays g_β·log(vol(α)/vol(β)). The net change is (g_β − Σ_{c∈C} g_c)·log(vol(α)/vol(β)) ≤ 0, because cut(∪C) ≤ Σ cut(c). Refining never hurts, and it strictly helps whenever the grouped children share an edge. So the unconstrained optimum is always (weakly) binary, even for a clique (see the K₈ result below). This is why the literature fixes the tree height: "K-dimensional structural entropy" minimises over trees of height ≤ K. The survey says "the dimension … is characterized by the depth of the encoding tree"; a later paper ([arXiv:2410.06621](https://arxiv.org/pdf/2410.06621)) uses h_T ≤ K.
* **Trade-off parameter.** None. The only knob is the height cap K, which is discrete and not equivalent to λ.

### 2. Hierarchical map equation / Infomap (Rosvall & Bergstrom 2011)

Description length of a random walker that uses one codebook per tree node. From the Infomap source, with plogp(x) = x·log₂x:

```
L(T) = Σ_{internal nodes x}  L_x
L_x  = plogp(U_x) − plogp(q_x) − Σ_{children c} plogp(u_c),   U_x = q_x + Σ_c u_c
```

* q_x is the exit flow of module x (0 at the root).
* u_c is the use rate of child c's codeword: the visit rate p_v if c is a leaf, or the enter flow of c if c is a module.

So L_x = U_x·H(q_x/U_x, u_c/U_x, …): each node's codebook holds one codeword per child plus an "exit" codeword, weighted by how often the walker uses it. At depth 2 this reduces to the original two-level map equation, L = q↷H(Q) + Σ_i p↻^i H(P^i). In Infomap's tree, a module's children are either all leaves or all modules; a lone leaf beside modules becomes a singleton module.

* **Path nodes counted.** **Both sides.** A step u→v emits:
  * an exit codeword at every module from u's parent up to the child of the LCA,
  * an enter codeword at the LCA and at every module down to v's parent,
  * v's codeword in its leaf module.

  So it covers exactly the internal nodes on the tree path from u to v. A step between siblings costs one codeword at their parent.
* **Edge weighting.** By stationary flow. Undirected flow is the default (`FlowModel::undirected` in `Config.h`). Directed graphs use PageRank flow with teleportation probability 0.15 (`teleportationProbability = 0.15`). Weights and multiplicities enter as link weights.
* **Degeneracy.** It regularises itself. Every extra level adds exit codewords and splits codebooks, so the optimum can be flat (K₈ below), two-level, or deeper. Rosvall & Bergstrom report shallow hierarchies for globally connected systems and deep ones for road networks (abstract).
* **Trade-off parameter.** It has no explicit λ, but `--markov-time t` (default 1) "scale[s] link flow to change the cost of moving between modules. Higher values result in fewer modules." It plays the same role as λ in direction (high t ≈ low λ ≈ flatter), but it is not equivalent: it rescales crossing flows inside one code rather than weighting a separate model-cost term. A Bayesian-prior regulariser (`--regularized`) also exists.

### 3. Dasgupta (2016)

```
cost_G(T) = Σ_{(i,j) ∈ E}  w_ij · |leaves(T[i ∨ j])|
```

T[i∨j] is the subtree rooted at the LCA of i and j.

* **Path nodes counted.** Only the LCA. The penalty is the LCA's subtree size (linear in leaves, not logarithmic), not the path. It is combinatorial, not information-theoretic.
* **Edge weighting.** Symmetric similarity weights w_ij ≥ 0. It is undirected, and multiplicity counts as weight.
* **Degeneracy.** It degenerates to binary trees. Splitting a k-ary node can only shrink some LCAs' leaf sets, so some optimal tree is binary and the flat tree is never better than its binary refinements. On a clique, every binary tree ties at (n³−n)/3, so it cannot tell "no structure" from structure.
* **Trade-off parameter.** None. It is NP-hard to optimise, and the paper gives a top-down sparsest-cut approximation.

### 4. Structra proposal

```
C_λ(T) = λ · Σ_{(u,v)∈E} Σ_{x ∈ P(u,v)} ln k(x)  +  (1−λ) · Σ_{internal x} ln k(x)
```

* **Path nodes counted.** Two candidates:
  * **Both sides**: P = all internal nodes on the tree path u…LCA…v. This is the uniform-code analogue of the map equation.
  * **Descent**: P = LCA and the nodes on the way down to v. This is the uniform-code analogue of structural entropy. For undirected edges use the average of both directions.
* **Edge weighting.** One per edge (multiplicity if kept). Direction matters only in the descent variant.
* **Degeneracy.**
  * The node term alone always picks flat, because Σ ln k = ln Π k ≥ ln n.
  * The edge term alone, with **both sides**, does not degenerate: it picks flat for K₈ and recovers the cliques for 2K₄.
  * The edge term alone, with **descent**, behaves like structural entropy: it prefers deep trees even on a clique (K₈ result below). With *directed* descent it gets worse: a node that is only a source never pays, so the optimum is a caterpillar ordered roughly topologically.
* **Trade-off parameter.** λ, explicitly. The node term is a "model cost" in the MDL sense. Neither the map equation nor structural entropy has one; the map equation instead pays implicitly through exit codewords.

---

## Worked example

Graph **2K₄**: cliques A = {0,1,2,3} and B = {4,5,6,7}, plus one bridge 0–4 (m = 13). Control graph **K₈** (m = 28, no structure).

All costs were computed exactly. Optima were found by exhaustive search over all 660,032 Trees on 8 leaves without single-child nodes, using subset DP (every objective is a sum of per-node terms). Units: ln for Structra, bits for structural entropy and the map equation, leaf counts for Dasgupta. Lower is better.

### Costs of fixed trees on 2K₄

| Tree | Node Σln k | Edge (both) | Edge (descent) | Structural entropy | Map equation | Dasgupta |
|---|---|---|---|---|---|---|
| flat `(0…7)` | **2.079** | 27.03 | 27.03 | 2.988 | 2.988 | 104 |
| two-level `((0123)(4567))` | 3.466 | **20.10** | 18.71 | 2.065 | **2.464** | 56 |
| balanced binary `(((01)(23))((45)(67)))` | 4.852 | 22.87 | **15.94** | **1.756** | 3.767 | **48** |
| wrong two-level `((0145)(2367))` | 3.466 | 34.66 | 23.57 | 2.610 | 4.154 | 84 |

The bold entries are the best of these four rows only. The table below gives the true optimum over all trees.

### Unconstrained optima

| Objective | 2K₄ optimum | K₈ optimum |
|---|---|---|
| Structural entropy | `((0(1(23)))(4(5(67))))` binary, 1.730 | balanced **binary**, 2.429 (< flat 3.0) |
| Map equation (t = 1) | **two-level** `((0123)(4567))`, 2.464 | **flat**, 3.0 |
| Dasgupta | binary (ties), 48 | any binary tree (all tie at 168 = (8³−8)/3) |
| Structra edge only, both sides (λ = 1) | `((0(123))(4(567)))`, 19.42 | **flat**, 58.2 |
| Structra edge only, descent (λ = 1) | binary `((0(1(23)))(4(5(67))))`, 14.56 | deep `(0(1((23)((45)(67)))))`, 44.0 (< flat 58.2) |

### Sweeping the trade-off parameters on 2K₄

**Structra, both sides:**

| λ | Optimum |
|---|---|
| ≤ 0.1 | flat |
| 0.2–0.3 | `(0 1 2 3 (4567))`, a mixed root |
| 0.4–0.5 | two-level |
| ≥ 0.6 | two-level with the bridge endpoints lifted out: `((0(123))(4(567)))` |

Pairwise crossovers among the three named trees: two-level beats flat for λ > 1/6. Balanced binary never beats two-level (it is worse on both terms), and beats flat only for λ > 0.4.

**Structra, descent:**

| λ | Optimum |
|---|---|
| ≤ 0.1 | flat |
| 0.3 | `((0(123))(4(567)))` |
| ≥ 0.4 | binary |

**Map equation, Markov time t:**

| t | Optimum |
|---|---|
| 0.25 | deep / mixed |
| 0.5–2 | two-level |
| ≥ 4 | flat |

### What the example shows

1. **Structural entropy and Dasgupta prefer binary trees even on K₈**, a graph with no structure. They are unusable for Structra without a height cap or a node penalty.
2. **The map equation is the only parameter-free objective that gets both graphs right**: two cliques for 2K₄, flat for K₈.
3. **Structra with both sides behaves like the map equation.** At λ = 1 it picks flat for K₈ and recovers the cliques for 2K₄. With λ it also offers a continuous flat-to-structured dial, which is what the **Balance** slider needs. The descent variant inherits structural entropy's bias toward binary trees.
4. Structra both-sides at λ = 1 lifts the bridge endpoints out of their cliques, because the bridge then crosses fewer high-k nodes. The map equation does not do this: its codes are frequency-weighted and its exit costs are paid per step, so one bridge edge barely moves it. This is the practical difference between uniform ln k codes and Shannon codes.

---

## Recommendation

1. **Don't replace the proposal. Settle its open point: count both sides.** Edge Cost = Σ ln k over every internal node on the tree path u…LCA…v. This is exactly the set of codebooks the hierarchical map equation uses for a step u→v, so the proposal reads as "map equation with uniform codebooks, plus an explicit model-cost term". The descent-only variant inherits structural entropy's bias toward binary trees and ignores direction-sensitivity problems such as free source nodes. Update `GLOSSARY.md` → **Edge Cost** accordingly.
2. **Normalise the edge term per edge** (divide by m, or use edge weights summing to 1, as the map equation and structural entropy do). Then λ means the same thing for a 30-file repo and a 3,000-file repo. Unnormalised, the edge sum grows with m while the node term grows with about n, so the λ that gives a useful tree drifts with repo size.
3. **Use the hierarchical map equation as the reference comparison** (it is the closest thing to canonical for "multilevel tree fit to a graph"). Possibly offer it later as a λ-free "Infomap" preset, using undirected or PageRank flow and treating Markov time as the closest analogue of Balance. Infomap is available as a library (`pip install infomap`), so an Optimal Tree can be checked against Infomap's tree on the **Example Repos**.
4. **Don't adopt Dasgupta or unbounded structural entropy.** Both are optimised by binary trees, have no trade-off parameter, and (Dasgupta) are not information-theoretic. Structural entropy is only usable with a fixed height K, which conflicts with letting the Balance choose the depth.
5. **Optional refinement, if the ln k codes prove too crude.** Weight each branch by its share of edges or volume (−log(vol(child)/vol(parent))) instead of uniform 1/k. That moves the edge term toward structural entropy or the map equation while keeping the node term as the regulariser.

---

<details>
<summary>Reproduction script (Python 3, no dependencies; ~20 s)</summary>

```python
import math, itertools, functools
from collections import defaultdict

def plogp(x): return x*math.log2(x) if x > 0 else 0.0

def two_k4():
    A, B = [0,1,2,3], [4,5,6,7]
    return 8, [(i,j) for X in (A,B) for i,j in itertools.combinations(X,2)] + [(0,4)]
def k8(): return 8, list(itertools.combinations(range(8),2))

class G:
    def __init__(s, n, E, markov=1.0):
        s.n, s.E, s.markov = n, E, markov
        s.deg = [0]*n
        for u,v in E: s.deg[u] += 1; s.deg[v] += 1
        s.vol = 2*len(E)
    def volS(s,S): return sum(s.deg[i] for i in S)
    def cut(s,S):  return sum(1 for u,v in s.E if (u in S) != (v in S))

def node_terms(g, S, ch, is_root):
    """Per-internal-node contribution of every objective; node S with children ch."""
    k = len(ch); lnk = math.log(k); t = {"node": lnk}
    child = lambda x: next(c for c in ch if x in c)
    both = desc = lca = 0.0
    for u,v in g.E:
        iu, iv = u in S, v in S
        if iu and iv and child(u) != child(v): both += 1; desc += 1; lca += 1   # S is the LCA
        elif iu != iv: both += 1; desc += 0.5   # on one side; descent averaged over directions
    t["edge_both"], t["edge_desc"], t["dasgupta"] = both*lnk, desc*lnk, len(S)*lca
    VS = g.volS(S)   # structural entropy: terms of S's children
    t["se"] = sum(-(g.cut(c)/g.vol)*math.log2(g.volS(c)/VS) for c in ch)
    # hierarchical map equation (Infomap MapEquation.h), undirected flow, Markov time
    uses = [0.0 if is_root else g.markov*g.cut(S)/g.vol]
    mixed = any(len(c)==1 for c in ch) and any(len(c)>1 for c in ch)
    extra = 0.0
    for c in ch:
        if len(c)==1 and not mixed: uses.append(g.deg[next(iter(c))]/g.vol)
        else:
            q = g.markov*g.cut(c)/g.vol; uses.append(q)
            if len(c)==1:   # singleton module gets its own {exit, node} codebook
                p = g.deg[next(iter(c))]/g.vol; extra += plogp(q+p)-plogp(q)-plogp(p)
    t["mapeq"] = plogp(sum(uses)) - sum(plogp(x) for x in uses) + extra
    return t

def leaves(t): return [t] if isinstance(t,int) else [x for c in t for x in leaves(c)]
def tree_cost(g, tree, is_root=True):
    out = defaultdict(float)
    if isinstance(tree,int): return out
    for k,v in node_terms(g, frozenset(leaves(tree)), [frozenset(leaves(c)) for c in tree], is_root).items(): out[k] += v
    for c in tree:
        for k,v in tree_cost(g, c, False).items(): out[k] += v
    return out

def set_partitions(lst):
    if len(lst)==1: yield [lst]; return
    for p in set_partitions(lst[1:]):
        for i in range(len(p)): yield p[:i]+[[lst[0]]+p[i]]+p[i+1:]
        yield [[lst[0]]]+p

def optimize(g, score):
    @functools.lru_cache(None)
    def best(S, is_root):
        if len(S)==1: return 0.0, next(iter(S))
        bestv = None
        for p in set_partitions(sorted(S)):
            if len(p) < 2: continue
            ch = [frozenset(b) for b in p]
            v = score(node_terms(g, S, ch, is_root)); subs = []
            for c in ch:
                cv, ct = best(c, False); v += cv; subs.append(ct)
            if bestv is None or v < bestv[0]-1e-12: bestv = (v, tuple(subs))
        return bestv
    return best(frozenset(range(g.n)), True)

g = G(*two_k4())
print(dict(tree_cost(g, ((0,1,2,3),(4,5,6,7)))))
for lam in [0.1*i for i in range(11)]:
    print(lam, optimize(g, lambda d: lam*d["edge_both"] + (1-lam)*d["node"]))
```

</details>
