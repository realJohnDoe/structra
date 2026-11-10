/**
 * TS/JS import resolution with dependency-cruiser, pinned together with
 * typescript 5.9 (ADR 0003, docs/research/import-resolution.md §2).
 *
 * - Every In-scope File is parsed with the TypeScript parser (also for
 *   JavaScript, which tolerates Flow and JSX). ES imports and re-exports,
 *   `require`, dynamic `import()`, `import x = require()`, AMD and type-only
 *   imports all give edges.
 * - Files are cruised in groups by their nearest tracked `tsconfig.json`, so
 *   `paths` and `baseUrl` apply per project. Of a tsconfig with errors (say,
 *   it extends a package that isn't installed), what can be read is used.
 * - A file the TypeScript parser fails on is cruised again with acorn. A file
 *   both fail on, or that can't be read (a tracked symbolic link to a missing
 *   file, say), is a parse failure.
 * - Workspace packages (root package.json `workspaces`, pnpm-workspace.yaml)
 *   resolve by name through linked directories outside the checkout, with
 *   package.json `exports`. When an entry points at build output that isn't
 *   in the checkout, `resolveFromBuildOutput` maps it back to its source.
 * - An edge is kept when its target is an In-scope File. Unresolved imports
 *   count as internal-looking when they are relative (`./`, `../`), absolute,
 *   package `imports` (`#…`) or name a workspace package.
 */
import { cruise, type ICruiseResult, type IDependency } from 'dependency-cruiser'
import { statSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import ts from 'typescript'
import { resolveFromBuildOutput, splitSpecifier } from './buildOutput.ts'
import type { Diagnostics } from './diagnostics.ts'
import { compareCodepoints } from './graphFile.ts'
import { linkWorkspaces, workspacePackages, type WorkspacePackage } from './workspaces.ts'

const CONDITIONS = ['import', 'require', 'node', 'module', 'development', 'default']

/** `files` grouped by their nearest tracked tsconfig.json (repo-relative; '' for none). */
function groupByTsconfig(files: readonly string[], tracked: readonly string[]): Map<string, string[]> {
  const configDirs = new Set(tracked.filter((p) => posix.basename(p) === 'tsconfig.json').map((p) => posix.dirname(p)))
  const groups = new Map<string, string[]>()
  for (const file of files) {
    let dir = posix.dirname(file)
    let config = ''
    for (;;) {
      if (configDirs.has(dir)) {
        config = dir === '.' ? 'tsconfig.json' : `${dir}/tsconfig.json`
        break
      }
      if (dir === '.') break
      dir = posix.dirname(dir)
    }
    groups.set(config, [...(groups.get(config) ?? []), file])
  }
  return groups
}

const NO_INPUTS = 18003 // "No inputs were found": irrelevant, as the Parser picks the files

/**
 * The parsed tsconfig, `extends` flattened. Errors (an `extends` of a package
 * that isn't installed, say) are warned about, and what could be read is used.
 */
function readTsconfig(repo: string, config: string, diagnostics: Diagnostics): ts.ParsedCommandLine | undefined {
  if (!config) return undefined
  const path = join(repo, config)
  const message = (diagnostic: ts.Diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ').replaceAll(`${repo}/`, '')
  const { config: json, error } = ts.readConfigFile(path, ts.sys.readFile)
  if (error) {
    diagnostics.warn(`${config} skipped: ${message(error)}`)
    return undefined
  }
  const parsed = ts.parseJsonConfigFileContent(json, ts.sys, dirname(path), {}, path)
  const errors = parsed.errors.filter((diagnostic) => diagnostic.code !== NO_INPUTS)
  if (errors.length) diagnostics.warn(`${config}: ${errors.map(message).join('; ')}`)
  return parsed
}

const FAILED_FILE = /\.\.\. in (.+)\n*$/

/** The syntax parser dependency-cruiser extracts imports with. */
type SyntaxParser = 'tsc' | 'acorn'

/**
 * Cruises `files` with `parser`. Returns the result and the files
 * dependency-cruiser failed to extract from, with the reason: they are left
 * out of the result.
 */
async function cruiseGroup(repo: string, files: string[], parser: SyntaxParser, config: string, tsConfig: object | undefined, modules: string): Promise<{ result: ICruiseResult; failed: Map<string, string> }> {
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
        { exportsFields: ['exports'], conditionNames: CONDITIONS, modules: ['node_modules', modules, 'node_modules/@types'] },
        tsConfig ? { tsConfig } : undefined,
      )
      return { result: typeof result.output === 'string' ? JSON.parse(result.output) : result.output, failed }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const file = FAILED_FILE.exec(message)?.[1]
      if (!file || !remaining.includes(file)) throw error
      const reason = message.split('\n').find((line) => line.trim() && !line.startsWith('Extracting'))?.trim()
      failed.set(file, reason ?? 'failed to parse')
      remaining = remaining.filter((other) => other !== file)
    }
  }
}

function isInternalLooking(specifier: string, packages: ReadonlyMap<string, WorkspacePackage>): boolean {
  return /^(?:\.\.?(?:\/|$)|\/|#)/.test(specifier) || packages.has(splitSpecifier(specifier).name)
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
      if (!dependency.couldNotResolve && inScope.has(dependency.resolved)) return dependency.resolved
      const { name, subpath } = splitSpecifier(dependency.module)
      const pkg = packages.get(name)
      return pkg ? resolveFromBuildOutput(pkg, subpath, inScope) : undefined
    }
    const groups = groupByTsconfig(readableFiles(repo, files, diagnostics), tracked)
    for (const config of [...groups.keys()].sort(compareCodepoints)) {
      const group = groups.get(config)!
      const tsConfig = readTsconfig(repo, config, diagnostics)
      const tscPass = await cruiseGroup(repo, group, 'tsc', config, tsConfig, linked.modules)
      // The TypeScript parser trips on some Flow syntax (`import typeof`);
      // acorn, with its loose fallback, gets the imports of most such files.
      const acornPass = await cruiseGroup(repo, [...tscPass.failed.keys()], 'acorn', config, tsConfig, linked.modules)
      for (const [file, reason] of acornPass.failed) diagnostics.parseFailed(file, reason)
      const members = new Set(group)
      for (const module of [...tscPass.result.modules, ...acornPass.result.modules]) {
        if (!members.has(module.source)) continue
        for (const dependency of module.dependencies) {
          const resolved = inScopeTarget(dependency)
          if (resolved) edges.push([module.source, resolved])
          else if (dependency.couldNotResolve && isInternalLooking(dependency.module, packages)) {
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
