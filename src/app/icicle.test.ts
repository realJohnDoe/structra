import { describe, expect, it } from 'vitest'
import flaskDendrogram from '../../examples/flask.dendrogram.json?raw'
import flaskGraph from '../../examples/flask.graph.json?raw'
import flaskSnapshot from '../../examples/flask.snapshot.json?raw'
import { parseArtifact, STEPS, treeAt } from '../core/artifact.ts'
import type { GraphFile } from '../core/graphFile.ts'
import { createGroupStats } from '../core/groupStats.ts'
import { scoreTree } from '../core/scoreTree.ts'
import { snapshot } from '../core/snapshot.ts'
import type { OptimalGroup } from '../core/sweep.ts'
import { folderCounts } from './folders.ts'
import {
  colourTree,
  keyOf,
  labelOf,
  layoutView,
  resolveOpened,
  sizeOf,
  type Block,
  type DisplayItem,
  type LayoutContext,
  type TreeNode,
} from './icicle.ts'
import { files, setup } from './testTrees.ts'

const row = (blocks: Block[], r: number, ctx: LayoutContext) =>
  blocks.filter((b) => b.row === r).map((b) => `${b.item.kind} ${labelOf(b.item, ctx)}`)
const blocksOf = (v: ReturnType<typeof layoutView>) => {
  if (v.kind !== 'blocks') throw new Error('expected blocks')
  return v.blocks
}

