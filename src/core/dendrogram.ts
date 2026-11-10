import type { GraphFile } from './graphFile.ts'

/**
 * A binary dendrogram over the files of a Graph File. Leaves are the file indices
 * 0..n−1 (in Graph File order); internal node n+i merges `merges[i]`, so a node's
 * children always come before it. The root is the last node, 2n−2, when n ≥ 2.
 * Each merge lists the child holding the first file first.
 */
export interface Dendrogram {
  n: number
  merges: [number, number][]
}

export const rootOf = (d: Dendrogram) => (d.n < 2 ? -1 : 2 * d.n - 2)

/**
 * Degree-weighted Paris linkage (ADR 0002): repeatedly merge the pair of clusters
 * with the highest w(a,b) / (vol(a)·vol(b)), where w counts import edges between
 * them and vol counts import edge ends inside a cluster. Then merge the
 * disconnected parts smallest first. Ties break by the clusters' first files.
 */
export function buildDendrogram(graph: Pick<GraphFile, 'nodes' | 'edges'>): Dendrogram {
  const n = graph.nodes.length
  const index = new Map(graph.nodes.map((p, i) => [p, i]))
  const size: number[] = []
  const vol: number[] = []
  const first: number[] = [] // the cluster's lowest file index, i.e. its first file
  const adj: Map<number, number>[] = []
  const alive = new Set<number>()
  for (let i = 0; i < n; i++) {
    size.push(1)
    vol.push(0)
    first.push(i)
    adj.push(new Map())
    alive.add(i)
  }
  for (const [src, dst] of graph.edges) {
    const a = index.get(src)!
    const b = index.get(dst)!
    if (a === b) continue
    adj[a].set(b, (adj[a].get(b) ?? 0) + 1)
    adj[b].set(a, (adj[b].get(a) ?? 0) + 1)
    vol[a]++
    vol[b]++
  }

  const merges: [number, number][] = []
  const merge = (x: number, y: number) => {
    const [a, b] = first[x] < first[y] ? [x, y] : [y, x]
    const c = n + merges.length
    merges.push([a, b])
    size.push(size[a] + size[b])
    vol.push(vol[a] + vol[b])
    first.push(first[a])
    const m = new Map<number, number>()
    for (const src of [a, b]) {
      for (const [k, w] of adj[src]) {
        if (k === a || k === b) continue
        m.set(k, (m.get(k) ?? 0) + w)
        adj[k].delete(src)
      }
    }
    for (const [k, w] of m) adj[k].set(c, w)
    adj.push(m)
    adj[a] = new Map()
    adj[b] = new Map()
    alive.delete(a)
    alive.delete(b)
    alive.add(c)
  }

  // Connected parts. A full scan per merge is O(E); fine for v1's repo sizes.
  for (;;) {
    let best = -1
    let ba = -1
    let bb = -1
    for (const a of alive) {
      for (const [b, w] of adj[a]) {
        if (first[b] < first[a]) continue
        const s = w / (vol[a] * vol[b])
        if (s > best || (s === best && (first[a] < first[ba] || (first[a] === first[ba] && first[b] < first[bb])))) {
          best = s
          ba = a
          bb = b
        }
      }
    }
    if (ba < 0) break
    merge(ba, bb)
  }

  // Disconnected parts, including import-less files: smallest first.
  const bySizeThenFirst = (x: number, y: number) => size[x] - size[y] || first[x] - first[y]
  while (alive.size > 1) {
    const [a, b] = [...alive].sort(bySizeThenFirst)
    merge(a, b)
  }
  return { n, merges }
}
