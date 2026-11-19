export interface GraphFile {
  meta: {
    repo: string
    commit: string
    language: string
    parser: { name: string }
  }
  nodes: string[]
  /** Directed `[importer, imported]` pairs. */
  edges: [string, string][]
}

export type Validation = { ok: true; graph: GraphFile } | { ok: false; errors: string[] }

/** Orders strings by Unicode codepoint (not by UTF-16 code unit, as `<` does). */
export function compareCodepoints(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a.codePointAt(i)!
    const y = b.codePointAt(i)!
    if (x !== y) return x - y
    if (x > 0xffff) i++
  }
  return a.length - b.length
}

const str = (s: string) => JSON.stringify(s)

const list = (items: string[]) =>
  items.length === 0 ? '[]' : `[\n${items.map((item) => `    ${item}`).join(',\n')}\n  ]`

/**
 * Writes a Graph File in its one canonical byte form (see `schema/README.md`).
 * It doesn't sort or check anything: pass a graph that `validateGraphFile` accepts.
 */
export function serializeGraphFile(graph: GraphFile): string {
  const { repo, commit, language, parser } = graph.meta
  return [
    '{',
    '  "meta": {',
    `    "repo": ${str(repo)},`,
    `    "commit": ${str(commit)},`,
    `    "language": ${str(language)},`,
    `    "parser": { "name": ${str(parser.name)} }`,
    '  },',
    `  "nodes": ${list(graph.nodes.map(str))},`,
    `  "edges": ${list(graph.edges.map(([a, b]) => `[${str(a)}, ${str(b)}]`))}`,
    '}',
    '',
  ].join('\n')
}
