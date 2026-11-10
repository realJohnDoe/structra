import { STEPS, treeAt, type DendrogramArtifact } from './artifact.ts'
import type { GraphFile } from './graphFile.ts'
import { scoreTree } from './scoreTree.ts'
import type { OptimalFile, OptimalGroup } from './sweep.ts'

export interface SnapshotStep {
  /** λ with two decimals, as the slider and URLs name it. */
  lambda: string
  /** Groups (internal nodes) of the Optimal Tree, the root included. */
  groups: number
  /** Total Cost in nats, rounded to 9 decimals. */
  total: number
  /** First 16 hex digits of the SHA-256 of the tree's canonical form. */
  tree: string
}

/** A tree's canonical form: files by index, groups in parentheses, children in tree order. */
const canonical = (t: OptimalGroup | OptimalFile): string =>
  'children' in t ? `(${t.children.map(canonical).join(' ')})` : String(t.index)

async function sha256(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

const countGroups = (t: OptimalGroup): number =>
  1 + t.children.reduce((sum, c) => sum + ('children' in c ? countGroups(c) : 0), 0)

/** One line per λ step summarizing the Optimal Tree drawn there. */
export async function snapshot(artifact: DendrogramArtifact, graph: GraphFile): Promise<SnapshotStep[]> {
  const steps: SnapshotStep[] = []
  for (let s = 0; s < STEPS; s++) {
    const lambda = s / (STEPS - 1)
    const tree = treeAt(artifact, graph, s)
    steps.push({
      lambda: lambda.toFixed(2),
      groups: countGroups(tree),
      total: Number(scoreTree(tree, graph, lambda).total.toFixed(9)),
      tree: (await sha256(canonical(tree))).slice(0, 16),
    })
  }
  return steps
}

/** Writes a snapshot in its one canonical byte form: one step per line. */
export function serializeSnapshot(graphHash: string, steps: SnapshotStep[]): string {
  const lines = steps.map((s) => `    ${JSON.stringify(s).replaceAll('":', '": ').replaceAll(',"', ', "')}`)
  return `{\n  "graph": ${JSON.stringify(graphHash)},\n  "steps": [\n${lines.join(',\n')}\n  ]\n}\n`
}
