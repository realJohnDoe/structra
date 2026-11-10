/**
 * TS/JS import resolution with dependency-cruiser, pinned together with
 * typescript 5.9 (ADR 0003, docs/research/import-resolution.md §2).
 *
 * - Every In-scope File is parsed with the TypeScript parser (also for
 *   JavaScript, which tolerates Flow and JSX). ES imports and re-exports,
 *   `require`, dynamic `import()`, `import x = require()`, AMD and type-only
 *   imports all give edges.
 * - Files are cruised in groups by the tracked tsconfig that governs them
 *   (`groupByTsconfig`: the nearest `tsconfig.json`, or the referenced or
 *   sibling project that holds the file), so `paths` and `baseUrl` apply per
 *   project. Of a tsconfig with errors (say, it extends a package that isn't
 *   installed), what can be read is used.
 * - A file the TypeScript parser fails on is cruised again with acorn. A file
 *   both fail on, or that can't be read (a tracked symbolic link to a missing
 *   file, say), is a parse failure.
 * - Workspace packages (root package.json `workspaces`, pnpm-workspace.yaml)
 *   resolve by name through linked directories outside the checkout, with
 *   package.json `exports`. When an entry points at build output that isn't
 *   in the checkout, `resolveFromBuildOutput` maps it back to its source.
 * - An edge is kept when its target is an In-scope File. An import that
 *   doesn't resolve, or resolves to a TS/JS file that isn't in scope (excluded,
 *   vendored or untracked), is counted on stderr when it looks internal: it is
 *   relative (`./`, `../`), absolute, package `imports` (`#…`), names a
 *   workspace package or matches a `paths` alias of any tracked tsconfig.
 */
import { cruise, type ICruiseResult, type IDependency } from 'dependency-cruiser'
import { statSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import ts from 'typescript'
import { resolveFromBuildOutput, splitSpecifier } from './buildOutput.ts'
import { Diagnostics } from './diagnostics.ts'
import { compareCodepoints } from './graphFile.ts'
import { EXTENSIONS } from './scope.ts'
import { linkWorkspaces, workspacePackages, type WorkspacePackage } from './workspaces.ts'

const CONDITIONS = ['import', 'require', 'node', 'module', 'development', 'default']

/** The nearest tracked tsconfig.json above `file` (repo-relative; '' for none). */
function nearestTsconfig(file: string, configDirs: ReadonlySet<string>): string {
  for (let dir = posix.dirname(file); ; dir = posix.dirname(dir)) {
    if (configDirs.has(dir)) return dir === '.' ? 'tsconfig.json' : `${dir}/tsconfig.json`
    if (dir === '.') return ''
  }
}

const isTsconfigName = (path: string) => /^tsconfig(?:\.[^/]*)?\.json$/.test(posix.basename(path))

const NO_INPUTS = 18003 // "No inputs were found": irrelevant, as the Parser picks the files

const inNodeModules = (path: string) => path.split(/[\\/]/).includes('node_modules')

/**
 * Reads files as `ts.sys` does, but never inside a `node_modules`: whether the
 * checkout has its dependencies installed must not change the output.
 */
const configHost: ts.ParseConfigHost = {
  useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
  fileExists: (path) => !inNodeModules(path) && ts.sys.fileExists(path),
  readFile: (path) => (inNodeModules(path) ? undefined : ts.sys.readFile(path)),
  readDirectory: (root, extensions, excludes, includes, depth) =>
    ts.sys.readDirectory(root, extensions, excludes, includes, depth).filter((path) => !inNodeModules(path)),
}

/**
 * Each tsconfig read once, so its warnings are reported once. `quiet` reads
 * don't report: they only look for `paths` aliases.
 */
class Tsconfigs {
  private readonly parsed = new Map<string, ts.ParsedCommandLine | undefined>()
  private readonly files = new Map<string, Set<string>>()
  private readonly repo: string
  private readonly diagnostics: Diagnostics
  constructor(repo: string, diagnostics: Diagnostics) {
    this.repo = repo
    this.diagnostics = diagnostics
  }

  get(config: string, quiet = false): ts.ParsedCommandLine | undefined {
    if (!this.parsed.has(config)) {
      if (quiet) return readTsconfig(this.repo, config, new Diagnostics())
      this.parsed.set(config, readTsconfig(this.repo, config, this.diagnostics))
    }
    return this.parsed.get(config)
  }

  /** Whether `config`'s own file list (`files`, `include`, `exclude`) holds `file`. */
  includes(config: string, file: string): boolean {
    if (!this.files.has(config)) {
      const names = this.get(config)?.fileNames ?? []
      this.files.set(config, new Set(names.map((name) => posix.relative(this.repo, name.replaceAll('\\', '/')))))
    }
    return this.files.get(config)!.has(file)
  }

  /** The tracked projects `config` references, depth-first, in order (repo-relative). */
  references(config: string, tracked: ReadonlySet<string>, seen = new Set([config])): string[] {
    const out: string[] = []
    for (const ref of this.get(config)?.projectReferences ?? []) {
      const path = posix.relative(this.repo, ts.resolveProjectReferencePath(ref).replaceAll('\\', '/'))
      if (seen.has(path) || !tracked.has(path)) continue
      seen.add(path)
      out.push(path, ...this.references(path, tracked, seen))
    }
    return out
  }
}

/**
 * `files` grouped by the tsconfig that governs each (repo-relative; '' for
 * none). That is the nearest tracked tsconfig.json when its file list holds
 * the file. When it doesn't (a solution-style tsconfig.json with
 * `"files": []` and `references`, as Vite's templates write), it is the first
 * of its referenced projects, depth-first, whose file list does, as
 * TypeScript's editor service picks it, and then the first other tracked
 * `tsconfig.*.json` beside it that does: test configs are often referenced by
 * nothing. A file no candidate holds stays with the nearest tsconfig.json.
 */
function groupByTsconfig(files: readonly string[], tracked: readonly string[], configs: Tsconfigs): Map<string, string[]> {
  const trackedSet = new Set(tracked)
  const configDirs = new Set(tracked.filter((p) => posix.basename(p) === 'tsconfig.json').map((p) => posix.dirname(p)))
  const candidates = new Map<string, string[]>()
  const candidatesOf = (nearest: string) => {
    if (!candidates.has(nearest)) {
      const dir = posix.dirname(nearest)
      const siblings = tracked.filter((p) => p !== nearest && posix.dirname(p) === dir && isTsconfigName(p)).sort(compareCodepoints)
      candidates.set(nearest, [...new Set([nearest, ...configs.references(nearest, trackedSet), ...siblings])])
    }
    return candidates.get(nearest)!
  }
  const groups = new Map<string, string[]>()
  for (const file of files) {
    const nearest = nearestTsconfig(file, configDirs)
    const config = nearest ? (candidatesOf(nearest).find((c) => configs.includes(c, file)) ?? nearest) : ''
    groups.set(config, [...(groups.get(config) ?? []), file])
  }
  return groups
}

/** Whether `specifier` matches a `paths` pattern (`@/*`, `~/*`, `config`). */
function matchesPathsPattern(specifier: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => {
    const star = pattern.indexOf('*')
    if (star < 0) return specifier === pattern
    const prefix = pattern.slice(0, star), suffix = pattern.slice(star + 1)
    return specifier.length >= prefix.length + suffix.length && specifier.startsWith(prefix) && specifier.endsWith(suffix)
  })
}

