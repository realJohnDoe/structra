import { parse } from 'smol-toml'
import repoList from '../../examples/repos.toml?raw'
import { parseArtifact, treeAt, type DendrogramArtifact } from '../core/artifact.ts'
import type { GraphFile } from '../core/graphFile.ts'
import type { OptimalGroup } from '../core/sweep.ts'

export interface LoadedRepo {
  name: string
  graph: GraphFile
  artifact: DendrogramArtifact
  /** The Optimal Tree at a λ step, read off the artifact once per step and kept. */
  treeAt(step: number): OptimalGroup
}

// Bundled lazily: each Example Repo's artifacts become their own chunk.
const graphs = import.meta.glob<string>(['../../examples/*.graph.json', '!**/toy.*'], { query: '?raw', import: 'default' })
const artifacts = import.meta.glob<string>(['../../examples/*.dendrogram.json', '!**/toy.*'], { query: '?raw', import: 'default' })
const path = (name: string, kind: 'graph' | 'dendrogram') => `../../examples/${name}.${kind}.json`

const listed = (parse(repoList) as { repo: { name: string; url: string }[] }).repo.filter(
  (r) => path(r.name, 'graph') in graphs && path(r.name, 'dendrogram') in artifacts,
)

/** The Example Repos that ship artifacts, in Example Repo List order: the first is the default. */
export const exampleRepos: string[] = listed.map((r) => r.name)

/** An Example Repo's menu title, `owner/name` from its URL (e.g. `pallets/flask`). */
export const exampleRepoTitle = (name: string): string => {
  const url = listed.find((r) => r.name === name)?.url
  return url ? new URL(url).pathname.replace(/^\/|\/$/g, '') : name
}

export async function loadExampleRepo(name: string): Promise<LoadedRepo> {
  const [graph, artifact] = await Promise.all([graphs[path(name, 'graph')](), artifacts[path(name, 'dendrogram')]()])
  return withTrees(name, JSON.parse(graph) as GraphFile, parseArtifact(artifact))
}

function withTrees(name: string, graph: GraphFile, artifact: DendrogramArtifact): LoadedRepo {
  const trees = new Map<number, OptimalGroup>()
  return {
    name,
    graph,
    artifact,
    treeAt(step) {
      let tree = trees.get(step)
      if (!tree) trees.set(step, (tree = treeAt(artifact, graph, step)))
      return tree
    },
  }
}
