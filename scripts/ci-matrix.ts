// Decides which CI jobs a change needs. Used by the `changes` job of
// .github/workflows/e2e.yml.
//
//   node scripts/ci-matrix.ts --all
//   node scripts/ci-matrix.ts --base REF     (changed files: git diff REF...HEAD)
//
// Prints one JSON object: { matrix: { include: [...] }, repos, app, fixtures }.
//   matrix    one entry per Example Repo to parse (name, url, commit, language,
//             toolchain, exclude)
//   repos     whether `matrix` is non-empty
//   app       whether the clone-free Node job and the Playwright job run
//   fixtures  the toolchains whose conformance fixtures run
// Exit codes: 0 printed, 2 usage error.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { parsers } from './example-parsers.ts'

export interface ExampleRepo {
  name: string
  url: string
  language: string
  commit: string
  exclude: string[]
}

export interface Selection {
  matrix: { include: (ExampleRepo & { toolchain: string })[] }
  repos: boolean
  app: boolean
  fixtures: string[]
}

// A change to any of these re-runs every Example Repo.
const shared = [
  /^scripts\/(clone-at-pin\.sh|ci-matrix\.ts|example-parsers\.ts|examples-check\.ts)$/,
  /^\.github\/workflows\/(e2e|deploy)\.yml$/,
]
// A change to any of these re-runs the Node and Playwright jobs.
const app = [
  /^(src|e2e|scripts|examples|schema|public)\//,
  /^(package(-lock)?\.json|index\.html|(vite|vitest|playwright|tsconfig)[^/]*|eslint\.config\.js)$/,
  /^\.github\/workflows\/(e2e|deploy)\.yml$/,
]

export function parseList(toml: string): ExampleRepo[] {
  return (parse(toml) as unknown as { repo: ExampleRepo[] }).repo
}

/** Entries of `head` that are new or differ from `base`. */
export function changedEntries(base: ExampleRepo[], head: ExampleRepo[]): Set<string> {
  const before = new Map(base.map((repo) => [repo.name, JSON.stringify(repo)]))
  return new Set(head.filter((repo) => before.get(repo.name) !== JSON.stringify(repo)).map((repo) => repo.name))
}

/**
 * `changed` is the list of changed files, or null for "everything" (manual run).
 * A change to a Parser's directory selects the first Example Repo of each language it hosts, as its canary.
 */
export function select(list: ExampleRepo[], changed: string[] | null, entries: Set<string>): Selection {
  const parsed = list.filter((repo) => parsers[repo.language])
  const everything = changed === null || changed.some((file) => shared.some((re) => re.test(file)))
  const picked = new Set<string>()
  const fixtures = new Set<string>()
  for (const [language, { toolchain, dir }] of Object.entries(parsers)) {
    if (everything || changed.some((file) => file.startsWith(`${dir}/`) || file.startsWith('schema/'))) {
      fixtures.add(toolchain)
    }
    if (changed?.some((file) => file.startsWith(`${dir}/`))) {
      const canary = parsed.find((repo) => repo.language === language)
      if (canary) picked.add(canary.name)
    }
  }
  for (const repo of parsed) {
    if (
      everything ||
      entries.has(repo.name) ||
      changed.some((file) => file.startsWith(`examples/${repo.name}.`))
    ) {
      picked.add(repo.name)
    }
  }
  const include = parsed
    .filter((repo) => picked.has(repo.name))
    .map((repo) => ({ ...repo, toolchain: parsers[repo.language].toolchain }))
  return {
    matrix: { include },
    repos: include.length > 0,
    app: changed === null || changed.some((file) => app.some((re) => re.test(file))),
    fixtures: [...fixtures],
  }
}

if (import.meta.main) {
  const root = join(import.meta.dirname, '..')
  const args = process.argv.slice(2)
  const git = (...a: string[]) => execFileSync('git', a, { cwd: root, encoding: 'utf8' })
  const list = parseList(readFileSync(join(root, 'examples', 'repos.toml'), 'utf8'))
  let result: Selection
  if (args.length === 1 && args[0] === '--all') {
    result = select(list, null, new Set())
  } else if (args.length === 2 && args[0] === '--base' && !args[1].startsWith('-')) {
    const changed = git('diff', '--name-only', `${args[1]}...HEAD`).split('\n').filter(Boolean)
    let entries = new Set<string>()
    try {
      entries = changedEntries(parseList(git('show', `${args[1]}:examples/repos.toml`)), list)
    } catch {
      entries = new Set(list.map((repo) => repo.name)) // no list at the base
    }
    result = select(list, changed, entries)
  } else {
    console.error('usage: ci-matrix --all | --base REF')
    process.exit(2)
  }
  console.log(JSON.stringify(result))
}
