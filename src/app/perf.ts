/** ADR 0002's time budget on a mid-range phone, in ms. */
const FIRST_TREE_BUDGET = 1000
const REDRAW_BUDGET = 100

/** Resolves once the browser has painted the current frame. */
export const afterPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve)))

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const ms = (x: number) => `${Math.round(x)} ms`
const verdict = (x: number, budget: number) => `(budget ${ms(budget)}: ${x < budget ? 'met' : 'MISSED'})`

/**
 * The `?perf` readout's lines: the first tree's time from page start, and the median and max slider redraw.
 * The first tree is timed only for the repo the page opened with (`firstTree` undefined for any other).
 */
export function timingReport({ repoName, files, firstTree, redraws }: { repoName: string; files: number; firstTree: number | null | undefined; redraws: number[] }): string[] {
  const m = redraws.length ? median(redraws) : 0
  return [
    `${repoName}, ${files} files`,
    firstTree === undefined ? 'first tree: reload the page on this repo to time it' : firstTree === null ? 'first tree: …' : `first tree: ${ms(firstTree)} from page start ${verdict(firstTree, FIRST_TREE_BUDGET)}`,
    redraws.length
      ? `redraw: median ${ms(m)}, max ${ms(Math.max(...redraws))} over ${redraws.length} ${verdict(m, REDRAW_BUDGET)}`
      : 'redraw: move the slider, or tap Run',
  ]
}
