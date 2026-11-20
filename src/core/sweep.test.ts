import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { buildDendrogram } from './dendrogram.ts'
import { scoreTree } from './scoreTree.ts'
import { Contraction } from './sweep.ts'
import { arbitraryGraph } from './testGraphs.ts'

describe('Contraction.delta', () => {
  it('agrees with scoreTree for every split from any contraction', () => {
    fc.assert(
      fc.property(arbitraryGraph(), fc.infiniteStream(fc.boolean()), fc.double({ min: 0, max: 1, noNaN: true }), (graph, coins, lambda) => {
        const d = buildDendrogram(graph)
        const nodes = new Contraction(d, graph).contractible()
        const initial = nodes.filter(() => coins.next().value)
        // Splits can't be undone, so each probe starts from a fresh contraction.
        const from = () => {
          const c = new Contraction(d, graph)
          for (const v of initial) c.toggle(v)
          return c
        }
        const base = from()
        const before = scoreTree(base.tree(), graph, lambda).total
        for (const v of nodes) {
          if (base.survives(v)) continue
          const delta = base.delta(v, lambda)
          const split = from()
          split.toggle(v)
          expect(delta).toBeCloseTo(scoreTree(split.tree(), graph, lambda).total - before, 10)
        }
      }),
    )
  })
})
