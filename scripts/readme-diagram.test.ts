import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const cli = join(import.meta.dirname, 'readme-diagram.ts')
const committed = join(import.meta.dirname, '..', 'docs', 'images', 'toy-diagram.svg')

describe('readme-diagram', () => {
  it('regenerates the committed README toy diagram from the toy Graph File', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'structra-')), 'toy.svg')
    execFileSync('node', [cli, '--out', out])
    expect(readFileSync(out, 'utf8')).toBe(readFileSync(committed, 'utf8'))
  })

  it('draws every file of the toy Graph File and the λ it was drawn at', () => {
    const svg = readFileSync(committed, 'utf8')
    const toy = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'examples', 'toy.graph.json'), 'utf8'))
    for (const file of toy.nodes) expect(svg).toContain(`>${file}<`)
    expect(svg).toContain('λ = 0.80')
    expect(svg.match(/class="import[ "]/g)).toHaveLength(toy.edges.length)
  })

  it('exits with 2 on a usage error', () => {
    expect(spawnSync('node', [cli, '--bogus'], { encoding: 'utf8' }).status).toBe(2)
    expect(spawnSync('node', [cli, '--out'], { encoding: 'utf8' }).status).toBe(2)
  })
})
