import { rootOf, type Dendrogram } from './dendrogram.ts'
import type { GraphFile } from './graphFile.ts'
import type { TreeFile, TreeGroup } from './tree.ts'

/** A group of an Optimal Tree: a surviving dendrogram node. */
export interface OptimalGroup extends TreeGroup {
  id: number
  children: (OptimalGroup | OptimalFile)[]
}

export interface OptimalFile extends TreeFile {
  index: number
}

/**
 * A contraction of a dendrogram: the set of internal nodes that survive. The root
 * always survives; every other internal node can be toggled.
 *
 * With X(x) the edges crossing a surviving node x and k(x) its children, the
 * Total Cost (ADR 0001) is Σ_x (α·X(x) + β)·ln k(x), α = λ/|E|, β = (1−λ)/N.
 * Per dendrogram node we keep I (edges inside) and cut (edges with one end
 * inside); then X(x) = cut(x) + I(x) − Σ I(f) over the nodes f just below x.
 */
export class Contraction {
  readonly n: number
  readonly root: number
  private readonly size: number
  private readonly E: number
  private readonly paths: string[]
  private readonly kids: Int32Array
  private readonly par: Int32Array
  private readonly order: number[] // pre-order, root first
  private readonly I: Float64Array
  private readonly cut: Float64Array
  private readonly surv: Uint8Array
  // From refresh(): over the nodes just below x, their count (bk) and Σ I (bs);
  // anc[x] is the nearest survivor strictly above x.
  private readonly bk: Float64Array
  private readonly bs: Float64Array
  private readonly anc: Int32Array
  private stale = true

  constructor(d: Dendrogram, graph: Pick<GraphFile, 'nodes' | 'edges'>) {
    const n = d.n
    this.n = n
    this.size = n === 0 ? 0 : 2 * n - 1
    this.root = n === 0 ? -1 : n === 1 ? 0 : rootOf(d)
    this.paths = graph.nodes
    this.E = graph.edges.length
    const total = this.size
    this.par = new Int32Array(total).fill(-1)
    this.kids = new Int32Array(2 * total).fill(-1)
    d.merges.forEach(([a, b], i) => {
      const x = n + i
      this.kids[2 * x] = a
      this.kids[2 * x + 1] = b
      this.par[a] = x
      this.par[b] = x
    })
    this.order = []
    if (total > 0) {
      const stack = [this.root]
      while (stack.length) {
        const x = stack.pop()!
        this.order.push(x)
        if (x >= n) stack.push(this.kids[2 * x + 1], this.kids[2 * x])
      }
    }
    const depth = new Int32Array(total)
    for (const x of this.order) if (x !== this.root) depth[x] = depth[this.par[x]] + 1
    const deg = new Float64Array(total)
    const lcaCount = new Float64Array(total)
    const index = new Map(graph.nodes.map((p, i) => [p, i]))
    for (const [src, dst] of graph.edges) {
      let a = index.get(src)!
      let b = index.get(dst)!
      if (a === b) continue
      deg[a]++
      deg[b]++
      while (a !== b) {
        if (depth[a] >= depth[b]) a = this.par[a]
        else b = this.par[b]
      }
      lcaCount[a]++
    }
    this.I = new Float64Array(total)
    this.cut = new Float64Array(total)
    for (let i = this.order.length - 1; i >= 0; i--) {
      const x = this.order[i]
      this.I[x] += lcaCount[x]
      if (x !== this.root) {
        this.I[this.par[x]] += this.I[x]
        deg[this.par[x]] += deg[x]
      }
      this.cut[x] = deg[x] - 2 * this.I[x]
    }
    this.surv = new Uint8Array(total)
    if (this.root >= n) this.surv[this.root] = 1
    this.bk = new Float64Array(total)
    this.bs = new Float64Array(total)
    this.anc = new Int32Array(total)
  }

  /** The internal nodes other than the root, in id order. */
  contractible(): number[] {
    const out: number[] = []
    for (let x = this.n; x < this.size; x++) if (x !== this.root) out.push(x)
    return out
  }

  survives(x: number): boolean {
    return this.surv[x] === 1
  }

  /** Splits a contracted node off its parent group, or merges a surviving one into it. */
  toggle(x: number) {
    if (x < this.n || x === this.root) throw new Error(`Contraction: node ${x} can't be toggled`)
    this.surv[x] ^= 1
    this.stale = true
  }

