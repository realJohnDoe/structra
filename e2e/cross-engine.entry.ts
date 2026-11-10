// Runs in Chromium, bundled by cross-engine.spec.ts: the app's own loading paths
// (an Example Repo, and an uploaded Graph File), then the tree core's snapshot
// of the trees each one reads.
import flaskGraph from '../examples/flask.graph.json?raw'
import { loadExampleRepo, type LoadedRepo } from '../src/app/examples.ts'
import { buildUploadedRepo, readGraphFile } from '../src/app/upload.ts'
import { serializeSnapshot, snapshot } from '../src/core/snapshot.ts'

const snapshotOf = async ({ graph, artifact }: LoadedRepo) => serializeSnapshot(artifact.graph, await snapshot(artifact, graph))

export async function flaskSnapshot(): Promise<string> {
  return snapshotOf(await loadExampleRepo('flask'))
}

export async function uploadedFlaskSnapshot(): Promise<string> {
  const reading = readGraphFile(flaskGraph)
  if (!reading.ok) throw new Error(reading.details.join('\n'))
  return snapshotOf(await buildUploadedRepo(reading.graph))
}
