import { useEffect, useMemo, useRef, useState } from 'react'
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
import { PerfReadout } from './app/PerfReadout.tsx'
import { adjacency } from './app/imports.ts'
import { summarize } from './app/summary.ts'
import { buildUploadedRepo, readGraphFile, type UploadReading } from './app/upload.ts'
import { lambdaOf, readViewState, viewStateSearch } from './app/url.ts'
import { STEPS } from './core/artifact.ts'
import { createGroupStats } from './core/groupStats.ts'
import type { OptimalGroup } from './core/sweep.ts'

/** The repo menu's values for "Your own Graph File…" and for the uploaded one once shown. */
const UPLOAD = ':upload'
const UPLOADED = ':uploaded'

/** Resolves after the browser has painted, so a loading state shows before a long synchronous build. */
const afterPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve)))

export default function App() {
  const [initial] = useState(() => readViewState(window.location.search, exampleRepos))
  /** The Example Repo chosen in the menu, or null once an uploaded Graph File is shown. */
  const [repoName, setRepoName] = useState<string | null>(initial.repo)
  const [step, setStep] = useState(initial.step)
  const [repo, setRepo] = useState<LoadedRepo | null>(null)
  /** The uploaded Graph File being built, by file name. */
  const [building, setBuilding] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<(Extract<UploadReading, { ok: false }> & { file: string }) | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  /** Counts loads, so only the latest one started is shown. */
  const loads = useRef(0)
  /** Dendrogram ids of the groups zoomed through, root first; resolved against each step's tree. */
  const [zoomIds, setZoomIds] = useState<number[]>([])
  /** The selected item, as tapped; re-read against each step's tree. */
  const [selected, setSelected] = useState<Item | null>(null)
  /** The display-only block opened in its owner group, if any. */
  const [opened, setOpened] = useState<DisplayItem | null>(null)

  const show = (load: number, r: LoadedRepo) => {
    if (load !== loads.current) return
    setRepo(r)
    setZoomIds([])
    setSelected(null)
    setOpened(null)
  }

  const chooseExample = (name: string) => {
    const load = ++loads.current
    setRepoName(name)
    setBuilding(null)
    setUploadError(null)
    loadExampleRepo(name).then((r) => show(load, r))
  }

  useEffect(() => {
    const load = ++loads.current
    loadExampleRepo(initial.repo).then((r) => show(load, r))
  }, [initial])

  // An invalid file leaves the shown repo in place; a valid one is built here, as offline, then shown.
  const upload = async (file: File) => {
    const load = ++loads.current
    setUploadError(null)
    setBuilding(file.name)
    await afterPaint()
    const reading = readGraphFile(await file.text())
    if (load !== loads.current) return // another repo or file was chosen meanwhile
    if (!reading.ok) {
      setBuilding(null)
      return setUploadError({ ...reading, file: file.name })
    }
    const r = await buildUploadedRepo(reading.graph)
    if (load !== loads.current) return
    setBuilding(null)
    setRepoName(null)
    show(load, r)
  }

  // Dropping a file anywhere on the page uploads it.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer?.files[0]
      if (file) upload(file)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  })

  useEffect(() => {
    window.history.replaceState(null, '', viewStateSearch({ repo: repoName, step, perf: initial.perf }))
  }, [repoName, step, initial])

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
    <div className={dragging ? 'app dragging' : 'app'}>
      <header className="header">
        <span className="brand">Structra</span>
        <label>
          <span className="visually-hidden">Example Repo</span>
          <select
            value={repoName ?? UPLOADED}
            onChange={(e) => {
              if (e.target.value === UPLOAD) fileInput.current?.click()
              else if (e.target.value !== UPLOADED) chooseExample(e.target.value)
            }}
          >
            {exampleRepos.map((name) => (
              <option key={name} value={name}>
                {exampleRepoTitle(name)}
              </option>
            ))}
            <hr />
            {repoName === null && repo && <option value={UPLOADED}>{repo.name} (your file)</option>}
            <option value={UPLOAD}>Your own Graph File…</option>
          </select>
        </label>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label="Your own Graph File"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) upload(file)
          }}
        />
      </header>
      {initial.perf && repo && tree && <PerfReadout repo={repo.name} files={repo.graph.nodes.length} tree={tree} step={step} setStep={setStep} />}
      {building && (
        <p className="notice" role="status">
          Loading {building} and building its Optimal Trees…
        </p>
      )}
      {uploadError && (
        <div className="notice error" role="alert">
          <p>
            <strong>{uploadError.file}</strong>: {uploadError.message}
          </p>
          <ul>
            {uploadError.details.slice(0, 5).map((d) => (
              <li key={d}>{d}</li>
            ))}
            {uploadError.details.length > 5 && <li>and {uploadError.details.length - 5} more</li>}
          </ul>
          <button type="button" onClick={() => setUploadError(null)}>
            Dismiss
          </button>
        </div>
      )}
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
