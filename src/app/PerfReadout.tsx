import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { STEPS } from '../core/artifact.ts'
import type { OptimalGroup } from '../core/sweep.ts'
import type { LoadedRepo } from './examples.ts'
import { afterPaint, timingReport } from './perf.ts'

/** Whether this page has painted a tree yet: only its first one is timed from page start. */
let painted = false

interface Props {
  repo: LoadedRepo
  tree: OptimalGroup
  step: number
  setStep: (step: number) => void
}

/**
 * The `?perf` readout, for checking ADR 0002's budget on a phone (#49). First tree: page start (performance.now()'s
 * origin) to the first tree painted. Redraw: a slider input to the next tree painted, so dragging records every redraw;
 * Run sets every λ step in turn instead. Keyed by repo, so switching repo starts afresh.
 */
export function PerfReadout({ repo, tree, step, setStep }: Props) {
  const [firstTree, setFirstTree] = useState<number | null | undefined>(() => (painted ? undefined : null))
  const [redraws, setRedraws] = useState<number[]>([])
  const [running, setRunning] = useState(false)
  /** When the input that this commit draws happened. */
  const inputAt = useRef<number | null>(null)
  const onPainted = useRef<(() => void) | null>(null)
  const first = useRef(true)

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
    afterPaint().then(() => {
      const now = performance.now()
      if (first.current) {
        first.current = false
        if (!painted) setFirstTree(now)
        painted = true
      } else if (at !== null) setRedraws((r) => [...r, now - at])
      onPainted.current?.()
    })
  }, [tree])

  const run = async () => {
    setRunning(true)
    setRedraws([])
    for (let s = 0; s < STEPS; s++) {
      if (s === step) continue
      await new Promise<void>((resolve) => {
        onPainted.current = resolve
        inputAt.current = performance.now()
        setStep(s)
      })
    }
    onPainted.current = null
    setRunning(false)
  }

  const lines = timingReport({ repoName: repo.name, files: repo.graph.nodes.length, firstTree, redraws })
  const text = [...lines, `${navigator.userAgent} · ${navigator.hardwareConcurrency} cores`].join('\n')
  return (
    <section className="perf" aria-label="Timing">
      <pre>{text}</pre>
      <p>Steps already drawn are cached and redraw faster; reload for a first pass.</p>
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
