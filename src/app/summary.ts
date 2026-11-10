import type { OptimalFile, OptimalGroup } from '../core/sweep.ts'

const isGroup = (t: OptimalGroup | OptimalFile): t is OptimalGroup => 'children' in t

/** "N groups · depth D": the groups of the Optimal Tree, root included, and its levels of groups. */
export function summarize(tree: OptimalGroup): string {
  let groups = 0
  const depth = (g: OptimalGroup): number => {
    groups++
    return 1 + Math.max(0, ...g.children.filter(isGroup).map(depth))
  }
  const d = depth(tree)
  return `${groups} ${groups === 1 ? 'group' : 'groups'} · depth ${d}`
}
