import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { buildDendrogram } from './dendrogram.ts'
import { scoreTree } from './scoreTree.ts'
import { Contraction } from './sweep.ts'
import { arbitraryGraph } from './testGraphs.ts'

describe('Contraction.delta', () => {
  it('agrees with scoreTree for every split and merge from any contraction', () => {
    fc.assert(
      fc.property(arbitraryGraph(), fc.infiniteStream(fc.boolean()), fc.double({ min: 0, max: 1, noNaN: true }), (graph, coins, lambda) => {
        const d = buildDendrogram(graph)
        const c = new Contraction(d, graph)
        for (const v of c.contractible()) if (coins.next().value) c.toggle(v)
        const before = scoreTree(c.tree(), graph, lambda).total
        for (const v of c.contractible()) {
          const delta = c.delta(v, lambda)
          c.toggle(v)
          expect(delta).toBeCloseTo(scoreTree(c.tree(), graph, lambda).total - before, 10)
          c.toggle(v)
        }
      }),
    )
  })
})
