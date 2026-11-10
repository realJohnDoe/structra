import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { STEPS } from '../core/artifact.ts'
import type { OptimalGroup } from '../core/sweep.ts'
import { timingReport } from './perf.ts'

/** Calls back once the browser has painted the current frame. */
const afterPaint = (f: () => void) => requestAnimationFrame(() => setTimeout(f))

interface Props {
  repo: string
  files: number
  tree: OptimalGroup
  step: number
  setStep: (step: number) => void
}

/**
 * The `?perf` readout, for checking ADR 0002's budget on a phone (#49). First tree: page start (performance.now()'s
 * origin) to the first tree painted. Redraw: a slider input to the next tree painted, so dragging records every redraw;
 * Run sets every λ step in turn instead.
 */
export function PerfReadout({ repo, files, tree, step, setStep }: Props) {
  const [firstTree, setFirstTree] = useState<number | null>(null)
  const [redraws, setRedraws] = useState<number[]>([])
  const [running, setRunning] = useState(false)
  /** When the input that this commit draws happened. */
  const inputAt = useRef<number | null>(null)
  const painted = useRef<(() => void) | null>(null)
  const measuring = useRef(false)

  useEffect(() => {
    // A range input fires only when its value, and so the λ step, changes.
    const onInput = (e: Event) => {
      if ((e.target as Element).id === 'lambda') inputAt.current = e.timeStamp
    }
    document.addEventListener('input', onInput, true)
    return () => document.removeEventListener('input', onInput, true)
  }, [])

  useLayoutEffect(() => {
    const at = inputAt.current
    inputAt.current = null
    afterPaint(() => {
      const now = performance.now()
      if (!measuring.current) {
        measuring.current = true
        setFirstTree(now)
      } else if (at !== null) setRedraws((r) => [...r, now - at])
      painted.current?.()
    })
  }, [tree])

  const run = async () => {
    setRunning(true)
    setRedraws([])
    for (let s = 0; s < STEPS; s++) {
      if (s === step) continue
      await new Promise<void>((resolve) => {
        painted.current = resolve
        inputAt.current = performance.now()
        setStep(s)
      })
    }
    painted.current = null
    setRunning(false)
  }

  const lines = timingReport({ repo, files, firstTree, redraws })
  const text = [...lines, `${navigator.userAgent} · ${navigator.hardwareConcurrency} cores`].join('\n')
  return (
    <section className="perf" aria-label="Timing">
      <pre>{text}</pre>
      <button type="button" onClick={run} disabled={running}>
        {running ? 'Running…' : 'Run λ 0→1'}
      </button>{' '}
      <button type="button" onClick={() => setRedraws([])}>
        Clear
      </button>{' '}
      <button type="button" onClick={() => navigator.clipboard?.writeText(text)}>
        Copy
      </button>
    </section>
  )
}
