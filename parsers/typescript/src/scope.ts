/** Which files of a checkout are In-scope Files (ADR 0003). */
import { execFileSync } from 'node:child_process'
import { extname } from 'node:path'

const VENDORED = new Set(['vendor', 'third_party', 'third-party', 'node_modules'])

export const EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])

/**
 * Tracked files outside vendored directories and submodules, minus paths
 * matching an `excludes` glob (git pathspec syntax).
 */
export function trackedFiles(repo: string, excludes: readonly string[]): string[] {
  const pathspecs = excludes.map((glob) => `:(top,glob,exclude)${glob}`)
  const out = execFileSync('git', ['-C', repo, 'ls-files', '-z', '--stage', '--', ...pathspecs], {
    encoding: 'utf8',
    maxBuffer: 1 << 30,
  })
  const files: string[] = []
  for (const entry of out.split('\0')) {
    if (!entry) continue
    const tab = entry.indexOf('\t')
    const info = entry.slice(0, tab)
    const path = entry.slice(tab + 1)
    if (info.startsWith('160000 ')) continue // a submodule
    if (path.split('/').some((part) => VENDORED.has(part))) continue
    files.push(path)
  }
  return files
}

/** The TS/JS files among `tracked` (the output of `trackedFiles`). */
export function inScopeFiles(tracked: readonly string[]): string[] {
  return tracked.filter((path) => EXTENSIONS.has(extname(path)))
}
