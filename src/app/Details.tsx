import type { GroupStatsCache } from '../core/groupStats.ts'
import { fileLabel } from '../core/groupStats.ts'
import type { OptimalGroup } from '../core/sweep.ts'
import { sizeText } from './folders.ts'
import { childGroups, fileCount, isGroup, labelOf, membersOf, type DisplayItem, type Item, type LayoutContext, type TreeNode } from './icicle.ts'
import { filesOf, importCounts, type Adjacency } from './imports.ts'

/** Lists are cut here, with "… N more" after. */
const LIST_MAX = 40

interface Props {
  item: Item
  ctx: LayoutContext
  stats: GroupStatsCache
  adj: Adjacency
  /** The Graph File's paths, by file index. */
  paths: string[]
  /** A group's label in the current tree. */
  groupLabel: (group: OptimalGroup) => string
  /** Selects a node picked from a list (by node, or by file index). */
  onPick: (node: TreeNode | number) => void
}

function Counts({ within, out, in: inn }: { within: number; out: number; in: number }) {
  return (
    <>
      <span className="chip">{within} imports within</span>
      <span className="chip out">→ {out} to outside</span>
      <span className="chip in">← {inn} from outside</span>
    </>
  )
}

function List<T>({ title, items, render }: { title?: string; items: T[]; render: (item: T) => React.ReactNode }) {
  return (
    <section className="details-list" aria-label={title}>
      {title && (
        <h3>
          {title} ({items.length})
        </h3>
      )}
      <ul>{items.slice(0, LIST_MAX).map(render)}</ul>
      {items.length > LIST_MAX && <p className="dim">… {items.length - LIST_MAX} more</p>}
    </section>
  )
}

/** The details card of a selected group, file, Folder Block or "+N more". No k and no cost numbers. */
export function Details({ item, ctx, stats, adj, paths, groupLabel, onPick }: Props) {
  const node = (t: TreeNode, owner: OptimalGroup) => (
    <li key={isGroup(t) ? `g${t.id}` : `f${t.index}`}>
      <button type="button" onClick={() => onPick(t)}>
        {isGroup(t) ? (
          <>
            <span className="group-name">▸ {ctx.label(t, owner)}</span> <span className="dim">{fileCount(t)}</span>
          </>
        ) : (
          fileLabel(t.file)
        )}
      </button>
    </li>
  )
  const file = (i: number) => (
    <li key={i}>
      <button type="button" onClick={() => onPick(i)}>
        {paths[i]}
      </button>
    </li>
  )

  if (item.kind === 'file') {
    const i = item.node.index
    return (
      <section className="details" aria-label="Details">
        <h2>{fileLabel(item.node.file)}</h2>
        <p className="dim path">{item.node.file}</p>
        <List title="Imports" items={adj.out[i]} render={file} />
        <List title="Imported by" items={adj.in[i]} render={file} />
      </section>
    )
  }

  if (item.kind === 'group') {
    const g = item.node
    const s = stats.of(g.id)
    const subgroups = g.children.filter(isGroup).length
    const children: TreeNode[] = [...childGroups(g, ctx), ...g.children.filter((c) => !isGroup(c))]
    return (
      <section className="details" aria-label="Details">
        <h2>{labelOf(item, ctx)}</h2>
        <p className="dim path">{s.folder ? `${s.folder}/` : '(repo root)'}</p>
        <p className="chips">
          <span className="chip">{s.files} files</span>
          <span className="chip">
            {subgroups} subgroups · {g.children.length - subgroups} files direct
          </span>
          <Counts within={s.within} out={s.out} in={s.in} />
        </p>
        <List title="Children" items={children} render={(c) => node(c, g)} />
      </section>
    )
  }

  return <DisplayDetails item={item} ctx={ctx} adj={adj} groupLabel={groupLabel} node={node} />
}

function DisplayDetails({
  item,
  ctx,
  adj,
  groupLabel,
  node,
}: {
  item: DisplayItem
  ctx: LayoutContext
  adj: Adjacency
  groupLabel: (group: OptimalGroup) => string
  node: (t: TreeNode, owner: OptimalGroup) => React.ReactNode
}) {
  const counts = importCounts(filesOf(item), adj)
  const owner = groupLabel(item.owner)
  const members = membersOf(item)
  let about: string
  if (item.kind === 'folder') {
    const { files, total } = item.folder
    const rest = total - files.length
    about =
      rest === 0
        ? `All ${total} of the folder's files are in ${owner}.`
        : `${files.length} of the folder's ${total} files are in ${owner}; ${rest} are elsewhere in the tree.`
  } else {
    const groups = members.filter(isGroup).length
    about = `What in ${owner} is too narrow to draw: ${groups} ${groups === 1 ? 'group' : 'groups'} and ${members.length - groups} ${members.length - groups === 1 ? 'file' : 'files'}.`
  }
  return (
    <section className="details" aria-label="Details">
      <h2>
        {labelOf(item, ctx)} <span className="dim">· {item.kind === 'folder' ? sizeText(item.folder) : `${item.files} files`}</span>
      </h2>
      <p className="dim">
        {about} Display only: not a group of the Optimal Tree. Tap the block again to open it.
      </p>
      <p className="chips">
        <Counts {...counts} />
      </p>
      <List title={item.kind === 'folder' ? 'Files' : 'Contents'} items={members} render={(m) => node(m, item.owner)} />
    </section>
  )
}
