/** A Tree whose leaves are files, as `scoreTree` reads it (see `GLOSSARY.md`). */
export type Tree = TreeFile | TreeGroup

export interface TreeFile {
  file: string
}

export interface TreeGroup {
  children: Tree[]
}

/** A group of an Optimal Tree: a surviving dendrogram node. */
export interface OptimalGroup extends TreeGroup {
  id: number
  children: (OptimalGroup | OptimalFile)[]
}

export interface OptimalFile extends TreeFile {
  index: number
}

export const isGroup = <T extends Tree>(t: T): t is Extract<T, TreeGroup> => 'children' in t

/** A path's folder ('' for the repo root). */
export const folderOf = (path: string) => path.split('/').slice(0, -1).join('/')

/** The deepest folder holding every one of `paths` ('' for the repo root, or when there are none). */
export function commonFolder(paths: string[]): string {
  if (!paths.length) return ''
  const first = folderOf(paths[0]).split('/')
  let common = first.length
  for (const p of paths) {
    const parts = folderOf(p).split('/')
    let j = 0
    while (j < common && j < parts.length && parts[j] === first[j]) j++
    common = j
  }
  return first.slice(0, common).join('/')
}
