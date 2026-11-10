import { useMemo } from 'react'
import type { GroupStatsCache } from '../core/groupStats.ts'
import type { OptimalGroup } from '../core/sweep.ts'
import { isGroup, keyOf, labelOf, layoutIcicle, ROW_HEIGHT, ROWS, type TreeNode } from './icicle.ts'

interface Props {
  zoom: OptimalGroup
  zoomParent: OptimalGroup | null
  stats: GroupStatsCache
  colours: Map<string, string>
  selected: string | null
  onTap: (node: TreeNode) => void
}

export function Icicle({ zoom, zoomParent, stats, colours, selected, onTap }: Props) {
  const blocks = useMemo(() => layoutIcicle(zoom, zoomParent, ROWS), [zoom, zoomParent])
  return (
    <div className="icicle" data-testid="icicle" style={{ height: ROWS * ROW_HEIGHT }}>
      {blocks.map(({ node, parent, row, left, width }) => {
        const key = keyOf(node)
        const label = labelOf(node, parent, stats)
        return (
          <button
            key={key}
            type="button"
            className={isGroup(node) ? 'block group' : 'block file'}
            aria-pressed={selected === key}
            aria-label={label}
            title={label}
            onClick={() => onTap(node)}
            style={{
              left: `${left * 100}%`,
              width: `${width * 100}%`,
              top: row * ROW_HEIGHT,
              height: ROW_HEIGHT,
              background: colours.get(key),
            }}
          >
            <span>{label}</span>
          </button>
        )
      })}
    </div>
  )
}
