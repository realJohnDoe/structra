import type { GraphFile } from './graphFile.ts'

/** Each file's imports and importers, by file index (the Graph File's node order). */
export interface Adjacency {
  out: number[][]
  in: number[][]
}

/** Reads each file's imports and importers off a Graph File's edges. */
export function adjacency(graph: Pick<GraphFile, 'nodes' | 'edges'>): Adjacency {
  const index = new Map(graph.nodes.map((p, i) => [p, i]))
  const out: number[][] = graph.nodes.map(() => [])
  const inn: number[][] = graph.nodes.map(() => [])
  for (const [src, dst] of graph.edges) {
    const a = index.get(src)!
    const b = index.get(dst)!
    out[a].push(b)
    inn[b].push(a)
  }
  return { out, in: inn }
}

/** Imports within, out of and into a set of files. */
export function importCounts(files: number[], adj: Adjacency) {
  const inside = new Set(files)
  let within = 0
  let out = 0
  let inn = 0
  for (const f of files) {
    for (const t of adj.out[f]) {
      if (inside.has(t)) within++
      else out++
    }
    for (const s of adj.in[f]) if (!inside.has(s)) inn++
  }
  return { within, out, in: inn }
}
