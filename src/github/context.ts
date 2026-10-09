import * as github from '@actions/github'

export type Octokit = ReturnType<typeof github.getOctokit>

export interface RepoRef {
  owner: string
  repo: string
}

export interface PullRequestInfo {
  number: number
  headSha: string
  baseSha: string
  /** The head branch lives in another repository, so the token cannot write to this one. */
  isFork: boolean
}

export interface RunContext {
  repo: RepoRef
  eventName: string
  sha: string
  serverUrl: string
  runUrl: string
  pullRequest?: PullRequestInfo
}

interface PullRequestPayload {
  number: number
  head: { sha: string; repo?: { full_name?: string } | null }
  base: { sha: string; repo: { full_name: string } }
}

export function readRunContext(
  context: typeof github.context = github.context
): RunContext {
  const repo = context.repo
  const runUrl = `${context.serverUrl}/${repo.owner}/${repo.repo}/actions/runs/${context.runId}`
  const pr = context.payload.pull_request as PullRequestPayload | undefined

  return {
    repo,
    eventName: context.eventName,
    sha: context.sha,
    serverUrl: context.serverUrl,
    runUrl,
    pullRequest: pr
      ? {
          number: pr.number,
          headSha: pr.head.sha,
          baseSha: pr.base.sha,
          isFork: pr.head.repo?.full_name !== pr.base.repo.full_name
        }
      : undefined
  }
}

/** Builds links to a line of a file at a commit. */
export function lineLinker(
  run: RunContext,
  sha: string
): (file: string, line?: number) => string {
  const root = `${run.serverUrl}/${run.repo.owner}/${run.repo.repo}/blob/${sha}`
  return (file, line) =>
    `${root}/${file.split('/').map(encodeURIComponent).join('/')}${line ? `#L${line}` : ''}`
}
