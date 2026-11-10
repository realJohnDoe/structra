import type { GraphFile } from './graphFile.ts'
import { isGroup, type Tree, type TreeGroup } from './tree.ts'

export interface Score {
  /** λ · edgeTerm + (1 − λ) · nodeTerm, in nats. */
  total: number
  /** Average Edge Cost per dependency, before λ weighting; 0 when there are no edges. */
  edgeTerm: number
  /** Node Cost per file, before λ weighting. */
  nodeTerm: number
}

/**
 * The reference Total Cost of a Tree (ADR 0001). Every file of the graph must be
 * a leaf of the tree. Single-child nodes are allowed and cost nothing.
 */
export function scoreTree(tree: Tree, graph: Pick<GraphFile, 'nodes' | 'edges'>, lambda: number): Score {
  // Each file's ancestors, root first, as indices into `codes` (ln k per group).
  const codes: number[] = []
  const ancestors = new Map<string, number[]>()
  let nodeSum = 0
  const walk = (t: Tree, path: number[]) => {
    if (!isGroup(t)) {
      ancestors.set(t.file, path)
      return
    }
    const g: TreeGroup = t
    const id = codes.length
    codes.push(Math.log(g.children.length))
    nodeSum += codes[id]
    const below = [...path, id]
    for (const c of g.children) walk(c, below)
  }
  walk(tree, [])

  const pathOf = (file: string) => {
    const p = ancestors.get(file)
    if (!p) throw new Error(`scoreTree: "${file}" is not a leaf of the tree`)
    return p
  }
  for (const file of graph.nodes) pathOf(file)

  let edgeSum = 0
  for (const [u, v] of graph.edges) {
    if (u === v) continue
    const pu = pathOf(u)
    const pv = pathOf(v)
    let lca = 0
    while (lca + 1 < pu.length && lca + 1 < pv.length && pu[lca + 1] === pv[lca + 1]) lca++
    edgeSum += codes[pu[lca]]
    for (let i = lca + 1; i < pu.length; i++) edgeSum += codes[pu[i]]
    for (let i = lca + 1; i < pv.length; i++) edgeSum += codes[pv[i]]
  }

  const edgeTerm = graph.edges.length > 0 ? edgeSum / graph.edges.length : 0
  const nodeTerm = graph.nodes.length > 0 ? nodeSum / graph.nodes.length : 0
  return { total: lambda * edgeTerm + (1 - lambda) * nodeTerm, edgeTerm, nodeTerm }
}
