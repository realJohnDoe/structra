import { describe, expect, it } from 'vitest'
import { scoreTree } from './scoreTree.ts'
import { cliques, graph, tree } from './testGraphs.ts'

const ln = Math.log
const K8 = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const [left, right] = [K8.slice(0, 4), K8.slice(4)]

describe('scoreTree', () => {
  it('scores K8 under a flat root', () => {
    const s = scoreTree(tree(K8), graph(K8, cliques(K8)), 0.5)
    expect(s.edgeTerm).toBeCloseTo(ln(8), 12)
    expect(s.nodeTerm).toBeCloseTo(ln(8) / 8, 12)
    expect(s.total).toBeCloseTo(0.5 * ln(8) + 0.5 * (ln(8) / 8), 12)
  })

  it('prefers flat for K8 and two-level for 2K4', () => {
    const flat = tree(K8)
    const twoLevel = tree([left, right])
    const k8 = graph(K8, cliques(K8))
    const twoK4 = graph(K8, cliques(left, right))
    // 2K4 ties at λ = 0.2 (both 0.9 ln 2); two-level wins above it.
    for (const lambda of [0.3, 0.5, 1]) {
      expect(scoreTree(flat, k8, lambda).total).toBeLessThan(scoreTree(twoLevel, k8, lambda).total)
      expect(scoreTree(twoLevel, twoK4, lambda).total).toBeLessThan(scoreTree(flat, twoK4, lambda).total)
    }
    const s = scoreTree(twoLevel, twoK4, 1)
    expect(s.edgeTerm).toBeCloseTo(ln(4), 12)
    expect(s.nodeTerm).toBeCloseTo((ln(2) + 2 * ln(4)) / 8, 12)
    expect(s.total).toBeCloseTo(ln(4), 12)
  })

  it('counts Crossings on both sides of the path, plus the LCA once', () => {
    // a's ancestors below the root: [a,b] (k=2) and [[a,b],c] (k=2); the root (k=3); d's: [d,e] (k=2).
    const t = tree([[['a', 'b'], 'c'], ['d', 'e'], 'f'])
    const s = scoreTree(t, graph(['a', 'b', 'c', 'd', 'e', 'f'], [['a', 'd']]), 1)
    expect(s.edgeTerm).toBeCloseTo(ln(2) + ln(2) + ln(3) + ln(2), 12)
  })

  it('gives edge term 0 when there are no edges', () => {
    const s = scoreTree(tree([['a', 'b'], 'c']), graph(['a', 'b', 'c'], []), 0.7)
    expect(s.edgeTerm).toBe(0)
    expect(s.nodeTerm).toBeCloseTo((2 * ln(2)) / 3, 12)
    expect(s.total).toBeCloseTo(0.3 * s.nodeTerm, 12)
  })

  it('charges a self-import nothing', () => {
    const s = scoreTree(tree([['a', 'b'], 'c']), graph(['a', 'b', 'c'], [['a', 'a']]), 1)
    expect(s.edgeTerm).toBe(0)
  })

  it('makes a mutual import pay twice', () => {
    // a→b and b→a cross [a,b] once each; a→c crosses [a,b] and the root.
    const s = scoreTree(tree([['a', 'b'], 'c']), graph(['a', 'b', 'c'], [['a', 'b'], ['a', 'c'], ['b', 'a']]), 1)
    expect(s.edgeTerm).toBeCloseTo((4 * ln(2)) / 3, 12)
  })

  it('charges single-child nodes nothing', () => {
    const g = graph(['a', 'b'], [['a', 'b']])
    expect(scoreTree(tree([[['a']], 'b']), g, 0.5).total).toBeCloseTo(scoreTree(tree(['a', 'b']), g, 0.5).total, 12)
  })
})
