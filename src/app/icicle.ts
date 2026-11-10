import { fileLabel, type GroupStatsCache } from '../core/groupStats.ts'
import type { OptimalFile, OptimalGroup } from '../core/sweep.ts'

export const ROWS = 4
export const ROW_HEIGHT = 46

export type TreeNode = OptimalGroup | OptimalFile

export const isGroup = (t: TreeNode): t is OptimalGroup => 'children' in t

/** A node's key, unique within one tree: groups by dendrogram id, files by index. */
export const keyOf = (t: TreeNode) => (isGroup(t) ? `g${t.id}` : `f${t.index}`)

/** A group's label from the Group Stats; a file's, its last two path segments. */
export const labelOf = (node: TreeNode, parent: OptimalGroup | null, stats: GroupStatsCache) =>
  isGroup(node) ? stats.label(node.id, parent?.id ?? null) : fileLabel(node.file)

export const fileCount = (t: TreeNode): number =>
  isGroup(t) ? t.children.reduce((sum, c) => sum + fileCount(c), 0) : 1

/** One drawn block of the icicle. `left` and `width` are fractions of the zoomed group's width. */
export interface Block {
  node: TreeNode
  /** The node's parent in the tree (null for the tree's root). */
  parent: OptimalGroup | null
  row: number
  left: number
  width: number
}

/**
 * Lays out `rows` rows of the icicle below (and including) the zoomed group:
 * every block's width is proportional to its number of files.
 */
export function layoutIcicle(zoom: OptimalGroup, zoomParent: OptimalGroup | null, rows: number): Block[] {
  const blocks: Block[] = []
  const total = fileCount(zoom)
  const place = (node: TreeNode, parent: OptimalGroup | null, row: number, left: number) => {
    const files = fileCount(node)
    blocks.push({ node, parent, row, left: left / total, width: files / total })
    if (!isGroup(node) || row + 1 >= rows) return
    let x = left
    for (const child of node.children) {
      place(child, node, row + 1, x)
      x += fileCount(child)
    }
  }
  place(zoom, zoomParent, 0, 0)
  return blocks
}

/**
 * Colours for every node of a tree, computed once from the root so a group keeps
 * its colour while zooming: each group's hue range is split among its children by
 * file count; groups darken slightly with depth and alternate in lightness with
 * their neighbours. Files are grey.
 */
export function colourTree(root: OptimalGroup): Map<string, string> {
  const colours = new Map<string, string>()
  const paint = (node: TreeNode, from: number, to: number, depth: number, sibling: number) => {
    if (!isGroup(node)) {
      colours.set(keyOf(node), `hsl(0 0% ${sibling % 2 ? 34 : 38}%)`)
      return
    }
    const lightness = 46 - 4 * depth + (sibling % 2 ? -5 : 0)
    colours.set(keyOf(node), `hsl(${Math.round((from + to) / 2)} 55% ${lightness}%)`)
    const total = fileCount(node)
    let at = from
    node.children.forEach((child, i) => {
      const span = ((to - from) * fileCount(child)) / total
      paint(child, at, at + span, depth + 1, i)
      at += span
    })
  }
  paint(root, 0, 360, 0, 0)
  return colours
}

/** The path of groups from the root to the group with dendrogram id `id`, or null if the tree has no such group. */
export function pathTo(root: OptimalGroup, id: number): OptimalGroup[] | null {
  if (root.id === id) return [root]
  for (const child of root.children) {
    if (!isGroup(child)) continue
    const rest = pathTo(child, id)
    if (rest) return [root, ...rest]
  }
  return null
}
