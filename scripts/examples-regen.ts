// Regenerates the artifacts of Example Repos from the Example Repo List.
//
//   npm run examples:regen -- [name...]
//
// For each named repo (default: all of examples/repos.toml), it clones the repo
// at its pin with scripts/clone-at-pin.sh, runs its language's Parser with the
// repo's excludes, then runs scripts/structra-dendrogram.ts. It writes
// examples/<name>.graph.json, <name>.dendrogram.json and <name>.snapshot.json.
// Exit codes: 0 written, 1 failed, 2 usage error.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { parsers } from './example-parsers.ts'

interface ExampleRepo {
  name: string
  url: string
  language: string
  commit: string
  exclude: string[]
}

const root = join(import.meta.dirname, '..')
const examples = join(root, 'examples')

const list = (parse(readFileSync(join(examples, 'repos.toml'), 'utf8')) as unknown as { repo: ExampleRepo[] }).repo
const names = process.argv.slice(2)
const unknown = names.filter((name) => name.startsWith('-') || !list.some((repo) => repo.name === name))
if (unknown.length) {
  console.error(`usage: npm run examples:regen -- [name...]\nnot in examples/repos.toml: ${unknown.join(', ')}`)
  process.exit(2)
}
const repos = names.length ? list.filter((repo) => names.includes(repo.name)) : list
const missing = repos.filter((repo) => !parsers[repo.language])
if (missing.length) {
  console.error(`no Parser yet for: ${missing.map((repo) => `${repo.name} (${repo.language})`).join(', ')}`)
  process.exit(1)
}

const run = (command: string[]) => execFileSync(command[0], command.slice(1), { cwd: root, stdio: 'inherit' })

for (const repo of repos) {
  const scratch = mkdtempSync(join(tmpdir(), `structra-${repo.name}-`))
  try {
    const checkout = join(scratch, repo.name)
    const graphFile = join(examples, `${repo.name}.graph.json`)
    console.error(`${repo.name}: cloning ${repo.url} at ${repo.commit}`)
    run(['bash', join(root, 'scripts', 'clone-at-pin.sh'), repo.url, repo.commit, checkout])
    console.error(`${repo.name}: parsing`)
    run([...parsers[repo.language].command, checkout, '-o', graphFile, ...repo.exclude.flatMap((glob) => ['--exclude', glob])])
    const written = JSON.parse(readFileSync(graphFile, 'utf8')).meta.repo
    if (written !== repo.url) throw new Error(`${repo.name}: the Graph File names ${written}, the list ${repo.url}`)
    run(['node', join(root, 'scripts', 'structra-dendrogram.ts'), graphFile])
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}
