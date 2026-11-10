import type { GraphFile } from '../core/graphFile.ts'
import type { OptimalGroup } from '../core/sweep.ts'
import { isGroup, membersOf, type Block, type Item, type TreeNode } from './icicle.ts'

/** Each file's imports and importers, by file index (the Graph File's node order). */
export interface Adjacency {
  out: number[][]
  in: number[][]
}

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

const groupFiles = new WeakMap<OptimalGroup, number[]>()
const nodeFiles = (t: TreeNode): number[] => {
  if (!isGroup(t)) return [t.index]
  let files = groupFiles.get(t)
  if (!files) groupFiles.set(t, (files = t.children.flatMap(nodeFiles)))
  return files
}

/** The file indices an item stands for, cached per group. */
export function filesOf(item: Item): number[] {
  switch (item.kind) {
    case 'group':
      return nodeFiles(item.node)
    case 'file':
      return [item.node.index]
    default:
      return membersOf(item).flatMap(nodeFiles)
  }
}

/**
 * `other`: an import between two blocks; `out`: one the selection makes;
 * `in`: one made into the selection.
 */
export type LineKind = 'other' | 'out' | 'in'

/** One drawn line: every import of one kind between two blocks (indices into the layout). */
export interface ImportLine {
  kind: LineKind
  a: number
  /** Null: the other end is outside the current zoom, drawn as a stub up to the top. */
  b: number | null
  count: number
  /** The row of the two blocks' lowest common ancestor, which the line rises to; null for a stub. */
  apexRow: number | null
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

/**
 * The import lines of a laid-out icicle. Each file belongs to the deepest block
 * that holds it; imports inside one block draw nothing, and imports with one end
 * outside the zoom become stubs. With a selection, its imports start at the block
 * that stands for it (itself, or the deepest block holding all its files).
 */
export function importLines(blocks: Block[], adj: Adjacency, selection: Item | null): ImportLine[] {
  const owner = new Int32Array(adj.out.length).fill(-1)
  // Blocks come parent first, so deeper blocks overwrite their ancestors.
  blocks.forEach((b, i) => {
    for (const f of filesOf(b.item)) owner[f] = i
  })

  const lca = (a: number, b: number) => {
    while (a !== b) {
      if (blocks[a].row >= blocks[b].row) a = blocks[a].parent!
      else b = blocks[b].parent!
    }
    return a
  }

  let anchor: number | null = null
  let selected: Set<number> | null = null
  if (selection) {
    const files = filesOf(selection)
    const at = blocks.findIndex((b) => b.item.key === selection.key)
    if (at >= 0) anchor = at
    else if (files.every((f) => owner[f] >= 0)) anchor = files.reduce((x, f) => lca(x, owner[f]), owner[files[0]])
    if (anchor !== null) selected = new Set(files)
  }

  const lines = new Map<string, ImportLine>()
  const add = (kind: LineKind, a: number, b: number) => {
    if (a === b || (a < 0 && b < 0)) return
    // A stub keeps its drawn end in `a`; other lines are unordered.
    const [p, q] = b < 0 ? [a, null] : a < 0 ? [b, null] : kind === 'other' && b < a ? [b, a] : [a, b]
    const key = `${kind} ${p} ${q}`
    const line = lines.get(key)
    if (line) line.count++
    else lines.set(key, { kind, a: p, b: q, count: 1, apexRow: q === null ? null : blocks[lca(p, q)].row })
  }

  for (let u = 0; u < adj.out.length; u++) {
    for (const v of adj.out[u]) {
      const inU = selected?.has(u) ?? false
      const inV = selected?.has(v) ?? false
      if (inU !== inV) add(inU ? 'out' : 'in', anchor!, inU ? owner[v] : owner[u])
      else add('other', owner[u], owner[v])
    }
  }
  return [...lines.values()]
}
