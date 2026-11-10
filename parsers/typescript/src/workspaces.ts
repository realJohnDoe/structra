/**
 * The workspace-symlink pre-step (ADR 0003): workspace packages resolve by
 * name only through `node_modules`, so the Parser links each package's
 * directory under its name, in a temporary directory outside the checkout.
 * The resolver searches that directory as an extra `node_modules`, and the
 * checkout is never written to.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, posix } from 'node:path'
import type { Diagnostics } from './diagnostics.ts'
import { compareCodepoints } from './graphFile.ts'

/** A workspace package: its `name` and its repo-relative directory. */
export interface WorkspacePackage {
  name: string
  dir: string
  manifest: PackageJson
}

export interface PackageJson {
  name?: unknown
  workspaces?: unknown
  exports?: unknown
  main?: unknown
  module?: unknown
  types?: unknown
  typings?: unknown
}

const VALID_NAME = /^(?:@[^/@.][^/]*\/)?[^/@.][^/]*$/

function readJson(path: string): PackageJson | undefined {
  try {
    const json: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return json && typeof json === 'object' && !Array.isArray(json) ? json : undefined
  } catch {
    return undefined
  }
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

/** The `packages:` list of a pnpm-workspace.yaml, read line by line. */
export function pnpmWorkspacePatterns(yaml: string): string[] {
  const patterns: string[] = []
  let inPackages = false
  for (const line of yaml.split(/\r?\n/)) {
    if (/^packages\s*:\s*(#.*)?$/.test(line)) {
      inPackages = true
      continue
    }
    if (!inPackages || /^\s*(#.*)?$/.test(line)) continue
    const item = /^\s+-\s*(.*?)\s*(#.*)?$/.exec(line)
    if (!item) {
      if (!/^\s/.test(line)) inPackages = false
      continue
    }
    patterns.push(item[1].replace(/^(['"])(.*)\1$/, '$2'))
  }
  return patterns
}

/** A workspace glob (`*` within a segment, `**` across segments) as a RegExp. */
export function globToRegExp(glob: string): RegExp {
  const segments = glob.replace(/^\.\//, '').replace(/\/+$/, '').split('/')
  let source = ''
  segments.forEach((segment, i) => {
    const last = i === segments.length - 1
    if (segment === '**') {
      source += last ? '.*' : '(?:[^/]+/)*'
      return
    }
    source += segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')
    if (!last) source += '/'
  })
  return new RegExp(`^${source}$`)
}

/**
 * The workspace packages of a checkout: the directories of tracked
 * package.json files that the root package.json `workspaces` or
 * pnpm-workspace.yaml `packages` globs match, by package name. When two
 * packages share a name, the one in the first directory (by codepoint) wins.
 */
export function workspacePackages(repo: string, tracked: readonly string[], diagnostics: Diagnostics): WorkspacePackage[] {
  const trackedSet = new Set(tracked)
  const patterns: string[] = []
  if (trackedSet.has('package.json')) {
    const workspaces = readJson(join(repo, 'package.json'))?.workspaces
    patterns.push(...strings(workspaces))
    if (workspaces && typeof workspaces === 'object' && !Array.isArray(workspaces)) {
      patterns.push(...strings((workspaces as { packages?: unknown }).packages))
    }
  }
  if (trackedSet.has('pnpm-workspace.yaml')) {
    patterns.push(...pnpmWorkspacePatterns(readFileSync(join(repo, 'pnpm-workspace.yaml'), 'utf8')))
  }
  const include = patterns.filter((p) => !p.startsWith('!')).map(globToRegExp)
  const exclude = patterns.filter((p) => p.startsWith('!')).map((p) => globToRegExp(p.slice(1)))
  if (!include.length) return []

  const dirs = tracked
    .filter((path) => posix.basename(path) === 'package.json' && path !== 'package.json')
    .map((path) => posix.dirname(path))
    .filter((dir) => include.some((re) => re.test(dir)) && !exclude.some((re) => re.test(dir)))
    .sort(compareCodepoints)
  const byName = new Map<string, WorkspacePackage>()
  for (const dir of dirs) {
    const manifest = readJson(join(repo, dir, 'package.json'))
    const name = manifest?.name
    if (!manifest || typeof name !== 'string' || !VALID_NAME.test(name)) continue
    const first = byName.get(name)
    if (first) {
      diagnostics.warn(`workspace package ${name} is in both ${first.dir} and ${dir}; using ${first.dir}`)
      continue
    }
    byName.set(name, { name, dir, manifest })
  }
  return [...byName.values()]
}

/**
 * Links each package under its name into a new temporary `node_modules`
 * directory, outside the checkout. Call the returned function to remove it.
 */
export function linkWorkspaces(repo: string, packages: readonly WorkspacePackage[]): { modules: string; remove: () => void } {
  const scratch = mkdtempSync(join(tmpdir(), 'structra-workspaces-'))
  const modules = join(scratch, 'node_modules')
  mkdirSync(modules)
  for (const pkg of packages) {
    const link = join(modules, pkg.name)
    mkdirSync(dirname(link), { recursive: true })
    symlinkSync(join(repo, pkg.dir), link, 'dir')
  }
  return { modules, remove: () => rmSync(scratch, { recursive: true, force: true }) }
}
