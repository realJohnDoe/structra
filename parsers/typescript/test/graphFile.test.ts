// The writer against the Python writer's committed output: for the same
// input, both toolchains must write the same bytes (ADR 0003).
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { serializeGraphFile } from '../src/graphFile.ts'

const pythonFixtures = join(import.meta.dirname, '..', '..', 'python', 'fixtures')

for (const name of readdirSync(pythonFixtures).sort()) {
  const file = join(pythonFixtures, name, 'expected.graph.json')
  if (!existsSync(file)) continue
  test(`writes the Python writer's bytes for python/fixtures/${name}`, () => {
    const expected = readFileSync(file, 'utf8')
    const graph = JSON.parse(expected)
    // Unsorted, duplicated input with a self-import: the writer normalizes it.
    const nodes = [...graph.nodes].reverse().concat(graph.nodes)
    const edges = [...graph.edges].reverse().concat(graph.edges)
    if (graph.nodes.length) edges.push([graph.nodes[0], graph.nodes[0]])
    const meta = { ...graph.meta, parser: graph.meta.parser.name }
    assert.equal(serializeGraphFile(meta, nodes, edges), expected)
  })
}

test('refuses an edge whose end is not a node', () => {
  const meta = { repo: 'https://github.com/x/y', commit: '0'.repeat(40), language: 'typescript', parser: 'structra-parse-typescript' }
  assert.throws(() => serializeGraphFile(meta, ['a.ts'], [['a.ts', 'b.ts']]), /outside nodes/)
})
