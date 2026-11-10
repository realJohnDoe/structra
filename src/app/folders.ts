import type { OptimalFile } from '../core/sweep.ts'

/** How many of the repo's files sit directly in each folder, and anywhere under it ('' is the repo root). */
export interface FolderCounts {
  direct: Map<string, number>
  under: Map<string, number>
}

/** A path's folder ('' for the repo root). */
export const folderOf = (path: string) => path.split('/').slice(0, -1).join('/')

/** Counts the repo's files per folder, directly in it and anywhere under it. */
export function folderCounts(paths: string[]): FolderCounts {
  const direct = new Map<string, number>()
  const under = new Map<string, number>()
  for (const p of paths) {
    const d = folderOf(p)
    direct.set(d, (direct.get(d) ?? 0) + 1)
    const parts = d ? d.split('/') : []
    for (let i = 0; i <= parts.length; i++) {
      const k = parts.slice(0, i).join('/')
      under.set(k, (under.get(k) ?? 0) + 1)
    }
  }
  return { direct, under }
}

/** One Folder Block: files sitting directly in one group that share a folder (see `GLOSSARY.md`). */
export interface Folder {
  /** The deepest folder the files share. */
  dir: string
  /** Its name relative to the group's own folder, e.g. "json/". */
  name: string
  files: OptimalFile[]
  /**
   * The repo's files in the same set: directly in `dir` when every file here is,
   * otherwise anywhere under it.
   */
  total: number
}

/**
 * Buckets a group's direct files into Folder Blocks: one per first folder level
 * below the group's own folder `prefix` (plus one for files directly in it),
 * narrowed to the deepest folder its files share. Largest first, then by folder.
 */
export function bucketByFolder(files: OptimalFile[], prefix: string, counts: FolderCounts): Folder[] {
  const keyOf = (d: string) => {
    if (d === prefix || !(prefix === '' || d.startsWith(prefix + '/'))) return d
    const rel = prefix ? d.slice(prefix.length + 1) : d
    return (prefix ? prefix + '/' : '') + rel.split('/')[0]
  }
  const buckets = new Map<string, OptimalFile[]>()
  for (const f of files) {
    const key = keyOf(folderOf(f.file))
    const b = buckets.get(key)
    if (b) b.push(f)
    else buckets.set(key, [f])
  }
  const out: Folder[] = []
  for (const here of buckets.values()) {
    const dirs = here.map((f) => folderOf(f.file).split('/'))
    let common = dirs[0].length
    for (const d of dirs) {
      let j = 0
      while (j < common && j < d.length && d[j] === dirs[0][j]) j++
      common = j
    }
    const dir = dirs[0].slice(0, common).join('/')
    const direct = here.every((f) => folderOf(f.file) === dir)
    const rel =
      dir === '' ? '(repo root)' : prefix === '' ? dir : dir.startsWith(prefix + '/') ? dir.slice(prefix.length + 1) : dir.split('/').pop()!
    const total = (direct ? counts.direct.get(dir) : counts.under.get(dir)) ?? here.length
    out.push({ dir, name: `${rel}/`, files: here, total })
  }
  out.sort((a, b) => b.files.length - a.files.length || (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0))
  return out
}

/** Whether block text fits in `width` px: about 6 px per character, after 14 px of padding and border. */
const fits = (text: string, width: number) => text.length <= Math.floor((width - 14) / 6)

/**
 * A Folder Block's size line: "22 of 41 here", shortened to "22/41" when narrow,
 * or "all 12" when every file of the folder is here. Never where the others are.
 */
export function sizeText(folder: Pick<Folder, 'files' | 'total'>, width = Infinity): string {
  const here = folder.files.length
  if (here === folder.total) return `all ${here}`
  const long = `${here} of ${folder.total} here`
  return fits(long, width) ? long : `${here}/${folder.total}`
}
