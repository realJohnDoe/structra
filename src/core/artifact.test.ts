import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { buildArtifact, parseArtifact, serializeArtifact, STEPS, treeAt } from './artifact.ts'
import type { GraphFile } from './graphFile.ts'
import type { OptimalGroup } from './sweep.ts'
import { arbitraryGraph, cliques, graph } from './testGraphs.ts'

const groups = (t: OptimalGroup): OptimalGroup[] => [
  t,
  ...t.children.flatMap((c) => ('children' in c ? groups(c) : [])),
]

const files = (t: OptimalGroup): string[] => t.children.flatMap((c) => ('children' in c ? files(c) : [c.file]))

/** A tree as nested arrays of file paths, for readable assertions. */
const shape = (t: OptimalGroup): unknown => t.children.map((c) => ('children' in c ? shape(c) : c.file))

const steps = Array.from({ length: STEPS }, (_, i) => i)
const run = { numRuns: 60 }

describe('the dendrogram artifact', () => {
  const K8 = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

  it('keeps K8 flat at every step', async () => {
    const g = graph(K8, cliques(K8))
    const artifact = await buildArtifact(g)
    for (const s of steps) expect(shape(treeAt(artifact, g, s))).toEqual(K8)
  })

  it('keeps 2K4 flat at low λ and splits it into its two cliques at high λ', async () => {
    // In between (λ ≈ 0.17–0.35) splitting off one clique alone is cheaper still.
    const g = graph(K8, cliques(K8.slice(0, 4), K8.slice(4)))
    const artifact = await buildArtifact(g)
    expect(shape(treeAt(artifact, g, 10))).toEqual(K8)
    for (const s of steps.filter((s) => s >= 50)) {
      expect(shape(treeAt(artifact, g, s))).toEqual([K8.slice(0, 4), K8.slice(4)])
    }
  })

  it('names the Graph File it belongs to by its hash', async () => {
    const g = graph(['a', 'b'], [['a', 'b']])
    const a = await buildArtifact(g)
    const b = await buildArtifact(graph(['a', 'b'], [['b', 'a']]))
    expect(a.graph).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(a.graph).not.toBe(b.graph)
  })

  it('round-trips through its serialization', async () => {
    const g = graph(['a', 'b', 'c'], [['a', 'b']])
    const text = serializeArtifact(await buildArtifact(g))
    expect(text.endsWith('}\n')).toBe(true)
    expect(serializeArtifact(parseArtifact(text))).toBe(text)
  })

  it('handles graphs with no or one file', async () => {
    for (const g of [graph([], []), graph(['a'], [])]) {
      const artifact = parseArtifact(serializeArtifact(await buildArtifact(g)))
      for (const s of [0, 100]) expect(files(treeAt(artifact, g, s))).toEqual(g.nodes)
    }
  })

  describe('on random graphs', () => {
    const trees = async (g: GraphFile) => {
      const artifact = await buildArtifact(g)
      return steps.map((s) => treeAt(artifact, g, s))
    }

    it('places every file exactly once at every step', async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryGraph(), async (g) => {
          for (const t of await trees(g)) expect(files(t).sort()).toEqual([...g.nodes].sort())
        }),
        run,
      )
    })

    it('nests the trees: a higher step only splits groups of a lower one', async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryGraph(), async (g) => {
          const all = await trees(g)
          for (let s = 1; s < STEPS; s++) {
            const later = new Map(groups(all[s]).map((x) => [x.id, files(x).join('\n')]))
            for (const x of groups(all[s - 1])) expect(later.get(x.id)).toBe(files(x).join('\n'))
          }
        }),
        run,
      )
    })

    it('leaves no single-child groups (except the root of a one-file graph)', async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryGraph(), async (g) => {
          if (g.nodes.length < 2) return
          for (const t of await trees(g)) for (const x of groups(t)) expect(x.children.length).toBeGreaterThan(1)
        }),
        run,
      )
    })

    it('never loses groups as λ rises', async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryGraph(), async (g) => {
          const counts = (await trees(g)).map((t) => groups(t).length)
          for (let s = 1; s < STEPS; s++) expect(counts[s]).toBeGreaterThanOrEqual(counts[s - 1])
          expect(counts[0]).toBe(1)
        }),
        run,
      )
    })

    it('gives byte-identical artifacts on two runs', async () => {
      await fc.assert(
        fc.asyncProperty(arbitraryGraph(), async (g) => {
          const copy = structuredClone(g)
          expect(serializeArtifact(await buildArtifact(g))).toBe(serializeArtifact(await buildArtifact(copy)))
        }),
        run,
      )
    })
  })
})
