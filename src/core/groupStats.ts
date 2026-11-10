import type { DendrogramArtifact } from './artifact.ts'
import type { GraphFile } from './graphFile.ts'

/** What a group shows that depends only on its files, so is the same at every λ step. */
export interface GroupStats {
  files: number
  /** Imports with both ends in the group. */
  within: number
  /** Imports from outside into the group. */
  in: number
  /** Imports from the group to outside. */
  out: number
  /** The deepest folder holding every file of the group ('' for the repo root). */
  folder: string
  /** Up to two files most imported from within the group, with distinct short names. */
  mostImported: string[]
}

export interface GroupStatsCache {
  /** Stats of the group that is dendrogram node `id` (or the root id `treeAt` gives). */
  of(id: number): GroupStats
  /**
   * The group's label: "All N files" for the root; its own folder ("json/") when
   * that is deeper than its parent's; otherwise its most-imported files ("{app, ctx, …}").
   */
  label(id: number, parentId: number | null): string
}

const folderOf = (path: string) => path.split('/').slice(0, -1).join('/')

/** A file's name without extension; package entry files (`__init__.py`, `index.ts`, …) go by their folder. */
const shortName = (path: string) => {
  const parts = path.replace(/\/(__init__|index|mod|lib)\.\w+$/, '').replace(/\.\w+$/, '').split('/')
  return parts[parts.length - 1]
}

/** A file's label: its last two path segments. */
export const fileLabel = (path: string) => path.split('/').slice(-2).join('/')

/** Computes each group's stats once, on first use, and keeps them for every λ step. */
export function createGroupStats(artifact: DendrogramArtifact, graph: Pick<GraphFile, 'nodes' | 'edges'>): GroupStatsCache {
  const { n, merges } = artifact.dendrogram
  const paths = graph.nodes
  const index = new Map(paths.map((p, i) => [p, i]))
  const out: number[][] = paths.map(() => [])
  const inn: number[][] = paths.map(() => [])
  for (const [src, dst] of graph.edges) {
    const a = index.get(src)!
    const b = index.get(dst)!
    out[a].push(b)
    inn[b].push(a)
  }
  const isRoot = (id: number) => (n < 2 ? id === n : id === 2 * n - 2)

  const filesOf = (id: number): number[] => {
    if (n < 2 && id === n) return paths.map((_, i) => i)
    const files: number[] = []
    const stack = [id]
    while (stack.length) {
      const x = stack.pop()!
      if (x < n) files.push(x)
      else stack.push(merges[x - n][1], merges[x - n][0])
    }
    return files
  }

  const cache = new Map<number, GroupStats>()
  const of = (id: number): GroupStats => {
    const hit = cache.get(id)
    if (hit) return hit
    const files = filesOf(id)
    const inside = new Set(files)
    let within = 0
    let into = 0
    let outOf = 0
    const importedFromWithin = new Map<number, number>()
    for (const f of files) {
      for (const t of out[f]) {
        if (inside.has(t)) within++
        else outOf++
      }
      let d = 0
      for (const s of inn[f]) {
        if (inside.has(s)) d++
        else into++
      }
      importedFromWithin.set(f, d)
    }
    let folder = files.length ? folderOf(paths[files[0]]).split('/') : []
    for (const f of files) {
      const parts = folderOf(paths[f]).split('/')
      let j = 0
      while (j < folder.length && j < parts.length && parts[j] === folder[j]) j++
      folder = folder.slice(0, j)
    }
    // File indices follow path order, so ties break by path.
    const ranked = [...files].sort((a, b) => importedFromWithin.get(b)! - importedFromWithin.get(a)! || a - b)
    const mostImported: string[] = []
    const names = new Set<string>()
    for (const f of ranked) {
      if (mostImported.length === 2) break
      const name = shortName(paths[f])
      if (names.has(name)) continue
      names.add(name)
      mostImported.push(paths[f])
    }
    const stats = { files: files.length, within, in: into, out: outOf, folder: folder.join('/'), mostImported }
    cache.set(id, stats)
    return stats
  }

  const labels = new Map<string, string>()
  const label = (id: number, parentId: number | null): string => {
    if (parentId === null || isRoot(id)) return `All ${of(id).files} files`
    const key = `${id} ${parentId}`
    const hit = labels.get(key)
    if (hit !== undefined) return hit
    const s = of(id)
    const ownFolder = s.folder !== '' && s.folder !== of(parentId).folder
    const more = s.files > s.mostImported.length ? ', …' : ''
    const text = ownFolder
      ? `${s.folder.split('/').pop()}/`
      : `{${s.mostImported.map(shortName).join(', ')}${more}}`
    labels.set(key, text)
    return text
  }

  return { of, label }
}
