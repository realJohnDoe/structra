import { fileLabel } from '../core/groupStats.ts'
import type { OptimalFile, OptimalGroup } from '../core/sweep.ts'
import { bucketByFolder, sizeText, type Folder, type FolderCounts } from './folders.ts'

export const ROWS = 4
export const ROW_HEIGHT = 46
/** Below this many px per file, a group's direct files fold into "+N more". */
export const FILE_MIN = 12
/** Below this many px, a group or Folder Block folds into "+N more". */
export const GROUP_MIN = 6

export type TreeNode = OptimalGroup | OptimalFile

export const isGroup = (t: TreeNode): t is OptimalGroup => 'children' in t

/** A node's key, unique within one tree: groups by dendrogram id, files by index. */
export const keyOf = (t: TreeNode) => (isGroup(t) ? `g${t.id}` : `f${t.index}`)

const counts = new WeakMap<OptimalGroup, number>()
/** The number of files in a node, cached per group. */
export const fileCount = (t: TreeNode): number => {
  if (!isGroup(t)) return 1
  let n = counts.get(t)
  if (n === undefined) counts.set(t, (n = t.children.reduce((sum, c) => sum + fileCount(c), 0)))
  return n
}

/** What the layout reads about groups and the repo's folders. */
export interface LayoutContext {
  /** A group's label (see `GroupStatsCache.label`). */
  label(group: OptimalGroup, parent: OptimalGroup | null): string
  /** The deepest folder holding every file of the group. */
  folder(group: OptimalGroup): string
  counts: FolderCounts
  /** Show a group's direct files as Folder Blocks (default); display only, the tree is never changed. */
  folderBlocks?: boolean
}

/**
 * Something the icicle draws: a group or file of the Optimal Tree, or a
 * display-only block (a Folder Block, or "+N more" for everything too narrow
 * to draw) that stands for some direct children of its owner group.
 */
export type Item =
  | { kind: 'group'; key: string; node: OptimalGroup; parent: OptimalGroup | null; files: number }
  | { kind: 'file'; key: string; node: OptimalFile; files: 1 }
  | DisplayItem

/** A display-only block: it stands for some direct children of its `owner` and is never a group of the tree. */
export type DisplayItem =
  | { kind: 'folder'; key: string; owner: OptimalGroup; folder: Folder; files: number }
  | { kind: 'more'; key: string; owner: OptimalGroup; members: TreeNode[]; count: number; files: number }

const groupItem = (node: OptimalGroup, parent: OptimalGroup | null): Item => ({
  kind: 'group',
  key: keyOf(node),
  node,
  parent,
  files: fileCount(node),
})
const fileItem = (node: OptimalFile): Item => ({ kind: 'file', key: keyOf(node), node, files: 1 })
const folderItem = (owner: OptimalGroup, folder: Folder): DisplayItem => ({
  kind: 'folder',
  key: `d${owner.id}:${folder.dir}`,
  owner,
  folder,
  files: folder.files.length,
})
const moreItem = (owner: OptimalGroup, members: TreeNode[], count: number): DisplayItem => ({
  kind: 'more',
  key: `m${owner.id}`,
  owner,
  members,
  count,
  files: members.reduce((sum, m) => sum + fileCount(m), 0),
})

export const isDisplayOnly = (item: Item): item is DisplayItem => item.kind === 'folder' || item.kind === 'more'

/** The nodes of the tree an item stands for. */
export const membersOf = (item: DisplayItem): TreeNode[] => (item.kind === 'folder' ? item.folder.files : item.members)

/** An item's first line, in bold. */
export function labelOf(item: Item, ctx: Pick<LayoutContext, 'label'>): string {
  switch (item.kind) {
    case 'group':
      return ctx.label(item.node, item.parent)
    case 'file':
      return fileLabel(item.node.file)
    case 'folder':
      return item.folder.name
    case 'more':
      return `+${item.count} more`
  }
}

/** An item's second line, its size, shortened to fit `width` px; none for files. */
export function sizeOf(item: Item, width = Infinity): string | null {
  if (item.kind === 'file') return null
  if (item.kind === 'folder') return sizeText(item.folder, width)
  return `${item.files} files`
}

/** A group's child groups as drawn: largest first, ties by label. */
export function childGroups(node: OptimalGroup, ctx: Pick<LayoutContext, 'label'>): OptimalGroup[] {
  return sortGroups(node.children.filter(isGroup), node, ctx)
}

