// Turns Graph Files into their dendrogram artifacts and 101-step snapshots.
//
//   node scripts/structra-dendrogram.ts <name>.graph.json... [--out-dir DIR]
//
// Writes <name>.dendrogram.json and <name>.snapshot.json next to each Graph File,
// or into DIR. Exit codes: 0 written, 1 invalid Graph File, 2 usage error.
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { buildArtifact, serializeArtifact } from '../src/core/artifact.ts'
import { validateGraphFile } from '../src/core/graphFile.ts'
import { serializeSnapshot, snapshot } from '../src/core/snapshot.ts'

const usage = 'usage: structra-dendrogram <name>.graph.json... [--out-dir DIR]'

function parseArgs(argv: string[]): { inputs: string[]; outDir: string | null } | null {
  const inputs: string[] = []
  let outDir: string | null = null
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out-dir') {
      if (i + 1 >= argv.length) return null
      outDir = argv[++i]
    } else if (argv[i].startsWith('-')) return null
    else inputs.push(argv[i])
  }
  if (inputs.length === 0 || inputs.some((f) => !f.endsWith('.graph.json'))) return null
  return { inputs, outDir }
}

const args = parseArgs(process.argv.slice(2))
if (!args) {
  console.error(usage)
  process.exit(2)
}

for (const input of args.inputs) {
  let json: unknown
  try {
    json = JSON.parse(readFileSync(input, 'utf8'))
  } catch (e) {
    console.error(`${input}: ${(e as Error).message}`)
    process.exit(1)
  }
  const result = validateGraphFile(json)
  if (!result.ok) {
    console.error(`${input}: not a valid Graph File`)
    for (const error of result.errors) console.error(`  ${error}`)
    process.exit(1)
  }
  const name = basename(input, '.graph.json')
  const dir = args.outDir ?? dirname(input)
  const artifact = await buildArtifact(result.graph)
  writeFileSync(join(dir, `${name}.dendrogram.json`), serializeArtifact(artifact))
  writeFileSync(join(dir, `${name}.snapshot.json`), serializeSnapshot(artifact.graph, await snapshot(artifact, result.graph)))
  console.error(`${name}: wrote ${name}.dendrogram.json and ${name}.snapshot.json`)
}
