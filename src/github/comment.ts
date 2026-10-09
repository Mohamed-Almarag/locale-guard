import { MARKER } from '../reporters/markdown.js'
import type { Octokit, RepoRef } from './context.js'

export type CommentResult =
  | { status: 'created' | 'updated' | 'unchanged'; url: string }
  | { status: 'skipped' }
  | { status: 'forbidden'; message: string }

/**
 * F10: keeps a single Locale Guard comment per pull request. It finds the
 * comment by its hidden marker and edits it, so every run updates the same one.
 *
 * A new comment is only created when `createIfMissing` is set, so a clean pull
 * request gets no comment at all.
 */
export async function upsertComment(
  octokit: Octokit,
  repo: RepoRef,
  issueNumber: number,
  body: string,
  options: { createIfMissing: boolean }
): Promise<CommentResult> {
  try {
    const comments = await octokit.paginate(octokit.rest.issues.listComments, {
      ...repo,
      issue_number: issueNumber,
      per_page: 100
    })
    const existing = comments.find((comment) => comment.body?.includes(MARKER))

    if (existing) {
      if (existing.body === body) {
        return { status: 'unchanged', url: existing.html_url }
      }
      const { data } = await octokit.rest.issues.updateComment({
        ...repo,
        comment_id: existing.id,
        body
      })
      return { status: 'updated', url: data.html_url }
    }

    if (!options.createIfMissing) return { status: 'skipped' }

    const { data } = await octokit.rest.issues.createComment({
      ...repo,
      issue_number: issueNumber,
      body
    })
    return { status: 'created', url: data.html_url }
  } catch (error) {
    // F14: read-only tokens (forks, Dependabot) or missing `pull-requests: write`.
    const status = (error as { status?: number }).status
    if (status === 403 || status === 404) {
      return {
        status: 'forbidden',
        message: error instanceof Error ? error.message : String(error)
      }
    }
    throw error
  }
}