function sortGroups(groups: OptimalGroup[], parent: OptimalGroup, ctx: Pick<LayoutContext, 'label'>) {
  const label = new Map(groups.map((g) => [g, ctx.label(g, parent)]))
  // Ties break by label, then node id (ADR 0002's stable order).
  return [...groups].sort(
    (a, b) =>
      fileCount(b) - fileCount(a) || (label.get(a)! < label.get(b)! ? -1 : label.get(a)! > label.get(b)! ? 1 : 0) || a.id - b.id,
  )
}

/** A group's direct files as Folder Blocks, or one bucket per file with Folder Blocks off. */
function folders(owner: OptimalGroup, files: OptimalFile[], ctx: LayoutContext): Folder[] {
  if (ctx.folderBlocks === false) return files.map((f) => ({ dir: f.file, name: f.file, files: [f], total: 1 }))
  return bucketByFolder(files, ctx.folder(owner), ctx.counts)
}

/** One drawn block of the icicle, in px from the icicle's left edge. */
export interface Block {
  item: Item
  row: number
  left: number
  width: number
  /** The index in the layout of the block this one is drawn under; null for the top block. */
  parent: number | null
}

/**
 * What the icicle shows: rows of blocks, or (for an opened display-only block
 * whose contents don't fit) the opened block as a header over a tile grid.
 */
export type View = { kind: 'blocks'; blocks: Block[] } | { kind: 'grid'; header: DisplayItem; tiles: Item[] }

/**
 * An opened display-only block re-read against the zoomed group: it opens only
 * in its owner, and keeps only the members still directly in it (a λ change can
 * move them). Null when nothing of it is left.
 */
export function resolveOpened(zoom: OptimalGroup, opened: DisplayItem | null, ctx: LayoutContext): DisplayItem | null {
  if (!opened || opened.owner.id !== zoom.id) return null
  const keys = new Set(membersOf(opened).map(keyOf))
  const members = zoom.children.filter((c) => keys.has(keyOf(c)))
  if (!members.length) return null
  if (opened.kind === 'folder') return folderItem(zoom, { ...opened.folder, files: members as OptimalFile[] })
  return moreItem(zoom, members, splitMembers(zoom, members, ctx).length)
}

/** Groups (largest first), then multi-file Folder Blocks, then single files: the order display-only contents are drawn in. */
function splitMembers(owner: OptimalGroup, members: TreeNode[], ctx: LayoutContext): Item[] {
  const groups = sortGroups(members.filter(isGroup), owner, ctx).map((g) => groupItem(g, owner))
  const buckets = folders(
    owner,
    members.filter((m): m is OptimalFile => !isGroup(m)),
    ctx,
  )
  return [
    ...groups,
    ...buckets.filter((b) => b.files.length > 1).map((b) => folderItem(owner, b)),
    ...buckets.filter((b) => b.files.length === 1).map((b) => fileItem(b.files[0])),
  ]
}

/**
 * Lays out the icicle at `width` px: `ROWS` rows below and including the zoomed
 * group (or the opened block), every block as wide as its files. Within a group,
 * child groups come first, then Folder Blocks and files; whatever is too narrow
 * goes into one "+N more", which is never "+1".
 */
export function layoutView(
  zoom: OptimalGroup,
  zoomParent: OptimalGroup | null,
  opened: DisplayItem | null,
  width: number,
  ctx: LayoutContext,
): View {
  const blocks: Block[] = []

  const lay = (item: Item, row: number, left: number, w: number, parent: number | null) => {
    const at = blocks.push({ item, row, left, width: w, parent }) - 1
    if (row + 1 >= ROWS) return
    if (item.kind === 'group') layChildren(item.node, item.node.children, false, row + 1, left, w, at)
    // A folder's files are drawn under it when they fit; otherwise they fold into it.
    else if (item.kind === 'folder' && w / item.files >= FILE_MIN)
      item.folder.files.forEach((f, i) => lay(fileItem(f), row + 1, left + (i * w) / item.files, w / item.files, at))
  }

  const layChildren = (
    owner: OptimalGroup,
    children: TreeNode[],
    asFolder: boolean,
    row: number,
    left: number,
    w: number,
    parent: number,
  ) => {
    const per = w / children.reduce((sum, c) => sum + fileCount(c), 0)
    let x = left
    const put = (item: Item) => {
      lay(item, row, x, item.files * per, parent)
      x += item.files * per
    }
    const files = children.filter((c): c is OptimalFile => !isGroup(c))
    if (asFolder) return files.forEach((f) => put(fileItem(f)))

    const fits = (files: number) => files * per >= GROUP_MIN
    const groups = sortGroups(children.filter(isGroup), owner, ctx)
    const buckets = folders(owner, files, ctx)
    const multi = buckets.filter((b) => b.files.length > 1)
    const singles = buckets.filter((b) => b.files.length === 1).map((b) => b.files[0])
    const fileFits = per >= FILE_MIN

    const small: Item[] = [
      ...groups.filter((g) => !fits(fileCount(g))).map((g) => groupItem(g, owner)),
      ...multi.filter((b) => !fits(b.files.length)).map((b) => folderItem(owner, b)),
      ...(fileFits ? [] : singles.map(fileItem)),
    ]
    for (const g of groups) if (fits(fileCount(g))) put(groupItem(g, owner))
    for (const b of multi) if (fits(b.files.length)) put(folderItem(owner, b))
    if (fileFits) singles.forEach((f) => put(fileItem(f)))
    // A "+1" block would be as wide as the one thing in it: draw that thing instead.
    if (small.length === 1) put(small[0])
    else if (small.length) {
      const members = small.flatMap((s): TreeNode[] => (isDisplayOnly(s) ? membersOf(s) : [s.node]))
      put(moreItem(owner, members, small.length))
    }
  }

  const open = resolveOpened(zoom, opened, ctx)
  if (!open) {
    lay(groupItem(zoom, zoomParent), 0, 0, width, null)
    return { kind: 'blocks', blocks }
  }
  const members = membersOf(open)
  const per = width / open.files
  const grid = members.some((m) => (isGroup(m) ? fileCount(m) * per < GROUP_MIN : per < FILE_MIN))
  if (grid) return { kind: 'grid', header: open, tiles: open.kind === 'folder' ? open.folder.files.map(fileItem) : splitMembers(open.owner, open.members, ctx) }
  blocks.push({ item: open, row: 0, left: 0, width, parent: null })
  layChildren(zoom, members, open.kind === 'folder', 1, 0, width, 0)
  return { kind: 'blocks', blocks }
}