describe('icicle layout', () => {
  it('draws child groups first, largest first, then Folder Blocks, then files', () => {
    const { root, ctx } = setup([0, [1, ...files('a', 2)], ...files('tests', 3), 'x/lone.py', [2, ...files('b', 5)]])
    const blocks = blocksOf(layoutView(root, null, null, 1000, ctx))
    expect(row(blocks, 1, ctx)).toEqual(['group G2', 'group G1', 'folder tests/', 'file x/lone.py'])
  })

  it('labels a partial Folder Block "N of M here" and a complete one "all N"', () => {
    const { root, ctx } = setup([0, [1, ...files('a', 4)], ...files('tests', 3), ...files('docs', 2)], ['tests/zz.py'])
    const blocks = blocksOf(layoutView(root, null, null, 1000, ctx))
    const sizes = blocks.filter((b) => b.row === 1 && b.item.kind === 'folder').map((b) => [labelOf(b.item, ctx), sizeOf(b.item, b.width)])
    expect(sizes).toEqual([
      ['tests/', '3 of 4 here'],
      ['docs/', 'all 2'],
    ])
  })

  it('draws a single-file folder as the file itself', () => {
    const { root, ctx } = setup([0, [1, ...files('a', 4)], 'docs/conf.py'])
    expect(row(blocksOf(layoutView(root, null, null, 1000, ctx)), 1, ctx)).toEqual(['group G1', 'file docs/conf.py'])
  })

  it('folds everything too narrow into one "+N more", and never draws "+1"', () => {
    // 200 files over 400 px: 2 px per file, so loose files (< 12 px) and the 2-file group (< 6 px) fold.
    const { root, ctx } = setup([0, [1, ...files('a', 190)], [2, ...files('b', 2)], 'c/one.py', 'd/two.py', ...files('e', 6)])
    const blocks = blocksOf(layoutView(root, null, null, 400, ctx))
    expect(row(blocks, 1, ctx)).toEqual(['group G1', 'folder e/', 'more +3 more'])
    const more = blocks.find((b) => b.item.kind === 'more')!
    expect(sizeOf(more.item)).toBe('4 files')

    // With only one thing too narrow, it is drawn itself.
    const one = setup([0, [1, ...files('a', 190)], [2, ...files('b', 2)]])
    expect(row(blocksOf(layoutView(one.root, null, null, 400, one.ctx)), 1, one.ctx)).toEqual(['group G1', 'group G2'])
  })

  it('never draws "+1 more" at any λ step of flask', () => {
    const graph: GraphFile = JSON.parse(flaskGraph)
    const artifact = parseArtifact(flaskDendrogram)
    const stats = createGroupStats(artifact, graph)
    const ctx: LayoutContext = {
      label: (g, p) => stats.label(g.id, p?.id ?? null),
      folder: (g) => stats.of(g.id).folder,
      counts: folderCounts(graph.nodes),
    }
    for (let s = 0; s < STEPS; s += 5) {
      const blocks = blocksOf(layoutView(treeAt(artifact, graph, s), null, null, 358, ctx))
      for (const b of blocks) expect(labelOf(b.item, ctx)).not.toBe('+1 more')
    }
  })

  it('draws a Folder Block\'s files under it when they fit', () => {
    const { root, ctx } = setup([0, [1, ...files('a', 4)], ...files('tests', 3)])
    const blocks = blocksOf(layoutView(root, null, null, 1000, ctx))
    expect(row(blocks, 2, ctx).filter((r) => r.includes('tests'))).toEqual(['file tests/f000.py', 'file tests/f001.py', 'file tests/f002.py'])
  })

  it('opens "+N more" re-bucketed by folder when its contents fit, and as a tile grid when they don\'t', () => {
    const { root, ctx } = setup([0, [1, ...files('a', 190)], [2, ...files('b', 2)], 'c/one.py', 'c/two.py', 'd/x.py'])
    const more = blocksOf(layoutView(root, null, null, 400, ctx)).find((b) => b.item.kind === 'more')!.item as DisplayItem

    const fit = layoutView(root, null, more, 400, ctx)
    expect(row(blocksOf(fit), 0, ctx)).toEqual(['more +3 more'])
    expect(row(blocksOf(fit), 1, ctx)).toEqual(['group G2', 'folder c/', 'file d/x.py'])

    const grid = layoutView(root, null, more, 40, ctx)
    expect(grid.kind).toBe('grid')
    if (grid.kind !== 'grid') return
    expect(grid.tiles.map((t) => `${t.kind} ${labelOf(t, ctx)}`)).toEqual(['group G2', 'folder c/', 'file d/x.py'])
  })

  it('drops an opened block whose owner is no longer zoomed or whose members moved away', () => {
    const { root, ctx } = setup([0, [1, ...files('a', 190)], [2, ...files('b', 2)], 'c/one.py', 'c/two.py'])
    const more = blocksOf(layoutView(root, null, null, 400, ctx)).find((b) => b.item.kind === 'more')!.item as DisplayItem
    expect(resolveOpened(root.children[0] as OptimalGroup, more, ctx)).toBeNull()
    const moved = setup([0, [1, ...files('a', 190), [2, ...files('b', 2)], 'c/one.py', 'c/two.py']])
    expect(resolveOpened(moved.root, more, ctx)).toBeNull()
  })

  it('recounts an opened "+N more" when a λ change moves some of its members away', () => {
    const { root, ctx } = setup([0, [1, ...files('a', 190)], [2, ...files('b', 2)], 'c/one.py', 'c/two.py', 'd/x.py'])
    const more = blocksOf(layoutView(root, null, null, 400, ctx)).find((b) => b.item.kind === 'more')!.item as DisplayItem
    expect(labelOf(more, ctx)).toBe('+3 more')
    const later = setup([0, [1, ...files('a', 190), [2, ...files('b', 2)]], 'c/one.py', 'c/two.py', 'd/x.py'])
    expect(labelOf(resolveOpened(later.root, more, later.ctx)!, later.ctx)).toBe('+2 more')
  })

  it('never changes the tree, its Total Cost or the snapshot, with Folder Blocks on or off', async () => {
    const graph: GraphFile = JSON.parse(flaskGraph)
    const artifact = parseArtifact(flaskDendrogram)
    const stats = createGroupStats(artifact, graph)
    const canonical = (t: TreeNode): string => ('children' in t ? `(${t.children.map(canonical).join(' ')})` : String(t.index))
    for (const step of [30, 45, 60, 100]) {
      const tree = treeAt(artifact, graph, step)
      const before = { tree: canonical(tree), cost: scoreTree(tree, graph, step / 100).total }
      for (const folderBlocks of [true, false]) {
        const ctx: LayoutContext = {
          label: (g, p) => stats.label(g.id, p?.id ?? null),
          folder: (g) => stats.of(g.id).folder,
          counts: folderCounts(graph.nodes),
          folderBlocks,
        }
        const blocks = blocksOf(layoutView(tree, null, null, 358, ctx))
        for (const b of blocks)
          if (b.item.kind === 'more' || b.item.kind === 'folder') layoutView(b.item.owner, null, b.item, 358, ctx)
        colourTree(tree, ctx)
      }
      expect({ tree: canonical(tree), cost: scoreTree(tree, graph, step / 100).total }).toEqual(before)
    }
    // The committed 101-step snapshot still holds after all that layout.
    const committed = JSON.parse(flaskSnapshot) as { steps: unknown[] }
    expect(await snapshot(artifact, graph)).toEqual(committed.steps)
  })

  it('gives every key in one view once', () => {
    const { root, ctx } = setup([0, [1, ...files('a', 190)], [2, ...files('b', 2)], 'c/one.py', 'c/two.py'])
    const keys = blocksOf(layoutView(root, null, null, 400, ctx)).map((b) => b.item.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys[0]).toBe(keyOf(root))
  })
})
