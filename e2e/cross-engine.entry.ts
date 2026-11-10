// Runs in Chromium, bundled by cross-engine.spec.ts: the app's own loading path
// for an Example Repo, then the tree core's snapshot of the trees it reads.
import { loadExampleRepo } from '../src/app/examples.ts'
import { serializeSnapshot, snapshot } from '../src/core/snapshot.ts'

export async function flaskSnapshot(): Promise<string> {
  const { graph, artifact } = await loadExampleRepo('flask')
  return serializeSnapshot(artifact.graph, await snapshot(artifact, graph))
}
