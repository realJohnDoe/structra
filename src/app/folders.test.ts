import { describe, expect, it } from 'vitest'
import { bucketByFolder, folderCounts, sizeText } from './folders.ts'

const paths = [
  'app.py',
  'pkg/__init__.py',
  'pkg/core.py',
  'pkg/json/__init__.py',
  'pkg/json/tag.py',
  'tests/conftest.py',
  'tests/test_a.py',
  'tests/test_b.py',
  'tests/deep/x/a.py',
  'tests/deep/x/b.py',
  'tests/deep/x/c.py',
]
const counts = folderCounts(paths)
const files = (...ps: string[]) => ps.map((p) => ({ file: p, index: paths.indexOf(p) }))
const bucket = (ps: string[], prefix: string) =>
  bucketByFolder(files(...ps), prefix, counts).map((b) => ({ ...b, files: b.files.map((f) => f.file) }))

describe('folder blocks', () => {
  it('buckets by the first folder level below the group, narrowed to the deepest shared folder', () => {
    const b = bucket(['tests/deep/x/a.py', 'tests/deep/x/b.py', 'tests/conftest.py', 'tests/test_a.py', 'pkg/core.py'], '')
    expect(b.map((x) => [x.name, x.dir, x.files.length, x.total])).toEqual([
      // tests/ has 6 files in all, 4 of them here.
      ['tests/', 'tests', 4, 6],
      ['pkg/', 'pkg', 1, 2],
    ])
    const deep = bucket(['tests/deep/x/a.py', 'tests/deep/x/b.py'], '')
    expect(deep.map((x) => [x.name, x.dir, x.files.length, x.total])).toEqual([['tests/deep/x/', 'tests/deep/x', 2, 3]])
  })

  it('names a folder relative to the group\'s own folder', () => {
    const b = bucket(['tests/deep/x/a.py', 'tests/deep/x/b.py', 'tests/test_a.py', 'tests/test_b.py'], 'tests')
    expect(b.map((x) => [x.name, x.total])).toEqual([
      ['tests/', 3],
      ['deep/x/', 3],
    ])
  })

  it('counts a narrowed folder\'s files recursively only when its files are not all directly in it', () => {
    const b = bucket(['pkg/core.py', 'pkg/json/tag.py'], '')
    expect(b.map((x) => [x.dir, x.total])).toEqual([['pkg', 4]])
    const direct = bucket(['pkg/core.py', 'pkg/__init__.py'], '')
    expect(direct.map((x) => [x.dir, x.total])).toEqual([['pkg', 2]])
  })

  it('reads files at the repo root as "(repo root)/"', () => {
    expect(bucket(['app.py'], '').map((x) => x.name)).toEqual(['(repo root)/'])
  })

  it('labels partial folders "22 of 41 here", complete ones "all 12", and shortens when narrow', () => {
    const partial = { files: Array(22), total: 41 }
    expect(sizeText(partial, 200)).toBe('22 of 41 here')
    expect(sizeText(partial, 50)).toBe('22/41')
    expect(sizeText({ files: Array(12), total: 12 }, 200)).toBe('all 12')
    expect(sizeText({ files: Array(12), total: 12 }, 30)).toBe('all 12')
  })
})
