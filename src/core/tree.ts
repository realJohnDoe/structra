/** A Tree whose leaves are files, as `scoreTree` reads it (see `GLOSSARY.md`). */
export type Tree = TreeFile | TreeGroup

export interface TreeFile {
  file: string
}

export interface TreeGroup {
  children: Tree[]
}

export const isGroup = (t: Tree): t is TreeGroup => 'children' in t
