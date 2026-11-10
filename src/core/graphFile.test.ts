import { describe, expect, it } from 'vitest'
import toyText from '../../examples/toy.graph.json?raw'
import { serializeGraphFile, validateGraphFile } from './graphFile.ts'

const toy = () => JSON.parse(toyText)

describe('validateGraphFile', () => {
  it('accepts the toy Graph File', () => {
    expect(validateGraphFile(toy())).toEqual({ ok: true, graph: toy() })
  })

  it('accepts an empty graph', () => {
    const g = { ...toy(), nodes: [], edges: [] }
    expect(validateGraphFile(g).ok).toBe(true)
  })

  it('rejects an edge whose end is not in nodes', () => {
    const g = toy()
    g.edges.push(['toy/web/views.py', 'toy/missing.py'])
    const r = validateGraphFile(g)
    expect(r.ok).toBe(false)
    expect(r.ok || r.errors.join('\n')).toMatch(/toy\/missing\.py/)
  })

  it('rejects unsorted nodes', () => {
    const g = toy()
    ;[g.nodes[0], g.nodes[1]] = [g.nodes[1], g.nodes[0]]
    expect(validateGraphFile(g).ok).toBe(false)
  })

  it('rejects unsorted or duplicate edges', () => {
    const unsorted = toy()
    unsorted.edges.reverse()
    expect(validateGraphFile(unsorted).ok).toBe(false)
    const dup = toy()
    dup.edges.push(dup.edges.at(-1))
    expect(validateGraphFile(dup).ok).toBe(false)
  })

  it('sorts by codepoint, not by UTF-16 code unit', () => {
    // U+FF5E sorts before U+1F600 by codepoint, after it by UTF-16 code unit.
    const g = { ...toy(), nodes: ['～.py', '\u{1F600}.py'], edges: [] }
    expect(validateGraphFile(g).ok).toBe(true)
  })

  it('rejects a self-import', () => {
    const g = toy()
    g.edges = [['toy/cli.py', 'toy/cli.py']]
    expect(validateGraphFile(g).ok).toBe(false)
  })

  it('rejects extra keys at every level', () => {
    expect(validateGraphFile({ ...toy(), version: 1 }).ok).toBe(false)
    const meta = toy()
    meta.meta.timestamp = 'now'
    expect(validateGraphFile(meta).ok).toBe(false)
    const parser = toy()
    parser.meta.parser.version = '1.0'
    expect(validateGraphFile(parser).ok).toBe(false)
  })

  it('rejects a wrong shape', () => {
    expect(validateGraphFile('digraph {}').ok).toBe(false)
    const g = toy()
    g.edges[0] = ['toy/cli.py']
    expect(validateGraphFile(g).ok).toBe(false)
    const abs = toy()
    abs.nodes = ['/etc/passwd']
    abs.edges = []
    expect(validateGraphFile(abs).ok).toBe(false)
  })
})

describe('serializeGraphFile', () => {
  it('reproduces the committed toy Graph File byte for byte', () => {
    expect(serializeGraphFile(toy())).toBe(toyText)
  })

  it('writes empty lists on one line', () => {
    const g = { ...toy(), nodes: [], edges: [] }
    expect(serializeGraphFile(g)).toMatch(/\n {2}"nodes": \[\],\n {2}"edges": \[\]\n\}\n$/)
  })

  it('keeps non-ASCII paths unescaped and escapes quotes', () => {
    const g = { ...toy(), nodes: ['a"b.py', 'ünï/代码.py'], edges: [['ünï/代码.py', 'a"b.py']] as [string, string][] }
    const text = serializeGraphFile(g)
    expect(text).toContain('    "ünï/代码.py"\n')
    expect(text).toContain('    ["ünï/代码.py", "a\\"b.py"]\n')
    expect(JSON.parse(text)).toEqual(g)
  })

  it('writes keys in the fixed order whatever order they came in', () => {
    const g = toy()
    const shuffled = { edges: g.edges, nodes: g.nodes, meta: { parser: g.meta.parser, language: g.meta.language, commit: g.meta.commit, repo: g.meta.repo } }
    expect(serializeGraphFile(shuffled)).toBe(toyText)
  })
})
