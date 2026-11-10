import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const cli = join(import.meta.dirname, 'structra-dendrogram.ts')
const examples = join(import.meta.dirname, '..', 'examples')

describe('structra-dendrogram', () => {
  it('writes the committed dendrogram artifact and snapshot for the toy Graph File', () => {
    const out = mkdtempSync(join(tmpdir(), 'structra-'))
    execFileSync('node', [cli, join(examples, 'toy.graph.json'), '--out-dir', out])
    for (const name of ['toy.dendrogram.json', 'toy.snapshot.json']) {
      expect(readFileSync(join(out, name), 'utf8'), name).toBe(readFileSync(join(examples, name), 'utf8'))
    }
  })

  it('snapshots all 101 steps, from one flat group upwards', () => {
    const snapshot = JSON.parse(readFileSync(join(examples, 'toy.snapshot.json'), 'utf8'))
    expect(snapshot.steps).toHaveLength(101)
    expect(snapshot.steps[0]).toMatchObject({ lambda: '0.00', groups: 1 })
    expect(snapshot.steps[100].lambda).toBe('1.00')
  })

  it('refuses an invalid Graph File with exit code 1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'structra-'))
    const bad = join(dir, 'bad.graph.json')
    writeFileSync(bad, JSON.stringify({ meta: {}, nodes: ['b', 'a'], edges: [] }))
    const r = spawnSync('node', [cli, bad, '--out-dir', dir], { encoding: 'utf8' })
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/bad\.graph\.json/)
  })

  it('exits with 2 on a usage error', () => {
    expect(spawnSync('node', [cli], { encoding: 'utf8' }).status).toBe(2)
    expect(spawnSync('node', [cli, 'x.json'], { encoding: 'utf8' }).status).toBe(2)
  })
})
