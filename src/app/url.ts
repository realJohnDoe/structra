import { STEPS } from '../core/artifact.ts'

export const DEFAULT_STEP = 45

export interface ViewState {
  repo: string
  /** The λ step, 0 to STEPS − 1; λ = step / (STEPS − 1). */
  step: number
}

export const lambdaOf = (step: number) => (step / (STEPS - 1)).toFixed(2)

/** Reads `?repo=…&lambda=…`, falling back to the default repo and λ for anything missing or unknown. */
export function readViewState(search: string, repos: string[]): ViewState {
  const params = new URLSearchParams(search)
  const repo = params.get('repo')
  const lambda = Number(params.get('lambda') ?? NaN)
  return {
    repo: repo !== null && repos.includes(repo) ? repo : repos[0],
    step: Number.isFinite(lambda) ? Math.min(STEPS - 1, Math.max(0, Math.round(lambda * (STEPS - 1)))) : DEFAULT_STEP,
  }
}

/** The URL query for a view; an uploaded Graph File (repo null) can't be linked to, so only λ is kept. */
export function viewStateSearch({ repo, step }: { repo: string | null; step: number }): string {
  return `?${repo === null ? '' : `repo=${encodeURIComponent(repo)}&`}lambda=${lambdaOf(step)}`
}
