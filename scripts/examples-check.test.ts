import { describe, expect, it } from 'vitest'
import { diffSummary, parserCounts } from './examples-check.ts'

describe('diffSummary', () => {
  it('lists nodes and edges on each side', () => {
    const committed = { nodes: ['a', 'b'], edges: [['a', 'b']] as [string, string][] }
    const actual = { nodes: ['a', 'c'], edges: [['a', 'c']] as [string, string][] }
    const md = diffSummary(committed, actual)
    expect(md).toContain('Nodes only in the actual Graph File (1)\n\n- `c`')
    expect(md).toContain('Nodes only in the committed Graph File (1)\n\n- `b`')
    expect(md).toContain('- `a -> c`')
    expect(md).toContain('- `a -> b`')
  })

  it('is empty when the nodes and edges agree', () => {
    const g = { nodes: ['a'], edges: [] }
    expect(diffSummary(g, g)).toBe('')
  })
})

describe('parserCounts', () => {
  it('keeps the failure and unresolved-import lines', () => {
    const stderr = '2 files failed to parse\n  py2.py: SyntaxError\nstructra-parse-python: 3 unresolved internal-looking imports:\n  x (3)\n'
    expect(parserCounts(stderr)).toEqual([
      '2 files failed to parse',
      'structra-parse-python: 3 unresolved internal-looking imports:',
    ])
  })
})
