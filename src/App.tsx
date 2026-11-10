import { useEffect, useMemo, useRef, useState } from 'react'
import { exampleRepos, exampleRepoTitle, loadExampleRepo, type LoadedRepo } from './app/examples.ts'
import { folderCounts } from './app/folders.ts'
import { colourTree, isDisplayOnly, labelOf, pathTo, resolveOpened, type DisplayItem, type Item, type LayoutContext } from './app/icicle.ts'
import { Icicle } from './app/Icicle.tsx'
import { summarize } from './app/summary.ts'
import { buildUploadedRepo, readGraphFile } from './app/upload.ts'
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
  const [uploadError, setUploadError] = useState<{ file: string; message: string; details: string[] } | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  /** Counts loads, so only the latest one started is shown. */
  const loads = useRef(0)
  /** Dendrogram ids of the groups zoomed through, root first; resolved against each step's tree. */
  const [zoomIds, setZoomIds] = useState<number[]>([])
  const [selected, setSelected] = useState<string | null>(null)
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
    const before = loads.current
    setUploadError(null)
    setBuilding(file.name)
    await afterPaint()
    const reading = readGraphFile(await file.text())
    if (loads.current !== before) return // another repo was chosen meanwhile
    if (!reading.ok) {
      setBuilding(null)
      return setUploadError({ file: file.name, message: reading.message, details: reading.details })
    }
    const load = ++loads.current
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
  const open = useMemo(() => (zoom && ctx ? resolveOpened(zoom, opened, ctx) : null), [zoom, opened, ctx])

  const zoomTo = (path: OptimalGroup[]) => {
    setZoomIds(path.map((g) => g.id))
    setOpened(null)
  }

  // Tap selects; a second tap zooms into a group or opens a display-only block in its owner.
  const tap = (item: Item) => {
    if (selected !== item.key) return setSelected(item.key)
    if (item.kind === 'group' && item.node !== zoom) zoomTo(pathTo(tree!, item.node.id)!)
    else if (isDisplayOnly(item) && item.key !== open?.key) {
      setZoomIds(pathTo(tree!, item.owner.id)!.map((g) => g.id))
      setOpened(item)
    }
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
            {repoName === null && repo && <option value={UPLOADED}>{repo.name}</option>}
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
