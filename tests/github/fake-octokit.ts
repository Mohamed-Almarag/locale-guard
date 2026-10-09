import { vi } from 'vitest'
import type { Octokit } from '../../src/github/context.js'

export interface FakeState {
  comments: { id: number; body: string; html_url: string }[]
  files: { filename: string; previous_filename?: string }[]
  /** HTTP status to throw on comment writes, e.g. 403 for a read-only token. */
  writeError?: number
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
