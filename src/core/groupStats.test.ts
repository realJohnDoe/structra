import { beforeAll, describe, expect, it } from 'vitest'
import toyText from '../../examples/toy.graph.json?raw'
import { buildArtifact, treeAt, type DendrogramArtifact } from './artifact.ts'
import type { GraphFile } from './graphFile.ts'
import { createGroupStats, fileLabel } from './groupStats.ts'
import type { OptimalGroup } from './sweep.ts'

const toy: GraphFile = JSON.parse(toyText)
let artifact: DendrogramArtifact

beforeAll(async () => {
  artifact = await buildArtifact(toy)
})

const files = (t: OptimalGroup): string[] => t.children.flatMap((c) => ('children' in c ? files(c) : [c.file]))

/** The group of the tree at `step` holding exactly these files, and its parent. */
function find(step: number, wanted: string[]): { group: OptimalGroup; parent: OptimalGroup | null } {
  const key = [...wanted].sort().join('\n')
  const visit = (g: OptimalGroup, parent: OptimalGroup | null): ReturnType<typeof find> | undefined => {
    if (files(g).sort().join('\n') === key) return { group: g, parent }
    for (const c of g.children) if ('children' in c) {
      const hit = visit(c, g)
      if (hit) return hit
    }
  }
  const hit = visit(treeAt(artifact, toy, step), null)
  if (!hit) throw new Error(`no group ${wanted.join(', ')} at step ${step}`)
  return hit
}

const core = ['toy/core/engine.py', 'toy/core/models.py', 'toy/core/store.py']

describe('group stats', () => {
  it('counts imports within, out of and into a group', () => {
    const stats = createGroupStats(artifact, toy)
    const { group } = find(100, core)
    expect(stats.of(group.id)).toMatchObject({ files: 3, within: 3, in: 2, out: 0, folder: 'toy/core' })
    const { group: web } = find(100, ['toy/web/templates.py', 'toy/web/views.py'])
    expect(stats.of(web.id)).toMatchObject({ files: 2, within: 1, in: 1, out: 1, folder: 'toy/web' })
  })

  it('ranks files by imports from within the group, ties by path', () => {
    const stats = createGroupStats(artifact, toy)
    expect(stats.of(find(100, core).group.id).mostImported).toEqual(['toy/core/models.py', 'toy/core/store.py'])
  })

  it('labels the root "All N files"', () => {
    const stats = createGroupStats(artifact, toy)
    for (const step of [0, 100]) expect(stats.label(treeAt(artifact, toy, step).id, null)).toBe('All 8 files')
  })

  it('labels a group by its own folder when that is deeper than its parent’s', () => {
    const stats = createGroupStats(artifact, toy)
    const { group, parent } = find(100, core)
    expect(stats.label(group.id, parent!.id)).toBe('core/')
  })

  it('labels other groups by their two most-imported files', () => {
    const stats = createGroupStats(artifact, toy)
    const pair = find(100, ['toy/core/models.py', 'toy/core/store.py'])
    expect(stats.label(pair.group.id, pair.parent!.id)).toBe('{models, store}')
    const entry = find(100, ['toy/__init__.py', 'toy/cli.py'])
    expect(stats.label(entry.group.id, entry.parent!.id)).toBe('{cli, toy}')
    const bigger = find(100, ['toy/__init__.py', 'toy/cli.py', 'toy/web/routes.py'])
    expect(stats.label(bigger.group.id, bigger.parent!.id)).toBe('{cli, routes, …}')
  })

  it('labels a file by its last two path segments', () => {
    expect(fileLabel('toy/core/engine.py')).toBe('core/engine.py')
    expect(fileLabel('setup.py')).toBe('setup.py')
  })
})