/**
 * The parsed tsconfig, `extends` flattened. Errors (an `extends` of a package,
 * which the Parser never reads from `node_modules`, say) are warned about, and
 * what could be read is used.
 */
function readTsconfig(repo: string, config: string, diagnostics: Diagnostics): ts.ParsedCommandLine | undefined {
  if (!config) return undefined
  const path = join(repo, config)
  const message = (diagnostic: ts.Diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ').replaceAll(`${repo}/`, '')
  const { config: json, error } = ts.readConfigFile(path, configHost.readFile)
  if (error) {
    diagnostics.warn(`${config} skipped: ${message(error)}`)
    return undefined
  }
  const parsed = ts.parseJsonConfigFileContent(json, configHost, dirname(path), {}, path)
  const errors = parsed.errors.filter((diagnostic) => diagnostic.code !== NO_INPUTS)
  if (errors.length) diagnostics.warn(`${config}: ${errors.map(message).join('; ')}`)
  return parsed
}

/** The file a dependency-cruiser extraction error names (`... in <file>`). */
const FILE_IN_EXTRACTION_ERROR = /\.\.\. in (.+)\n*$/

/** The syntax parser dependency-cruiser extracts imports with. */
type SyntaxParser = 'tsc' | 'acorn'

/** What every cruise of one tsconfig group shares. */
interface CruiseContext {
  repo: string
  /** The group's tsconfig.json, repo-relative ('' for none), and its parsed form. */
  config: string
  tsConfig: ts.ParsedCommandLine | undefined
  /** The temporary `node_modules` with the linked workspace packages. */
  workspaceModules: string
}

/**
 * Cruises `files` with `parser`. Returns the result and the files
 * dependency-cruiser failed to extract from, with the reason: they are left
 * out of the result.
 */
async function cruiseGroup({ repo, config, tsConfig, workspaceModules }: CruiseContext, files: string[], parser: SyntaxParser): Promise<{ result: ICruiseResult; failed: Map<string, string> }> {
  let remaining = files
  const failed = new Map<string, string>()
  for (;;) {
    if (!remaining.length) return { result: { modules: [] } as unknown as ICruiseResult, failed }
    try {
      const result = await cruise(
        remaining,
        {
          baseDir: repo,
          // Every In-scope File is a root. Following none of their imports
          // keeps the cruise to them; `maxDepth` would also skip a root that
          // an earlier root's import had reached.
          doNotFollow: { path: '.' },
          parser,
          tsPreCompilationDeps: parser === 'tsc',
          detectImportsInAmbientModules: false,
          ...(tsConfig ? { tsConfig: { fileName: join(repo, config) } } : {}),
          outputType: 'json',
        },
        {
          exportsFields: ['exports'],
          conditionNames: CONDITIONS,
          // Only the linked workspace packages: external packages give no
          // edges, and an installed `node_modules` in the checkout must not
          // change the output.
          modules: [workspaceModules],
        },
        tsConfig ? { tsConfig } : undefined,
      )
      return { result: typeof result.output === 'string' ? JSON.parse(result.output) : result.output, failed }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const file = FILE_IN_EXTRACTION_ERROR.exec(message)?.[1]
      if (!file || !remaining.includes(file)) throw error
      const reason = message.split('\n').find((line) => line.trim() && !line.startsWith('Extracting'))?.trim()
      failed.set(file, reason ?? 'failed to parse')
      remaining = remaining.filter((other) => other !== file)
    }
  }
}

const resolvesToFile = (dependency: IDependency) => !dependency.couldNotResolve && !dependency.coreModule

/**
 * Whether an import that gave no edge missed the In-scope Files: it doesn't
 * resolve, or resolves to a TS/JS file outside them (excluded, vendored or
 * untracked). Imports of non-code files (`.css`, `.json`) don't count.
 */
const missesScope = (dependency: IDependency) =>
  !dependency.coreModule &&
  (dependency.couldNotResolve || EXTENSIONS.has(posix.extname(dependency.resolved)))

function isInternalLooking(specifier: string, packages: ReadonlyMap<string, WorkspacePackage>, aliases: readonly string[]): boolean {
  return /^(?:\.\.?(?:\/|$)|\/|#)/.test(specifier) || packages.has(splitSpecifier(specifier).name) || matchesPathsPattern(specifier, aliases)
}

/** The files that are readable regular files; the others are parse failures. */
function readableFiles(repo: string, files: readonly string[], diagnostics: Diagnostics): string[] {
  return files.filter((file) => {
    try {
      if (statSync(join(repo, file)).isFile()) return true
      diagnostics.parseFailed(file, 'not a regular file')
    } catch (error) {
      diagnostics.parseFailed(file, (error as NodeJS.ErrnoException).code ?? String(error))
    }
    return false
  })
}

/** Edges among `files` (In-scope Files, repo-relative) of the checkout at `repo`. */
export async function resolveEdges(repo: string, files: readonly string[], tracked: readonly string[], diagnostics: Diagnostics): Promise<[string, string][]> {
  const inScope = new Set(files)
  const packageList = workspacePackages(repo, tracked, diagnostics)
  const packages = new Map(packageList.map((pkg) => [pkg.name, pkg]))
  const linked = linkWorkspaces(repo, packageList)
  // Libraries may log to stdout, which carries the Graph File.
  const log = console.log
  console.log = console.error
  try {
    const edges: [string, string][] = []
    const inScopeTarget = (dependency: IDependency): string | undefined => {
      if (dependency.coreModule) return undefined
      if (resolvesToFile(dependency) && inScope.has(dependency.resolved)) return dependency.resolved
      const { name, subpath } = splitSpecifier(dependency.module)
      const pkg = packages.get(name)
      return pkg ? resolveFromBuildOutput(pkg, subpath, inScope) : undefined
    }
    const configs = new Tsconfigs(repo, diagnostics)
    const groups = groupByTsconfig(readableFiles(repo, files, diagnostics), tracked, configs)
    // Every tracked tsconfig's `paths` aliases, so an alias import that the
    // file's own tsconfig doesn't resolve is counted rather than taken for an
    // external package.
    const aliases = [
      ...new Set(tracked.filter(isTsconfigName).flatMap((config) => Object.keys(configs.get(config, true)?.options.paths ?? {}))),
    ]
    for (const config of [...groups.keys()].sort(compareCodepoints)) {
      const group = groups.get(config)!
      const context = { repo, config, tsConfig: configs.get(config), workspaceModules: linked.modules }
      const tscPass = await cruiseGroup(context, group, 'tsc')
      // The TypeScript parser trips on some Flow syntax (`import typeof`);
      // acorn, with its loose fallback, gets the imports of most such files.
      const acornPass = await cruiseGroup(context, [...tscPass.failed.keys()], 'acorn')
      for (const [file, reason] of acornPass.failed) diagnostics.parseFailed(file, reason)
      const members = new Set(group)
      for (const module of [...tscPass.result.modules, ...acornPass.result.modules]) {
        if (!members.has(module.source)) continue
        for (const dependency of module.dependencies) {
          const resolved = inScopeTarget(dependency)
          if (resolved) edges.push([module.source, resolved])
          else if (missesScope(dependency) && isInternalLooking(dependency.module, packages, aliases)) {
            diagnostics.unresolvedImport(dependency.module)
          }
        }
      }
    }
    return edges
  } finally {
    console.log = log
    linked.remove()
  }
}
