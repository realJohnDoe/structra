/**
 * The TypeScript toolchain's Graph File writer. It implements the
 * serialization rules in `schema/README.md`, as the Python writer
 * (`parsers/python/src/structra_parsers/graph_file.py`) does.
 */

export interface Meta {
  repo: string
  commit: string
  language: string
  parser: string
}

/** Orders strings by Unicode codepoint: UTF-8 byte order is codepoint order. */
export function compareCodepoints(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
}

const str = (s: string) => JSON.stringify(s)

const list = (items: string[]) =>
  items.length === 0 ? '[]' : `[\n${items.map((item) => `    ${item}`).join(',\n')}\n  ]`

/**
 * Writes a Graph File in its one canonical byte form.
 *
 * Sorts nodes and edges by codepoint and drops duplicates and self-imports.
 * Every edge end must be in `nodes`.
 */
export function serializeGraphFile(meta: Meta, nodes: Iterable<string>, edges: Iterable<readonly [string, string]>): string {
  const nodeList = [...new Set(nodes)].sort(compareCodepoints)
  const known = new Set(nodeList)
  const unique = new Map<string, [string, string]>()
  for (const [src, dst] of edges) {
    if (src === dst) continue
    if (!known.has(src) || !known.has(dst)) throw new Error(`edge (${str(src)}, ${str(dst)}) has an end outside nodes`)
    unique.set(`${src}\0${dst}`, [src, dst])
  }
  const edgeList = [...unique.values()].sort((a, b) => compareCodepoints(a[0], b[0]) || compareCodepoints(a[1], b[1]))
  return [
    '{',
    '  "meta": {',
    `    "repo": ${str(meta.repo)},`,
    `    "commit": ${str(meta.commit)},`,
    `    "language": ${str(meta.language)},`,
    `    "parser": { "name": ${str(meta.parser)} }`,
    '  },',
    `  "nodes": ${list(nodeList.map(str))},`,
    `  "edges": ${list(edgeList.map(([a, b]) => `[${str(a)}, ${str(b)}]`))}`,
    '}',
    '',
  ].join('\n')
}
