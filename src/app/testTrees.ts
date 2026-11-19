import { commonFolder, isGroup, type OptimalGroup } from '../core/tree.ts'
import { folderCounts } from './folders.ts'
import type { LayoutContext, TreeNode } from './icicle.ts'

// A small tree: groups are [id, ...children], files are paths.
export type Spec = string | [number, ...Spec[]]
function build(spec: Spec, paths: string[]): TreeNode {
  if (typeof spec === 'string') {
    paths.push(spec)
    return { file: spec, index: paths.length - 1 }
  }
  const [id, ...children] = spec
  return { id, children: children.map((c) => build(c, paths)) }
}
const allFiles = (t: TreeNode): string[] => (isGroup(t) ? t.children.flatMap(allFiles) : [t.file])

/** Builds a tree from `spec`, with a layout context that labels groups `G<id>` and the root `All`. */
export function setup(spec: Spec, extraPaths: string[] = []) {
  const paths: string[] = []
  const root = build(spec, paths) as OptimalGroup
  const ctx: LayoutContext = {
    label: (g, parent) => (parent ? `G${g.id}` : 'All'),
    folder: (g) => commonFolder(allFiles(g)),
    counts: folderCounts([...paths, ...extraPaths]),
  }
  return { root, ctx }
}

/** `n` file paths in folder `prefix`, sorted. */
export const files = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}/f${String(i).padStart(3, '0')}.py`)
