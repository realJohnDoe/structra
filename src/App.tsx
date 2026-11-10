import { useEffect, useMemo, useState } from 'react'
import { exampleRepos, exampleRepoTitle, loadExampleRepo, type LoadedRepo } from './app/examples.ts'
import { folderCounts } from './app/folders.ts'
import { Details } from './app/Details.tsx'
import {
  colourTree,
  FILE_COLOUR,
  isDisplayOnly,
  isGroup,
  itemOf,
  keyOf,
  labelOf,
  membersOf,
  pathTo,
  pathToFile,
  resolveItem,
  resolveOpened,
  ROWS,
  type DisplayItem,
  type Item,
  type LayoutContext,
  type TreeNode,
} from './app/icicle.ts'
import { Icicle, IN_COLOUR, OUT_COLOUR } from './app/Icicle.tsx'
import { adjacency } from './app/imports.ts'
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
  /** The selected item, as tapped; re-read against each step's tree. */
  const [selected, setSelected] = useState<Item | null>(null)
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
  const adj = useMemo(() => repo && adjacency(repo.graph), [repo])
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
  const open = useMemo(() => (zoom && ctx ? resolveOpened(zoom, opened, ctx) : null), [zoom, opened, ctx])
  const selection = useMemo(() => (tree && ctx && selected ? resolveItem(tree, selected, ctx) : null), [tree, ctx, selected])

  const zoomTo = (path: OptimalGroup[]) => {
    setZoomIds(path.map((g) => g.id))
    setOpened(null)
  }

  // Tap selects; a second tap zooms into a group or opens a display-only block in its owner.
  const tap = (item: Item) => {
    if (selection?.key !== item.key) return setSelected(item)
    if (item.kind === 'group' && item.node !== zoom) zoomTo(pathTo(tree!, item.node.id)!)
    else if (isDisplayOnly(item) && item.key !== open?.key) {
      setZoomIds(pathTo(tree!, item.owner.id)!.map((g) => g.id))
      setOpened(item)
    }
  }

  // From a list in the details card: select the node, zooming to its parent group unless the node is already in view.
  const pick = (picked: TreeNode | number) => {
    const path = typeof picked === 'number' ? pathToFile(tree!, picked) : isGroup(picked) ? pathTo(tree!, picked.id)?.slice(0, -1) : pathToFile(tree!, picked.index)
    if (!path?.length) return
    const parent = path[path.length - 1]
    const node = typeof picked === 'number' ? parent.children.find((c) => !isGroup(c) && c.index === picked)! : picked
    setSelected(itemOf(node, path))
    const inOpen = open && membersOf(open).some((m) => keyOf(m) === keyOf(node))
    const below = path.length - zoomPath.length
    const inView = !open && below >= 0 && below < ROWS - 1 && path[zoomPath.length - 1] === zoom
    if (!inOpen && !inView) zoomTo(path)
  }

  const groupLabel = (g: OptimalGroup) => {
    const path = pathTo(tree!, g.id)
    return stats!.label(g.id, path && path.length > 1 ? path[path.length - 2].id : null)
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
        {repo && tree && stats && ctx && colours && (
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
              adj={adj!}
              selection={selection}
              onTap={tap}
            />
            {selection ? (
              <Details item={selection} ctx={ctx} stats={stats} adj={adj!} paths={repo.graph.nodes} groupLabel={groupLabel} onPick={pick} />
            ) : (
              <p className="explain">
                Tap a block to select it; tap it again to zoom in or open it. Lines are imports between blocks; they rise to the lowest group
                containing both ends. Selecting highlights <span style={{ color: OUT_COLOUR }}>what it imports</span> and{' '}
                <span style={{ color: IN_COLOUR }}>what imports it</span>. Colour = group, <span style={{ color: FILE_COLOUR }}>grey = file</span>,
                outlined = display only (a folder of the group's own files, or what's too small to draw). Width = number of files.
              </p>
            )}
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
