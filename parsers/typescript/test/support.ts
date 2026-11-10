/** Builds fixture checkouts and runs the Parser on them. */
import { Ajv2020 } from 'ajv/dist/2020.js'
import assert from 'node:assert/strict'
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir, devNull } from 'node:os'
import { dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import { compareCodepoints, compareEdges } from '../src/graphFile.ts'

const HERE = import.meta.dirname
export const FIXTURES = join(HERE, '..', 'fixtures')
export const CLI = join(HERE, '..', 'src', 'cli.ts')
const SCHEMA = JSON.parse(readFileSync(join(HERE, '..', '..', '..', 'schema', 'graph-file.schema.json'), 'utf8'))


export interface Fixture {
  git?: boolean
  origin?: string
  args?: string[]
  exit?: number
  stderr?: string[]
  files?: Record<string, string>
  symlinks?: Record<string, string>
  dirty?: Record<string, string>
  untracked?: Record<string, string>
  gitlinks?: string[]
}

// Fixed identity and dates, so a fixture's commit SHA never changes.
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Structra Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@structra.invalid',
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
  GIT_COMMITTER_NAME: 'Structra Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@structra.invalid',
  GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: '1',
}

export function git(repo: string, ...args: string[]): string {
  const result = spawnSync('git', ['-C', repo, ...args], { env: GIT_ENV, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}

function write(repo: string, path: string, content: string): void {
  mkdirSync(dirname(join(repo, path)), { recursive: true })
  writeFileSync(join(repo, path), content, 'utf8')
}

/** Builds the fixture's checkout in a temporary directory removed after `t`. */
export async function buildCheckout(t: TestContext, spec: Fixture): Promise<string> {
  const scratch = mkdtempSync(join(tmpdir(), 'structra-fixture-'))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  const repo = join(scratch, 'repo')
  mkdirSync(repo)
  for (const [path, content] of Object.entries(spec.files ?? {})) write(repo, path, content)
  for (const [path, target] of Object.entries(spec.symlinks ?? {})) {
    mkdirSync(dirname(join(repo, path)), { recursive: true })
    symlinkSync(target, join(repo, path))
  }
  if (spec.git === false) return repo
  git(repo, 'init', '--quiet', '--initial-branch=main')
  git(repo, 'add', '--all')
  for (const path of spec.gitlinks ?? []) {
    git(repo, 'update-index', '--add', '--cacheinfo', `160000,${'1'.repeat(40)},${path}`)
    mkdirSync(join(repo, path), { recursive: true }) // as a clone without --recurse-submodules leaves it
  }
  git(repo, 'commit', '--quiet', '--allow-empty', '--no-gpg-sign', '--message', 'fixture')
  if (spec.origin !== undefined) git(repo, 'remote', 'add', 'origin', spec.origin)
  for (const [path, content] of Object.entries({ ...spec.dirty, ...spec.untracked })) write(repo, path, content)
  return repo
}

export function runParser(repo: string | undefined, ...args: string[]): SpawnSyncReturns<Buffer> {
  return spawnSync(process.execPath, [CLI, ...(repo === undefined ? [] : [repo]), ...args], { maxBuffer: 1 << 30 })
}

const checkShape = new Ajv2020({ allErrors: true, strict: true }).compile(SCHEMA)

/** The JSON Schema plus the rules it can't express (schema/README.md). */
export function checkGraphFile(text: string): void {
  const graph: { nodes: string[]; edges: [string, string][] } = JSON.parse(text)
  assert.ok(checkShape(graph), JSON.stringify(checkShape.errors))
  const { nodes, edges } = graph
  assert.deepEqual(nodes, [...new Set(nodes)].sort(compareCodepoints))
  const keys = edges.map(([a, b]) => `${a}\0${b}`)
  assert.equal(new Set(keys).size, keys.length)
  const sorted = [...edges].sort(compareEdges)
  assert.deepEqual(edges, sorted)
  const known = new Set(nodes)
  for (const [src, dst] of edges) assert.ok(known.has(src) && known.has(dst) && src !== dst)
}
