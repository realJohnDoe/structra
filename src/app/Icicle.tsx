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
  type DisplayItem,
  type Item,
  type LayoutContext,
} from './icicle.ts'

interface Props {
  zoom: OptimalGroup
  zoomParent: OptimalGroup | null
  opened: DisplayItem | null
  ctx: LayoutContext
  colours: Map<string, string>
  selected: string | null
  onTap: (item: Item) => void
}

/** Block colours as CSS custom properties: solid for groups and files, outlined in the owner's colour for display-only blocks. */
const colourStyle = (item: Item, colours: Map<string, string>): CSSProperties => ({ '--c': colourOf(item, colours) }) as CSSProperties

const kindClass = (item: Item) => `block ${item.kind} ${isDisplayOnly(item) ? 'outlined' : 'solid'}`

function Lines({ item, ctx, width }: { item: Item; ctx: LayoutContext; width: number }) {
  const label = labelOf(item, ctx)
  const size = sizeOf(item, width)
  return (
    <>
      {width >= 30 && <span className="block-label">{label}</span>}
      {width >= 44 && size && <span className="block-size">{size}</span>}
    </>
  )
}

export function Icicle({ zoom, zoomParent, opened, ctx, colours, selected, onTap }: Props) {
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
        <Lines item={item} ctx={ctx} width={w} />
      </button>
    )
  }

  return (
    <div ref={ref} className="icicle" data-testid="icicle" style={{ height: ROWS * ROW_HEIGHT }}>
      {view?.kind === 'blocks' &&
        view.blocks.map(({ item, row, left, width: w }) =>
          button(item, { left, width: w, top: row * ROW_HEIGHT, height: ROW_HEIGHT }, w, `${item.key}@${row}`),
        )}
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