/** The colour of every file block. */
export const FILE_COLOUR = '#8a919c'
const ROOT_COLOUR = 'hsl(80 10% 45%)'

/**
 * Colours for every group of a tree, computed once from the root so a group keeps
 * its colour while zooming: each group splits its hue range among its child groups
 * by file count, in drawing order. Light enough for dark label text; darker with
 * depth, alternating with neighbours. Files are `FILE_COLOUR`.
 */
export function colourTree(root: OptimalGroup, ctx: Pick<LayoutContext, 'label'>): Map<string, string> {
  const colours = new Map<string, string>([[keyOf(root), ROOT_COLOUR]])
  const paint = (node: OptimalGroup, from: number, to: number, below: number) => {
    const groups = childGroups(node, ctx)
    const total = groups.reduce((sum, g) => sum + fileCount(g), 0)
    let at = from
    groups.forEach((g, i) => {
      const span = ((to - from) * fileCount(g)) / total
      const lightness = Math.max(40, 64 - below * 4 - (i % 2) * 7)
      colours.set(keyOf(g), `hsl(${Math.round((at + span / 2 + 200) % 360)} 62% ${lightness}%)`)
      paint(g, at, at + span, below + 1)
      at += span
    })
  }
  paint(root, 0, 360, 0)
  return colours
}

/** An item's colour: a group's own, a file's grey, a display-only block's owner's. */
export function colourOf(item: Item, colours: Map<string, string>): string {
  if (item.kind === 'file') return FILE_COLOUR
  if (item.kind === 'group') return colours.get(item.key) ?? ROOT_COLOUR
  return colours.get(keyOf(item.owner)) ?? ROOT_COLOUR
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

/** The path of groups from the root to the group directly holding file `index`, or null if the tree has no such file. */
export function pathToFile(root: OptimalGroup, index: number): OptimalGroup[] | null {
  for (const child of root.children) {
    if (!isGroup(child)) {
      if (child.index === index) return [root]
      continue
    }
    const rest = pathToFile(child, index)
    if (rest) return [root, ...rest]
  }
  return null
}

/** An item of the tree at a node, as the icicle and the details card show it; `path` runs from the root to the node's parent. */
export const itemOf = (node: TreeNode, path: OptimalGroup[]): Item =>
  isGroup(node) ? groupItem(node, path[path.length - 1] ?? null) : fileItem(node)

/**
 * A selected item re-read against another step's tree: a group by its dendrogram
 * id, a display-only block by its owner and the members still directly in it.
 * Null when the tree no longer has it.
 */
export function resolveItem(root: OptimalGroup, item: Item, ctx: LayoutContext): Item | null {
  if (item.kind === 'file') return pathToFile(root, item.node.index) && item
  if (item.kind === 'group') {
    const path = pathTo(root, item.node.id)
    return path && groupItem(path[path.length - 1], path[path.length - 2] ?? null)
  }
  const path = pathTo(root, item.owner.id)
  return path && resolveOpened(path[path.length - 1], item, ctx)
}
