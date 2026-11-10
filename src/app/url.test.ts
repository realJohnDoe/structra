import { describe, expect, it } from 'vitest'
import { readViewState, viewStateSearch } from './url.ts'

describe('the perf flag', () => {
  it('is read from ?perf', () => {
    expect(readViewState('?repo=react&perf', ['flask', 'react']).perf).toBe(true)
    expect(readViewState('?repo=react', ['flask', 'react']).perf).toBe(false)
  })

  it('survives rewriting the URL', () => {
    expect(viewStateSearch({ repo: 'react', step: 45, perf: true })).toBe('?repo=react&lambda=0.45&perf')
    expect(viewStateSearch({ repo: null, step: 45, perf: false })).toBe('?lambda=0.45')
  })
})