  private refresh() {
    if (!this.stale) return
    this.stale = false
    const { n, order, kids, par, surv, I, bk, bs, anc } = this
    const fk = new Float64Array(this.size)
    const fs = new Float64Array(this.size)
    for (let i = order.length - 1; i >= 0; i--) {
      const x = order[i]
      if (x < n) {
        fk[x] = 1
        continue
      }
      const a = kids[2 * x]
      const b = kids[2 * x + 1]
      bk[x] = fk[a] + fk[b]
      bs[x] = fs[a] + fs[b]
      if (surv[x]) {
        fk[x] = 1
        fs[x] = I[x]
      } else {
        fk[x] = bk[x]
        fs[x] = bs[x]
      }
    }
    for (const x of order) {
      if (x === this.root) anc[x] = -1
      else anc[x] = surv[par[x]] ? par[x] : anc[par[x]]
    }
  }

  /** The closed-form change in Total Cost at λ if `x` were toggled. */
  delta(x: number, lambda: number): number {
    this.refresh()
    const a = this.E ? lambda / this.E : 0
    const b = (1 - lambda) / this.n
    const p = this.anc[x]
    const kp = this.bk[p]
    const Xp = this.cut[p] + this.I[p] - this.bs[p]
    const kx = this.bk[x]
    const Xx = this.cut[x] + this.I[x] - this.bs[x]
    if (this.surv[x]) {
      // Merge x into p: p takes over x's children and the edges whose LCA is x.
      const kp2 = kp + kx - 1
      const Xp2 = Xp + this.I[x] - this.bs[x]
      return a * (Xp2 * Math.log(kp2) - Xp * Math.log(kp) - Xx * Math.log(kx)) + b * (Math.log(kp2) - Math.log(kp) - Math.log(kx))
    }
    // Split x off p: x's would-be children leave p, x joins it.
    const kp2 = kp - kx + 1
    const Xp2 = Xp + this.bs[x] - this.I[x]
    return a * (Xp2 * Math.log(kp2) + Xx * Math.log(kx) - Xp * Math.log(kp)) + b * (Math.log(kp2) + Math.log(kx) - Math.log(kp))
  }

  /** The contracted tree, children in dendrogram order (by first file). */
  tree(): OptimalGroup {
    this.refresh()
    const rootId = this.root < this.n ? this.size : this.root
    const root: OptimalGroup = { id: rootId, children: [] }
    if (this.size === 0) return root
    const groups = new Map<number, OptimalGroup>([[this.root, root]])
    for (const x of this.order) {
      if (x === this.root) continue
      const parent = groups.get(this.anc[x] === -1 ? this.root : this.anc[x])!
      if (x < this.n) parent.children.push({ file: this.paths[x], index: x })
      else if (this.surv[x]) {
        const g: OptimalGroup = { id: x, children: [] }
        groups.set(x, g)
        parent.children.push(g)
      }
    }
    if (this.root < this.n) root.children.push({ file: this.paths[this.root], index: this.root })
    return root
  }
}

/** Moves must improve Total Cost by more than this many nats (ADR 0002). */
export const EPSILON = 1e-9

/**
 * The sweep up λ (ADR 0002): start flat at step 0, and at each step take the
 * most improving split while its Δ < −ε, then carry the result on to the next
 * step. Ties break by the node's first file, then by node id.
 *
 * Returns each internal node's birth step (index i is node n+i): the first step
 * at which it survives, or null if it never does.
 */
export function sweep(d: Dendrogram, graph: Pick<GraphFile, 'nodes' | 'edges'>, steps: number): (number | null)[] {
  const n = d.n
  const birth: (number | null)[] = d.merges.map(() => null)
  if (n < 2) return birth
  birth[birth.length - 1] = 0
  const first: number[] = Array.from({ length: n }, (_, i) => i)
  for (const [a] of d.merges) first.push(first[a])
  const c = new Contraction(d, graph)
  const candidates = c.contractible()
  for (let step = 0; step < steps; step++) {
    const lambda = step / (steps - 1)
    for (;;) {
      let best = -EPSILON
      let bx = -1
      for (const x of candidates) {
        if (c.survives(x)) continue
        const delta = c.delta(x, lambda)
        if (delta < best || (delta === best && first[x] < first[bx])) {
          best = delta
          bx = x
        }
      }
      if (bx < 0) break
      c.toggle(bx)
      birth[bx - n] = step
    }
  }
  return birth
}
