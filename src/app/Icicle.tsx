import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { OptimalGroup } from '../core/sweep.ts'
import {
  colourOf,
  isDisplayOnly,
  labelOf,
  layoutView,
  ROW_HEIGHT,
  ROWS,
  sizeOf,
  type Block,
  type DisplayItem,
  type Item,
  type LayoutContext,
} from './icicle.ts'
import { importLines, type Adjacency, type ImportLine } from './imports.ts'

interface Props {
  zoom: OptimalGroup
  zoomParent: OptimalGroup | null
  opened: DisplayItem | null
  ctx: LayoutContext
  colours: Map<string, string>
  adj: Adjacency
  selection: Item | null
  onTap: (item: Item) => void
}

/** Lime: what the selection imports. Orange: what imports it. */
export const OUT_COLOUR = '#c8f060'
export const IN_COLOUR = '#ff9a3c'
/** Per kind of line: its colour, and its place in drawing order (highlighted lines on top). */
const LINE_STYLE: Record<ImportLine['kind'], { colour: string; order: number }> = {
  other: { colour: '#d8dde4', order: 0 },
  in: { colour: IN_COLOUR, order: 1 },
  out: { colour: OUT_COLOUR, order: 2 },
}

/** Import lines leave and reach blocks at their top edge, rising to the middle of their lowest common ancestor's row. */
function linePath(line: ImportLine, blocks: Block[]): string {
  const at = (i: number) => {
    const b = blocks[i]
    return [b.left + b.width / 2, b.row * ROW_HEIGHT + 2] as const
  }
  const [ax, ay] = at(line.a)
  if (line.b === null) return `M${ax},${ay} L${ax},1`
  const [bx, by] = at(line.b)
  const apex = line.apexRow! * ROW_HEIGHT + ROW_HEIGHT / 2
  // A quadratic Bézier peaks halfway to its control point.
  return `M${ax},${ay} Q${(ax + bx) / 2},${2 * apex - (ay + by) / 2} ${bx},${by}`
}

function Lines({ blocks, adj, selection, width }: { blocks: Block[]; adj: Adjacency; selection: Item | null; width: number }) {
  const lines = useMemo(
    () => importLines(blocks, adj, selection).sort((x, y) => LINE_STYLE[x.kind].order - LINE_STYLE[y.kind].order),
    [blocks, adj, selection],
  )
  const highlighted = lines.some((l) => l.kind !== 'other')
  const otherOpacity = highlighted ? 0.1 : lines.length > 250 ? 0.22 : 0.4
  return (
    <svg className="import-lines" data-testid="import-lines" width={width} height={ROWS * ROW_HEIGHT} aria-hidden="true">
      {lines.map((l) => (
        <path
          key={`${l.kind} ${l.a} ${l.b}`}
          d={linePath(l, blocks)}
          data-kind={l.kind}
          data-stub={l.b === null || undefined}
          stroke={LINE_STYLE[l.kind].colour}
          strokeOpacity={l.kind === 'other' ? otherOpacity : 0.85}
          strokeDasharray={l.b === null ? '2 3' : undefined}
        />
      ))}
    </svg>
  )
}

/** Block colours as CSS custom properties: solid for groups and files, outlined in the owner's colour for display-only blocks. */
const colourStyle = (item: Item, colours: Map<string, string>): CSSProperties => ({ '--c': colourOf(item, colours) }) as CSSProperties

const kindClass = (item: Item) => `block ${item.kind} ${isDisplayOnly(item) ? 'outlined' : 'solid'}`

function Text({ item, ctx, width }: { item: Item; ctx: LayoutContext; width: number }) {
  const label = labelOf(item, ctx)
  const size = sizeOf(item, width)
  return (
    <>
      {width >= 30 && <span className="block-label">{label}</span>}
      {width >= 44 && size && <span className="block-size">{size}</span>}
    </>
  )
}

export function Icicle({ zoom, zoomParent, opened, ctx, colours, adj, selection, onTap }: Props) {
  const selected = selection?.key ?? null
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const view = useMemo(
    () => (width > 0 ? layoutView(zoom, zoomParent, opened, width, ctx) : null),
    [zoom, zoomParent, opened, width, ctx],
  )

  const button = (item: Item, style: CSSProperties, w: number, key = item.key) => {
    const label = labelOf(item, ctx)
    const size = sizeOf(item)
    // Display-only blocks are named with their size ("tests/ · 22 of 41 here"); groups and files by their label.
    const name = isDisplayOnly(item) ? `${label} · ${size}` : label
    return (
      <button
        key={key}
        type="button"
        className={`${kindClass(item)}${w < 30 ? ' narrow' : ''}`}
        data-kind={item.kind}
        aria-pressed={selected === item.key}
        aria-label={name}
        title={size ? `${label} · ${size}` : label}
        onClick={() => onTap(item)}
        style={{ ...colourStyle(item, colours), ...style }}
      >
        <Text item={item} ctx={ctx} width={w} />
      </button>
    )
  }

  return (
    <div ref={ref} className="icicle" data-testid="icicle" style={{ height: ROWS * ROW_HEIGHT }}>
      {view?.kind === 'blocks' &&
        view.blocks.map(({ item, row, left, width: w }) =>
          button(item, { left, width: w, top: row * ROW_HEIGHT, height: ROW_HEIGHT }, w, `${item.key}@${row}`),
        )}
      {view?.kind === 'blocks' && <Lines blocks={view.blocks} adj={adj} selection={selection} width={width} />}
      {view?.kind === 'grid' && (
        <>
          {/* The header takes its owner's colour: outlined for an opened folder, solid for "+N more", as in the prototype. */}
          <div className={`grid-header block ${view.header.kind} ${view.header.kind === 'folder' ? 'outlined' : 'solid'}`} style={colourStyle(view.header, colours)}>
            <span className="block-label">{labelOf(view.header, ctx)}</span>
            <span className="block-size">
              {sizeOf(view.header)} · {view.tiles.length} items
            </span>
          </div>
          <div className="tile-grid" data-testid="tile-grid" style={{ height: (ROWS - 1) * ROW_HEIGHT }}>
            {view.tiles.map((item) => button(item, {}, Infinity))}
          </div>
        </>
      )}
    </div>
  )
}
