import { buildArtifact } from '../core/artifact.ts'
import { validateGraphFile, type GraphFile } from '../core/graphFile.ts'
import { repoTitle, withTrees, type LoadedRepo } from './examples.ts'

export type UploadReading =
  | { ok: true; graph: GraphFile }
  | {
      ok: false
      /** What went wrong and what to do about it, for the visitor. */
      message: string
      /** The individual failures, for whoever regenerates the file. */
      details: string[]
    }

const INVALID =
  'This is not a valid Graph File, or it comes from another structra version. ' +
  "Please regenerate it with this version's structra Parser."

/** Reads an uploaded file's text as a Graph File, checked against the Graph File JSON Schema and its README's rules. */
export function readGraphFile(text: string): UploadReading {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (e) {
    return { ok: false, message: INVALID, details: [`The file is not JSON: ${(e as Error).message}`] }
  }
  const v = validateGraphFile(json)
  return v.ok ? v : { ok: false, message: INVALID, details: v.errors }
}

/**
 * Builds an uploaded Graph File's artifact in the browser, the way the offline
 * pipeline does for Example Repos. From here on it loads like an Example Repo.
 */
export async function buildUploadedRepo(graph: GraphFile): Promise<LoadedRepo> {
  return withTrees(repoTitle(graph.meta.repo), graph, await buildArtifact(graph))
}
