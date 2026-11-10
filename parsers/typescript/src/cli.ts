#!/usr/bin/env node
/**
 * structra-parse-typescript: the TS/JS Parser (ADR 0003).
 *
 *   structra-parse-typescript [PATH] [-o FILE] [--exclude GLOB]...
 *
 * Exit codes: 0 Graph File written, 1 fatal, 2 usage error.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { Diagnostics } from './diagnostics.ts'
import { serializeGraphFile, type Meta } from './graphFile.ts'
import { resolveEdges } from './resolve.ts'
import { inScopeFiles, trackedFiles } from './scope.ts'

const PARSER = 'structra-parse-typescript'
const LANGUAGE = 'typescript'
const VERSION: string = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')).version

const USAGE = `usage: ${PARSER} [-h] [-o FILE] [--exclude GLOB] [--version] [PATH]`
const HELP = `${USAGE}

Write the Graph File of a git checkout's TypeScript and JavaScript files.

positional arguments:
  PATH            the checkout (default: .)

options:
  -h, --help      show this help message and exit
  -o FILE         write the Graph File to FILE, not stdout
  --exclude GLOB  leave out matching files (repeatable)
  --version       show program's version number and exit
`

/** An error that stops the run with exit code 1. */
class Fatal extends Error {}

class Usage extends Error {}

function git(repo: string, ...args: string[]): string {
  const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 1 << 30 })
  if (result.status !== 0) throw new Fatal(`git ${args.join(' ')} failed: ${result.stderr.trim()}`)
  return result.stdout
}

const SCP = /^(?:[^@/:]+@)?([^@/:]+):(?!\/\/)(.+)$/
const SCHEMES = new Set(['https:', 'http:', 'ssh:', 'git:', 'git+ssh:'])

/**
 * `https://<host>/<owner>/<name>` for an origin URL in https, scp-style
 * (`git@host:owner/name.git`) or `ssh://` form, without credentials, ports
 * (except on http(s)), a trailing `.git` or a trailing slash.
 */
export function normalizeOrigin(url: string): string {
  let host: string
  let port = ''
  let path: string
  const scp = SCP.exec(url)
  if (scp) {
    host = scp[1]
    path = scp[2]
  } else {
    let parts: URL
    try {
      parts = new URL(url)
    } catch {
      throw new Fatal(`can't turn the origin URL '${url}' into https://<host>/<owner>/<name>`)
    }
    if (!SCHEMES.has(parts.protocol) || !parts.hostname) {
      throw new Fatal(`can't turn the origin URL '${url}' into https://<host>/<owner>/<name>`)
    }
    host = parts.hostname
    path = parts.pathname
    if (parts.protocol === 'https:' || parts.protocol === 'http:') port = parts.port
  }
  path = path.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '').replace(/^\/+|\/+$/g, '')
  if (!path) throw new Fatal(`the origin URL '${url}' names no repository`)
  return `https://${host.toLowerCase()}${port ? `:${port}` : ''}/${path}`
}

function meta(repo: string): Meta {
  const toplevel = spawnSync('git', ['-C', repo, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' })
  if (toplevel.status !== 0) throw new Fatal(`${repo} is not a git work tree`)
  const top = toplevel.stdout.trim()
  if (realpathSync(top) !== realpathSync(repo)) throw new Fatal(`${repo} is not the root of its git work tree (${top})`)
  const commit = git(repo, 'rev-parse', '--verify', 'HEAD').trim()
  if (git(repo, 'status', '--porcelain', '--untracked-files=no')) {
    throw new Fatal(`${repo} has uncommitted changes to tracked files; commit or stash them first`)
  }
  const origin = spawnSync('git', ['-C', repo, 'config', '--get', 'remote.origin.url'], { encoding: 'utf8' })
  if (origin.status !== 0) throw new Fatal(`${repo} has no origin remote; a Graph File must name its repository`)
  return { repo: normalizeOrigin(origin.stdout.trim()), commit, language: LANGUAGE, parser: PARSER }
}

interface Args {
  path: string
  output?: string
  exclude: string[]
}

function parse(argv: string[]): Args | 'help' | 'version' {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean' },
        output: { type: 'string', short: 'o' },
        exclude: { type: 'string', multiple: true, default: [] },
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const unknown = /Unknown option '([^']+)'/.exec(message)
    throw new Usage(unknown ? `unrecognized arguments: ${unknown[1]}` : message.split('\n')[0])
  }
  const { values, positionals } = parsed
  if (values.help) return 'help'
  if (values.version) return 'version'
  if (positionals.length > 1) throw new Usage(`unrecognized arguments: ${positionals.slice(1).join(' ')}`)
  if (values.output === '') throw new Usage('argument -o: expected one argument')
  return { path: positionals[0] ?? '.', output: values.output, exclude: values.exclude }
}

function report(diagnostics: Diagnostics): void {
  const say = (line: string) => process.stderr.write(`${line}\n`)
  for (const warning of diagnostics.warnings) say(`${PARSER}: warning: ${warning}`)
  if (diagnostics.parseFailures.length) {
    say(`${PARSER}: ${diagnostics.parseFailures.length} files failed to parse (kept as nodes without edges):`)
    for (const failure of [...diagnostics.parseFailures].sort()) say(`  ${failure}`)
  }
  if (diagnostics.unresolved.size) {
    const total = [...diagnostics.unresolved.values()].reduce((a, b) => a + b, 0)
    say(`${PARSER}: ${total} unresolved internal-looking imports:`)
    for (const name of [...diagnostics.unresolved.keys()].sort()) say(`  ${name} (${diagnostics.unresolved.get(name)})`)
  }
}

export async function run(argv: string[]): Promise<number> {
  let args
  try {
    args = parse(argv)
  } catch (error) {
    if (!(error instanceof Usage)) throw error
    process.stderr.write(`${USAGE}\n${PARSER}: error: ${error.message}\n`)
    return 2
  }
  if (args === 'help') {
    process.stdout.write(HELP)
    return 0
  }
  if (args === 'version') {
    process.stdout.write(`${PARSER} ${VERSION}\n`)
    return 0
  }
  let repo: string
  let graphMeta: Meta
  let tracked: string[]
  try {
    graphMeta = meta(args.path)
    repo = realpathSync(args.path)
    tracked = trackedFiles(repo, args.exclude)
  } catch (error) {
    if (!(error instanceof Fatal)) throw error
    process.stderr.write(`${PARSER}: ${error.message}\n`)
    return 1
  }
  const files = inScopeFiles(tracked)
  const diagnostics = new Diagnostics()
  let edges
  try {
    edges = await resolveEdges(repo, files, tracked, diagnostics)
  } catch (error) {
    report(diagnostics)
    process.stderr.write(`${PARSER}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
    return 1
  }
  report(diagnostics)
  const text = serializeGraphFile(graphMeta, files, edges)
  if (args.output) writeFileSync(args.output, text, 'utf8')
  else process.stdout.write(text)
  return 0
}

if (process.argv[1] && realpathSync(process.argv[1]) === import.meta.filename) {
  process.exitCode = await run(process.argv.slice(2))
}
