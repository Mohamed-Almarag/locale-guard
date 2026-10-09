import { vi } from 'vitest'
import type { Octokit } from '../../src/github/context.js'

export interface FakeState {
  comments: { id: number; body: string; html_url: string }[]
  files: { filename: string; previous_filename?: string }[]
  /** HTTP status to throw on comment writes, e.g. 403 for a read-only token. */
  writeError?: number
  /** Files of the base branch, served through the git trees and blobs API. */
  baseFiles?: Record<string, string>
}

export const BASE_SHA = 'base-sha'

/**
 * Serves `baseFiles` like the git data API: the commit SHA is the root tree,
 * folders are `tree:<dir>` and files are `blob:<path>`.
 */
function gitApi(files: Record<string, string>) {
  const dirOf = (treeSha: string) =>
    treeSha === BASE_SHA ? '' : treeSha.replace(/^tree:/, '')

  return {
    getTree: vi.fn(
      async ({
        tree_sha,
        recursive
      }: {
        tree_sha: string
        recursive?: string
      }) => {
        const dir = dirOf(tree_sha)
        const prefix = dir ? `${dir}/` : ''
        const below = Object.keys(files)
          .filter((path) => path.startsWith(prefix))
          .map((path) => path.slice(prefix.length))

        const tree = recursive
          ? below.map((path) => ({
              path,
              type: 'blob',
              sha: `blob:${prefix}${path}`
            }))
          : [...new Set(below.map((path) => path.split('/')[0] as string))].map(
              (name) =>
                below.includes(name)
                  ? { path: name, type: 'blob', sha: `blob:${prefix}${name}` }
                  : { path: name, type: 'tree', sha: `tree:${prefix}${name}` }
            )
        return { data: { tree, truncated: false } }
      }
    ),
    getBlob: vi.fn(async ({ file_sha }: { file_sha: string }) => {
      const content = files[file_sha.replace(/^blob:/, '')]
      if (content === undefined) throw new Error('blob not found')
      return {
        data: {
          content: Buffer.from(content).toString('base64'),
          encoding: 'base64'
        }
      }
    })
  }
}

/** A minimal Octokit stand-in that covers the endpoints Locale Guard uses. */
export function fakeOctokit(state: FakeState) {
  const fail = () => {
    if (state.writeError) {
      throw Object.assign(new Error('Resource not accessible by integration'), {
        status: state.writeError
      })
    }
  }

  const rest = {
    git: gitApi(state.baseFiles ?? {}),
    pulls: { listFiles: vi.fn() },
    issues: {
      listComments: vi.fn(),
      createComment: vi.fn(async ({ body }: { body: string }) => {
        fail()
        const comment = {
          id: state.comments.length + 1,
          body,
          html_url: `https://github.com/o/r/pull/1#issuecomment-${state.comments.length + 1}`
        }
        state.comments.push(comment)
        return { data: comment }
      }),
      updateComment: vi.fn(
        async ({ comment_id, body }: { comment_id: number; body: string }) => {
          fail()
          const comment = state.comments.find((c) => c.id === comment_id)
          if (!comment) throw new Error('not found')
          comment.body = body
          return { data: comment }
        }
      )
    }
  }

  const paginate = vi.fn(async (endpoint: unknown) => {
    if (endpoint === rest.pulls.listFiles) return state.files
    if (endpoint === rest.issues.listComments) return state.comments
    throw new Error('unexpected endpoint')
  })

  return { octokit: { rest, paginate } as unknown as Octokit, rest, paginate }
}
