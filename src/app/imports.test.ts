import { describe, expect, it } from 'vitest'
import type { OptimalFile, OptimalGroup } from '../core/sweep.ts'
import { labelOf, layoutView, type Block, type Item, type LayoutContext, type TreeNode } from './icicle.ts'
import { adjacency, importLines, type ImportLine } from './imports.ts'
import { files, setup, type Spec } from './testTrees.ts'

const pathsOf = (t: TreeNode): string[] => ('children' in t ? t.children.flatMap(pathsOf) : [t.file])
const nodes = (root: OptimalGroup) => {
  const all: TreeNode[] = []
  const walk = (t: TreeNode) => {
    all.push(t)
    if ('children' in t) t.children.forEach(walk)
  }
  walk(root)
  return all
}

/** Lays `spec` out at `width` px, zoomed into group `zoomId` (default the root), with imports between the named files. */
function scene(spec: Spec, edges: [string, string][], width = 1000, zoomId?: number) {
  const { root, ctx } = setup(spec)
  // `setup` numbers files in spec order, which is the order `pathsOf` returns.
  const adj = adjacency({ nodes: pathsOf(root), edges })
  const zoom = zoomId === undefined ? root : (nodes(root).find((t) => 'id' in t && t.id === zoomId) as OptimalGroup)
  const view = layoutView(zoom, null, null, width, ctx)
  if (view.kind !== 'blocks') throw new Error('expected blocks')
  return { root, ctx, adj, blocks: view.blocks }
}

const describeLines = (lines: ImportLine[], blocks: Block[], ctx: LayoutContext) =>
  lines
    .map((l) => {
      const name = (i: number | null) => (i === null ? '⤒' : labelOf(blocks[i].item, ctx))
      return `${l.kind} ${name(l.a)} – ${name(l.b)} ×${l.count} @${l.apexRow ?? '-'}`
    })
    .sort()

const itemFor = (blocks: Block[], ctx: LayoutContext, label: string): Item => blocks.find((b) => labelOf(b.item, ctx) === label)!.item

// All (row 0) › G1 {a/x, b/y}, G2 {c/z, d/w}, e/v (row 1) › the files of G1 and G2 (row 2).
const TWO_GROUPS: Spec = [0, [1, 'a/x.py', 'b/y.py'], [2, 'c/z.py', 'd/w.py'], 'e/v.py']

describe('import lines', () => {
  it('joins the deepest blocks holding each end, rising to the row of their lowest common ancestor', () => {
    const { blocks, adj, ctx } = scene(TWO_GROUPS, [
      ['a/x.py', 'b/y.py'],
      ['a/x.py', 'c/z.py'],
      ['e/v.py', 'a/x.py'],
    ])
    expect(describeLines(importLines(blocks, adj, null), blocks, ctx)).toEqual([
      'other a/x.py – b/y.py ×1 @1',
      'other a/x.py – c/z.py ×1 @0',
      'other a/x.py – e/v.py ×1 @0',
    ])
  })

  it('draws no line for imports inside one block', () => {
    // G3 sits in the last row, so its two files fold into it.
    const spec: Spec = [0, [1, [2, [3, 'a/x.py', 'a/y.py'], 'q/r.py'], 'q/s.py'], 't/u.py']
    const { blocks, adj, ctx } = scene(spec, [
      ['a/x.py', 'a/y.py'],
      ['a/x.py', 't/u.py'],
    ])
    expect(describeLines(importLines(blocks, adj, null), blocks, ctx)).toEqual(['other G3 – t/u.py ×1 @0'])
  })

  it('draws imports leaving the zoom as stubs, and nothing for imports wholly outside it', () => {
    const { blocks, adj, ctx } = scene(
      TWO_GROUPS,
      [
        ['a/x.py', 'c/z.py'],
        ['e/v.py', 'a/x.py'],
        ['c/z.py', 'd/w.py'],
        ['a/x.py', 'b/y.py'],
      ],
      1000,
      1,
    )
    expect(describeLines(importLines(blocks, adj, null), blocks, ctx)).toEqual([
      'other a/x.py – b/y.py ×1 @0',
      'other a/x.py – ⤒ ×2 @-',
    ])
  })

  it('combines the imports of a Folder Block\'s files into one line per other block', () => {
    // 50 px for 5 files: the folders' files are too narrow to draw and fold into them.
    const { blocks, adj, ctx } = scene([0, [1, ...files('a', 3)], 'tests/t1.py', 'tests/t2.py'], [
      ['tests/t1.py', 'a/f000.py'],
      ['tests/t2.py', 'a/f001.py'],
    ], 50)
    expect(describeLines(importLines(blocks, adj, null), blocks, ctx)).toEqual(['other a/ – tests/ ×2 @0'])
  })

  it('marks what a selection imports as "out" and what imports it as "in", starting at the selected block', () => {
    const { blocks, adj, ctx } = scene(TWO_GROUPS, [
      ['a/x.py', 'b/y.py'],
      ['a/x.py', 'c/z.py'],
      ['e/v.py', 'b/y.py'],
    ])
    const lines = importLines(blocks, adj, itemFor(blocks, ctx, 'G1'))
    expect(describeLines(lines, blocks, ctx)).toEqual([
      'in G1 – e/v.py ×1 @0',
      'other a/x.py – b/y.py ×1 @1',
      'out G1 – c/z.py ×1 @0',
    ])
  })

  it('anchors a selection that isn\'t drawn at the block holding it', () => {
    const { blocks, adj, ctx, root } = scene([0, [1, ...files('a', 3)], 'tests/t1.py', 'tests/t2.py'], [
      ['tests/t1.py', 'a/f000.py'],
      ['tests/t2.py', 'a/f001.py'],
    ], 50)
    const t1 = nodes(root).find((t) => !('children' in t) && t.file === 'tests/t1.py') as OptimalFile
    const lines = importLines(blocks, adj, { kind: 'file', key: `f${t1.index}`, node: t1, files: 1 })
    expect(describeLines(lines, blocks, ctx)).toEqual(['other a/ – tests/ ×1 @0', 'out tests/ – a/ ×1 @0'])
  })
})
