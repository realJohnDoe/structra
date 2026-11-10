import { buildDendrogram, type Dendrogram } from './dendrogram.ts'
import { serializeGraphFile, type GraphFile } from './graphFile.ts'
import { sweep, type OptimalFile, type OptimalGroup } from './sweep.ts'

/** λ runs from 0.00 to 1.00 in 101 steps; step s is λ = s / 100. */
export const STEPS = 101

/**
 * Everything the app needs to draw a Graph File's Optimal Trees at every λ step:
 * the dendrogram and, per internal node, its birth step (null: never survives).
 */
export interface DendrogramArtifact {
  /** `sha256:<hex>` of the Graph File's canonical serialization. */
  graph: string
  dendrogram: Dendrogram
  birth: (number | null)[]
}

export async function hashGraphFile(graph: GraphFile): Promise<string> {
  const bytes = new TextEncoder().encode(serializeGraphFile(graph))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return `sha256:${Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

/** Builds the dendrogram and runs the sweep. Deterministic: no randomness, stable tie-breaks. */
export async function buildArtifact(graph: GraphFile): Promise<DendrogramArtifact> {
  const dendrogram = buildDendrogram(graph)
  return { graph: await hashGraphFile(graph), dendrogram, birth: sweep(dendrogram, graph, STEPS) }
}

/**
 * Writes the artifact in its one canonical byte form: LF, trailing newline, one
 * merge per line as `[child, child, birth step]`. Internal node n+i is merge i.
 */
export function serializeArtifact(a: DendrogramArtifact): string {
  const merges = a.dendrogram.merges.map(([x, y], i) => `    [${x}, ${y}, ${a.birth[i] === null ? 'null' : a.birth[i]}]`)
  return [
    '{',
    `  "graph": ${JSON.stringify(a.graph)},`,
    `  "files": ${a.dendrogram.n},`,
    `  "merges": ${merges.length ? `[\n${merges.join(',\n')}\n  ]` : '[]'}`,
    '}',
    '',
  ].join('\n')
}

export function parseArtifact(text: string): DendrogramArtifact {
  const json = JSON.parse(text) as { graph: string; files: number; merges: [number, number, number | null][] }
  return {
    graph: json.graph,
    dendrogram: { n: json.files, merges: json.merges.map(([x, y]) => [x, y]) },
    birth: json.merges.map(([, , b]) => b),
  }
}

/**
 * The Optimal Tree at a λ step, read off the birth steps: a node is a group at
 * step s if it was born at or before s. Single-child groups are collapsed.
 * The root's id is 2n−2 (n ≥ 2), or n for a graph with fewer than two files.
 */
export function treeAt(artifact: DendrogramArtifact, graph: Pick<GraphFile, 'nodes'>, step: number): OptimalGroup {
  const { n, merges } = artifact.dendrogram
  const file = (i: number): OptimalFile => ({ file: graph.nodes[i], index: i })
  if (n < 2) return { id: n, children: graph.nodes.map((_, i) => file(i)) }
  const alive = (x: number) => x < n || (artifact.birth[x - n] ?? Infinity) <= step
  const build = (x: number): OptimalGroup | OptimalFile => {
    if (x < n) return file(x)
    const children: (OptimalGroup | OptimalFile)[] = []
    const stack = [...merges[x - n]].reverse()
    while (stack.length) {
      const y = stack.pop()!
      if (alive(y)) children.push(build(y))
      else stack.push(merges[y - n][1], merges[y - n][0])
    }
    return children.length === 1 ? children[0] : { id: x, children }
  }
  const root = build(2 * n - 2) as OptimalGroup
  return root
}
