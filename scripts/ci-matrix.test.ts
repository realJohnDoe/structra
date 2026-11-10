import { describe, expect, it } from 'vitest'
import { changedEntries, select, type ExampleRepo } from './ci-matrix.ts'

const repo = (name: string, language: string, commit = 'a'): ExampleRepo => ({
  name,
  url: `https://github.com/x/${name}`,
  language,
  commit,
  exclude: [],
})
const list = [repo('flask', 'python'), repo('requests', 'python'), repo('express', 'typescript'), repo('vite', 'typescript'), repo('ripgrep', 'rust'), repo('git', 'c')]
const names = (s: ReturnType<typeof select>) => s.matrix.include.map((r) => r.name)
const none = new Set<string>()

describe('select', () => {
  it('runs everything on a manual run, but skips languages without a Parser', () => {
    const s = select(list, null, none)
    expect(names(s)).toEqual(['flask', 'requests', 'express', 'vite', 'ripgrep', 'git'])
    expect(s).toMatchObject({ app: true, fixtures: ['uv', 'node'], repos: true })
    expect(s.matrix.include[0].toolchain).toBe('uv')
  })

  it('runs only the Node and Playwright jobs for a src/ change', () => {
    const s = select(list, ['src/app/App.tsx'], none)
    expect(s).toMatchObject({ app: true, repos: false, fixtures: [] })
    expect(names(s)).toEqual([])
  })

  it('runs the language canary and its fixtures for a Parser change', () => {
    const s = select(list, ['parsers/python/src/structra_parsers/python.py'], none)
    expect(names(s)).toEqual(['flask', 'ripgrep', 'git'])
    expect(s).toMatchObject({ app: false, fixtures: ['uv'] })
  })

  it('runs the TypeScript canary and fixtures for a TypeScript Parser change', () => {
    const s = select(list, ['parsers/typescript/src/resolve.ts'], none)
    expect(names(s)).toEqual(['express'])
    expect(s.fixtures).toEqual(['node'])
  })

  it("runs one repo for its own artifact or list entry", () => {
    expect(names(select(list, ['examples/requests.graph.json'], none))).toEqual(['requests'])
    expect(names(select(list, ['examples/repos.toml'], new Set(['requests'])))).toEqual(['requests'])
  })

  it('runs every repo when the shared clone script changes', () => {
    expect(names(select(list, ['scripts/clone-at-pin.sh'], none))).toEqual(['flask', 'requests', 'express', 'vite', 'ripgrep', 'git'])
  })

  it('runs nothing for a docs-only change', () => {
    expect(select(list, ['README.md', 'docs/research/x.md'], none)).toMatchObject({
      app: false,
      repos: false,
      fixtures: [],
    })
  })
})

describe('changedEntries', () => {
  it('names new and changed entries only', () => {
    const base = [repo('flask', 'python'), repo('requests', 'python')]
    const head = [repo('flask', 'python', 'b'), repo('requests', 'python'), repo('django', 'python')]
    expect([...changedEntries(base, head)].sort()).toEqual(['django', 'flask'])
  })
})
