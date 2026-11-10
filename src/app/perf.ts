/** ADR 0002's time budget on a mid-range phone, in ms. */
export const FIRST_TREE_BUDGET = 1000
export const REDRAW_BUDGET = 100

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const ms = (x: number) => `${Math.round(x)} ms`
const verdict = (x: number, budget: number) => `(budget ${ms(budget)}: ${x < budget ? 'met' : 'MISSED'})`

/** The `?perf` readout's lines: the first tree's time from page start, and the median and max slider redraw. */
export function timingReport({ repo, files, firstTree, redraws }: { repo: string; files: number; firstTree: number | null; redraws: number[] }): string[] {
  const m = redraws.length ? median(redraws) : 0
  return [
    `${repo}, ${files} files`,
    firstTree === null ? 'first tree: …' : `first tree: ${ms(firstTree)} from page start ${verdict(firstTree, FIRST_TREE_BUDGET)}`,
    redraws.length
      ? `redraw: median ${ms(m)}, max ${ms(Math.max(...redraws))} over ${redraws.length} ${verdict(m, REDRAW_BUDGET)}`
      : 'redraw: move the slider, or tap Run',
  ]
}
