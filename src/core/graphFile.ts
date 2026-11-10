import Ajv2020 from 'ajv/dist/2020.js'
import schema from '../../schema/graph-file.schema.json' with { type: 'json' }

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

const compareEdges = (a: [string, string], b: [string, string]) =>
  compareCodepoints(a[0], b[0]) || compareCodepoints(a[1], b[1])

const checkShape = new Ajv2020({ allErrors: true, strict: true }).compile(schema)

/**
 * Validates parsed JSON as a Graph File: the JSON Schema in `schema/`, plus the
 * rules from its README that JSON Schema can't express.
 */
export function validateGraphFile(json: unknown): Validation {
  if (!checkShape(json)) {
    return {
      ok: false,
      errors: (checkShape.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'is invalid'}`),
    }
  }
  const graph = json as unknown as GraphFile
  const errors: string[] = []
  const nodes = new Set(graph.nodes)
  for (let i = 1; i < graph.nodes.length; i++) {
    if (compareCodepoints(graph.nodes[i - 1], graph.nodes[i]) >= 0) {
      errors.push(`/nodes/${i} "${graph.nodes[i]}" is not after "${graph.nodes[i - 1]}" (nodes must be sorted by codepoint, without duplicates)`)
    }
  }
  graph.edges.forEach((edge, i) => {
    for (const end of edge) if (!nodes.has(end)) errors.push(`/edges/${i} "${end}" is not in nodes`)
    if (edge[0] === edge[1]) errors.push(`/edges/${i} is a self-import of "${edge[0]}"`)
    if (i > 0 && compareEdges(graph.edges[i - 1], edge) >= 0) {
      errors.push(`/edges/${i} is not after /edges/${i - 1} (edges must be sorted by importer, then imported, without duplicates)`)
    }
  })
  return errors.length ? { ok: false, errors } : { ok: true, graph }
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
