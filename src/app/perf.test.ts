import { describe, expect, it } from 'vitest'
import { timingReport } from './perf.ts'

describe('timingReport', () => {
  it('names each budget, its measurement and whether it is met', () => {
    const report = timingReport({ repo: 'facebook/react', files: 4445, firstTree: 640.4, redraws: [30, 120, 40, 50] })
    expect(report).toEqual([
      'facebook/react, 4445 files',
      'first tree: 640 ms from page start (budget 1000 ms: met)',
      'redraw: median 45 ms, max 120 ms over 4 (budget 100 ms: met)',
    ])
  })

  it('reports a missed budget, and what is not measured yet', () => {
    expect(timingReport({ repo: 'r', files: 1, firstTree: 1200, redraws: [] }).slice(1)).toEqual([
      'first tree: 1200 ms from page start (budget 1000 ms: MISSED)',
      'redraw: move the slider, or tap Run',
    ])
    expect(timingReport({ repo: 'r', files: 1, firstTree: null, redraws: [101, 150] })[2]).toBe(
      'redraw: median 126 ms, max 150 ms over 2 (budget 100 ms: MISSED)',
    )
  })
})
