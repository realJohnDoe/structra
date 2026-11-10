import { describe, expect, it } from 'vitest'
import toyArtifact from '../../examples/toy.dendrogram.json?raw'
import toyText from '../../examples/toy.graph.json?raw'
import { serializeArtifact } from '../core/artifact.ts'
import { buildUploadedRepo, readGraphFile } from './upload.ts'

describe('readGraphFile', () => {
  it('accepts a valid Graph File', () => {
    const r = readGraphFile(toyText)
    expect(r.ok && r.graph).toEqual(JSON.parse(toyText))
  })

  it('rejects text that is not JSON, asking to regenerate it', () => {
    const r = readGraphFile('{ "meta": ')
    expect(r.ok).toBe(false)
    expect(r.ok || r.message).toMatch(/not a valid Graph File.*regenerate/s)
    expect(r.ok || r.details.join('\n')).toMatch(/JSON/)
  })

  it('rejects JSON that fails the Graph File schema, naming the failure', () => {
    const g = JSON.parse(toyText)
    g.meta.version = 2
    const r = readGraphFile(JSON.stringify(g))
    expect(r.ok).toBe(false)
    expect(r.ok || r.message).toMatch(/another structra version/)
    expect(r.ok || r.details.join('\n')).toMatch(/\/meta/)
  })

  it('rejects a Graph File whose rules beyond the schema fail', () => {
    const g = JSON.parse(toyText)
    g.edges.push([g.nodes[0], 'missing.py'])
    const r = readGraphFile(JSON.stringify(g))
    expect(r.ok || r.details.join('\n')).toMatch(/missing\.py/)
  })
})

describe('buildUploadedRepo', () => {
  it('builds the same artifact the offline pipeline ships', async () => {
    const r = readGraphFile(toyText)
    if (!r.ok) throw new Error(r.message)
    const repo = await buildUploadedRepo(r.graph)
    expect(serializeArtifact(repo.artifact)).toBe(toyArtifact)
  })

  it('is titled owner/name after its origin', async () => {
    const r = readGraphFile(toyText)
    if (!r.ok) throw new Error(r.message)
    expect((await buildUploadedRepo(r.graph)).name).toBe('realJohnDoe/structra')
  })
})
