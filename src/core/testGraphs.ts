// Small graphs and trees for tests. Not part of the core's interface.
import fc from 'fast-check'
import { compareCodepoints, type GraphFile } from './graphFile.ts'
import type { Tree } from './tree.ts'

export const meta: GraphFile['meta'] = {
  repo: 'https://example.com/test/test',
  commit: '0'.repeat(40),
  language: 'python',
  parser: { name: 'test' },
}

export function graph(nodes: string[], edges: [string, string][]): GraphFile {
  return { meta, nodes, edges }
}

/** A group in a test tree: strings are files, arrays are groups. */
export type Spec = string | Spec[]
export const tree = (spec: Spec): Tree =>
  typeof spec === 'string' ? { file: spec } : { children: spec.map(tree) }

/** All directed edges between distinct members of each clique. */
export function cliques(...groups: string[][]): [string, string][] {
  return groups.flatMap((g) => g.flatMap((a) => g.filter((b) => b !== a).map((b): [string, string] => [a, b])))
}

/** Random small Graph Files: up to `maxFiles` files in a few folders, random directed edges. */
export const arbitraryGraph = (maxFiles = 14) =>
  fc
    .integer({ min: 0, max: maxFiles })
    .chain((n) =>
      fc.record({
        folders: fc.array(fc.constantFrom('', 'a/', 'a/b/', 'c/'), { minLength: n, maxLength: n }),
        edges: n < 2 ? fc.constant([]) : fc.array(fc.tuple(fc.nat(n - 1), fc.nat(n - 1)), { maxLength: 3 * n }),
      }),
    )
    .map(({ folders, edges }) => {
      const files = folders.map((f, i) => `${f}f${String(i).padStart(2, '0')}.py`)
      const nodes = [...files].sort(compareCodepoints)
      const pairs = new Map<string, [string, string]>()
      for (const [a, b] of edges) if (a !== b) pairs.set(`${files[a]}\n${files[b]}`, [files[a], files[b]])
      const sorted = [...pairs.values()].sort((x, y) => compareCodepoints(x[0], y[0]) || compareCodepoints(x[1], y[1]))
      return graph(nodes, sorted)
    })
