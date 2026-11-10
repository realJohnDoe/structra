// Parses one Example Repo and byte-compares the result with its committed Graph File.
//
//   node scripts/examples-check.ts NAME URL COMMIT LANGUAGE [--exclude GLOB]...
//
// Clones with scripts/clone-at-pin.sh, runs the language's Parser, compares with
// examples/NAME.graph.json. The Parser's parse-failure and unresolved-import
// counts, and on a mismatch a node/edge diff, go to the job summary
// ($GITHUB_STEP_SUMMARY, else stdout). On a mismatch the actual Graph File is
// also written to $STRUCTRA_CHECK_OUT (default ./examples-check-out).
// Exit codes: 0 identical, 1 mismatch or failure, 2 usage error.
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parsers } from './example-parsers.ts'

interface Graph {
  nodes: string[]
  edges: [string, string][]
}

const edgeKey = (edge: [string, string]) => `${edge[0]} -> ${edge[1]}`

/** Markdown for the job summary: what the actual Graph File adds to or lacks from the committed one. */
export function diffSummary(committed: Graph, actual: Graph): string {
  const side = (a: string[], b: string[]) => {
    const other = new Set(b)
    return a.filter((x) => !other.has(x))
  }
  const sections: [string, string[]][] = [
    ['Nodes only in the actual Graph File', side(actual.nodes, committed.nodes)],
    ['Nodes only in the committed Graph File', side(committed.nodes, actual.nodes)],
    ['Edges only in the actual Graph File', side(actual.edges.map(edgeKey), committed.edges.map(edgeKey))],
    ['Edges only in the committed Graph File', side(committed.edges.map(edgeKey), actual.edges.map(edgeKey))],
  ]
  const limit = 200
  return sections
    .filter(([, items]) => items.length)
    .map(([title, items]) => {
      const shown = items.slice(0, limit).map((item) => `- \`${item}\``)
      if (items.length > limit) shown.push(`- … and ${items.length - limit} more`)
      return `#### ${title} (${items.length})\n\n${shown.join('\n')}`
    })
    .join('\n\n')
}

/** The lines of Parser stderr that carry the parse-failure and unresolved-import counts. */
export function parserCounts(stderr: string): string[] {
  return stderr.split('\n').filter((line) => /failed to parse|unresolved/.test(line))
}

function summarize(markdown: string) {
  const file = process.env.GITHUB_STEP_SUMMARY
  if (file) appendFileSync(file, `${markdown}\n`)
  else console.log(markdown)
}

if (import.meta.main) {
  const root = join(import.meta.dirname, '..')
  const [name, url, commit, language, ...rest] = process.argv.slice(2)
  const excludes: string[] = []
  let ok = Boolean(name && url && commit && language && parsers[language])
  for (let i = 0; ok && i < rest.length; i += 2) {
    if (rest[i] === '--exclude' && i + 1 < rest.length) excludes.push(rest[i + 1])
    else ok = false
  }
  if (!ok) {
    console.error('usage: examples-check NAME URL COMMIT LANGUAGE [--exclude GLOB]...')
    process.exit(2)
  }

  const scratch = mkdtempSync(join(tmpdir(), `structra-${name}-`))
  try {
    const checkout = join(scratch, name)
    const actualPath = join(scratch, `${name}.graph.json`)
    execFileSync('bash', [join(root, 'scripts', 'clone-at-pin.sh'), url, commit, checkout], { stdio: 'inherit' })
    const [cmd, ...cmdArgs] = parsers[language].command
    const run = spawnSync(
      cmd,
      [...cmdArgs, checkout, '-o', actualPath, ...excludes.flatMap((glob) => ['--exclude', glob])],
      { cwd: root, encoding: 'utf8' },
    )
    process.stderr.write(run.stderr)
    const counts = parserCounts(run.stderr)
    const heading = `### ${name}`
    const countsMd = counts.length ? `\n\n${counts.map((l) => `- ${l.trim()}`).join('\n')}` : '\n\nNo parse failures, no unresolved imports.'
    if (run.status !== 0) {
      summarize(`${heading}\n\n❌ The Parser exited with ${run.status}.${countsMd}`)
      process.exit(1)
    }
    const committedBytes = readFileSync(join(root, 'examples', `${name}.graph.json`))
    const actualBytes = readFileSync(actualPath)
    if (committedBytes.equals(actualBytes)) {
      summarize(`${heading}\n\n✅ Byte-identical to examples/${name}.graph.json.${countsMd}`)
    } else {
      const outDir = process.env.STRUCTRA_CHECK_OUT ?? 'examples-check-out'
      mkdirSync(outDir, { recursive: true })
      writeFileSync(join(outDir, `${name}.graph.json`), actualBytes)
      const diff = diffSummary(JSON.parse(committedBytes.toString()), JSON.parse(actualBytes.toString()))
      summarize(
        `${heading}\n\n❌ Not byte-identical to examples/${name}.graph.json. The actual Graph File is the \`${name}-graph\` artifact.${countsMd}\n\n${diff || 'Same nodes and edges: only the bytes differ (order, formatting or meta).'}`,
      )
      process.exit(1)
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}
