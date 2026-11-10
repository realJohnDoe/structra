/**
 * Resolves an import of a workspace package whose entry points at build
 * output (`exports`, `main` or `module` naming `dist/…` in an unbuilt
 * checkout) back to the source file it is built from: the target itself if it
 * is an In-scope File, else the same path with its first directory replaced by
 * `src/` (the usual outDir → rootDir layout), each with TS/JS extension
 * substitution and `index` files. It is the fallback for imports of workspace
 * packages that dependency-cruiser couldn't resolve.
 */
import { posix } from 'node:path'
import { EXTENSIONS } from './scope.ts'
import type { WorkspacePackage } from './workspaces.ts'

const BUILD_DIRS = new Set(['dist', 'lib', 'build', 'out', 'esm', 'cjs', 'es'])
const SOURCE_EXTENSIONS = [...EXTENSIONS, '.d.ts', '.d.mts', '.d.cts']
const STRIP_EXTENSION = /(?:\.d)?\.(?:[cm]?ts|tsx|[cm]?js|jsx)$/

/** Splits `@scope/name/sub/path` into the package name and `./sub/path` (or `.`). */
export function splitSpecifier(specifier: string): { name: string; subpath: string } {
  const parts = specifier.split('/')
  const length = specifier.startsWith('@') ? 2 : 1
  const rest = parts.slice(length).join('/')
  return { name: parts.slice(0, length).join('/'), subpath: rest ? `./${rest}` : '.' }
}

/** Every string target of an `exports` value, in declaration order. */
function targets(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(targets)
  if (value && typeof value === 'object') return Object.values(value).flatMap(targets)
  return []
}

/** The targets `exports` gives for `subpath`, with `*` patterns filled in. */
function exportTargets(exportsField: unknown, subpath: string): string[] {
  const isSubpathMap =
    exportsField !== null &&
    typeof exportsField === 'object' &&
    !Array.isArray(exportsField) &&
    Object.keys(exportsField).some((key) => key.startsWith('.'))
  const map = (isSubpathMap ? exportsField : { '.': exportsField }) as Record<string, unknown>
  if (Object.hasOwn(map, subpath)) return targets(map[subpath])
  let best: { prefix: string; value: unknown; match: string } | undefined
  for (const [key, value] of Object.entries(map)) {
    const star = key.indexOf('*')
    if (star < 0) continue
    const prefix = key.slice(0, star)
    const suffix = key.slice(star + 1)
    if (subpath.length < key.length - 1 || !subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue
    if (!best || prefix.length > best.prefix.length) {
      best = { prefix, value, match: subpath.slice(prefix.length, subpath.length - suffix.length) }
    }
  }
  return best ? targets(best.value).map((target) => target.replaceAll('*', best.match)) : []
}

function candidates(path: string): string[] {
  const stem = path.replace(STRIP_EXTENSION, '')
  return [path, ...SOURCE_EXTENSIONS.map((ext) => stem + ext), ...SOURCE_EXTENSIONS.map((ext) => `${stem}/index${ext}`)]
}

/** The In-scope File an import of `subpath` of `pkg` is built from, if any. */
export function resolveFromBuildOutput(pkg: WorkspacePackage, subpath: string, inScope: ReadonlySet<string>): string | undefined {
  const { manifest } = pkg
  let entries = manifest.exports === undefined ? [] : exportTargets(manifest.exports, subpath)
  // Without `exports`, or for a subpath `exports` doesn't list (which test
  // runners with module mappers, such as jest, still import), the subpath
  // names the file, and the package itself its main entry.
  if (!entries.length) {
    entries =
      subpath === '.'
        ? [manifest.module, manifest.main, manifest.types, manifest.typings, 'index'].filter((e): e is string => typeof e === 'string')
        : [subpath]
  }

  for (const entry of entries) {
    const relative = posix.normalize(entry)
    if (relative.startsWith('../') || posix.isAbsolute(relative)) continue
    const [first, ...rest] = relative.split('/')
    const bases = [relative]
    if (BUILD_DIRS.has(first) && rest.length) bases.push(['src', ...rest].join('/'))
    for (const base of bases) {
      for (const candidate of candidates(posix.join(pkg.dir, base))) {
        if (inScope.has(candidate)) return candidate
      }
    }
  }
  return undefined
}
