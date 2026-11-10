import { useEffect, useMemo, useState } from 'react'
import { exampleRepos, loadExampleRepo, type LoadedRepo } from './app/examples.ts'
import { colourTree, isGroup, keyOf, pathTo, type TreeNode } from './app/icicle.ts'
import { Icicle } from './app/Icicle.tsx'
import { summarize } from './app/summary.ts'
import { lambdaOf, readViewState, viewStateSearch } from './app/url.ts'
import { STEPS } from './core/artifact.ts'
import { createGroupStats } from './core/groupStats.ts'
import type { OptimalGroup } from './core/sweep.ts'

export default function App() {
  const [initial] = useState(() => readViewState(window.location.search, exampleRepos))
  const [repoName, setRepoName] = useState(initial.repo)
  const [step, setStep] = useState(initial.step)
  const [repo, setRepo] = useState<LoadedRepo | null>(null)
  /** Dendrogram ids of the groups zoomed through, root first; resolved against each step's tree. */
  const [zoomIds, setZoomIds] = useState<number[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    loadExampleRepo(repoName).then((r) => {
      if (!live) return
      setRepo(r)
      setZoomIds([])
      setSelected(null)
    })
    return () => {
      live = false
    }
  }, [repoName])

  useEffect(() => {
    window.history.replaceState(null, '', viewStateSearch({ repo: repoName, step }))
  }, [repoName, step])

  const stats = useMemo(() => repo && createGroupStats(repo.artifact, repo.graph), [repo])
  const tree = repo && repo.treeAt(step)
  const colours = useMemo(() => tree && colourTree(tree), [tree])

  // The deepest zoomed group that still exists at this step (a lower λ can merge it away).
  const zoomPath = useMemo(() => {
    if (!tree) return []
    for (let i = zoomIds.length - 1; i >= 0; i--) {
      const path = pathTo(tree, zoomIds[i])
      if (path) return path
    }
    return [tree]
  }, [tree, zoomIds])

  const zoomTo = (path: OptimalGroup[]) => setZoomIds(path.map((g) => g.id))

  const tap = (node: TreeNode) => {
    const key = keyOf(node)
    if (selected !== key) return setSelected(key)
    if (isGroup(node) && node !== zoomPath[zoomPath.length - 1]) zoomTo(pathTo(tree!, node.id)!)
  }

  return (
    <div className="app">
      <header className="header">
        <span className="brand">Structra</span>
        <label>
          <span className="visually-hidden">Example Repo</span>
          <select value={repoName} onChange={(e) => setRepoName(e.target.value)}>
            {exampleRepos.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      </header>
      <main className="main">
        {tree && stats && colours && (
          <>
            <nav aria-label="Breadcrumb" className="breadcrumb">
              {zoomPath.map((g, i) => {
                const label = stats.label(g.id, i ? zoomPath[i - 1].id : null)
                return i === zoomPath.length - 1 ? (
                  <span key={g.id} aria-current="location">
                    {label}
                  </span>
                ) : (
                  <span key={g.id}>
                    <button type="button" onClick={() => zoomTo(zoomPath.slice(0, i + 1))}>
                      {label}
                    </button>
                    <span aria-hidden="true"> › </span>
                  </span>
                )
              })}
            </nav>
            <Icicle
              zoom={zoomPath[zoomPath.length - 1]}
              zoomParent={zoomPath.length > 1 ? zoomPath[zoomPath.length - 2] : null}
              stats={stats}
              colours={colours}
              selected={selected}
              onTap={tap}
            />
            <section className="details" aria-label="Details">
              {selected ? 'Details of the selection come in a later version.' : 'Tap a block to select it; tap it again to zoom in.'}
            </section>
          </>
        )}
      </main>
      <footer className="balance">
        <label className="balance-label" htmlFor="lambda">
          Balance λ <output>{lambdaOf(step)}</output>
        </label>
        <div className="balance-track">
          <span>flat</span>
          <input
            id="lambda"
            aria-label="Balance λ"
            type="range"
            min={0}
            max={1}
            step={1 / (STEPS - 1)}
            value={lambdaOf(step)}
            onChange={(e) => setStep(Math.round(Number(e.target.value) * (STEPS - 1)))}
          />
          <span>deep</span>
        </div>
        <output data-testid="summary">{tree && summarize(tree)}</output>
      </footer>
    </div>
  )
}
