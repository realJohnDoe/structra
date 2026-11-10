import { useEffect, useMemo, useState } from 'react'
import { exampleRepos, exampleRepoTitle, loadExampleRepo, type LoadedRepo } from './app/examples.ts'
import { folderCounts } from './app/folders.ts'
import { colourTree, labelOf, pathTo, resolveOpened, type DisplayItem, type Item, type LayoutContext } from './app/icicle.ts'
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
  /** The display-only block opened in its owner group, if any. */
  const [opened, setOpened] = useState<DisplayItem | null>(null)

  useEffect(() => {
    let live = true
    loadExampleRepo(repoName).then((r) => {
      if (!live) return
      setRepo(r)
      setZoomIds([])
      setSelected(null)
      setOpened(null)
    })
    return () => {
      live = false
    }
  }, [repoName])

  useEffect(() => {
    window.history.replaceState(null, '', viewStateSearch({ repo: repoName, step }))
  }, [repoName, step])

  const stats = useMemo(() => repo && createGroupStats(repo.artifact, repo.graph), [repo])
  const ctx = useMemo(
    (): LayoutContext | null =>
      repo &&
      stats && {
        label: (g, parent) => stats.label(g.id, parent?.id ?? null),
        folder: (g) => stats.of(g.id).folder,
        counts: folderCounts(repo.graph.nodes),
      },
    [repo, stats],
  )
  const tree = repo && repo.treeAt(step)
  const colours = useMemo(() => tree && ctx && colourTree(tree, ctx), [tree, ctx])

  // The deepest zoomed group that still exists at this step (a lower λ can merge it away).
  const zoomPath = useMemo(() => {
    if (!tree) return []
    for (let i = zoomIds.length - 1; i >= 0; i--) {
      const path = pathTo(tree, zoomIds[i])
      if (path) return path
    }
    return [tree]
  }, [tree, zoomIds])

  const zoom = zoomPath[zoomPath.length - 1]
  const open = useMemo(() => (zoom ? resolveOpened(zoom, opened) : null), [zoom, opened])

  const zoomTo = (path: OptimalGroup[]) => {
    setZoomIds(path.map((g) => g.id))
    setOpened(null)
  }

  // Tap selects; a second tap zooms into a group or opens a display-only block in its owner.
  const tap = (item: Item) => {
    if (selected !== item.key) return setSelected(item.key)
    if (item.kind === 'group' && item.node !== zoom) zoomTo(pathTo(tree!, item.node.id)!)
    else if ((item.kind === 'folder' || item.kind === 'more') && item.key !== open?.key) {
      setZoomIds(pathTo(tree!, item.owner.id)!.map((g) => g.id))
      setOpened(item)
    }
  }

  return (
    <div className="app">
      <header className="header">
        <span className="brand">Structra</span>
        <label>
          <span className="visually-hidden">Example Repo</span>
          <select value={repoName} onChange={(e) => setRepoName(e.target.value)}>
            {exampleRepos.map((name) => (
              <option key={name} value={name}>
                {exampleRepoTitle(name)}
              </option>
            ))}
          </select>
        </label>
      </header>
      <main className="main">
        {tree && stats && ctx && colours && (
          <>
            <nav aria-label="Breadcrumb" className="breadcrumb">
              {zoomPath.map((g, i) => {
                const label = stats.label(g.id, i ? zoomPath[i - 1].id : null)
                return i === zoomPath.length - 1 && !open ? (
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
              {open && <span aria-current="location">{labelOf(open, ctx)}</span>}
            </nav>
            <Icicle
              zoom={zoom}
              zoomParent={zoomPath.length > 1 ? zoomPath[zoomPath.length - 2] : null}
              opened={open}
              ctx={ctx}
              colours={colours}
              selected={selected}
              onTap={tap}
            />
            <section className="details" aria-label="Details">
              {selected ? 'Details of the selection come in a later version.' : 'Tap a block to select it; tap it again to zoom in or open it.'}
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
