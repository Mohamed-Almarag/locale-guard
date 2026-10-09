import { describe, expect, it } from 'vitest'
import { upsertComment } from '../../src/github/comment.js'
import { MARKER } from '../../src/reporters/markdown.js'
import { fakeOctokit } from './fake-octokit.js'

const repo = { owner: 'o', repo: 'r' }

describe('upsertComment', () => {
  it('creates the comment when issues exist and there is none yet', async () => {
    const state = { comments: [], files: [] }
    const { octokit } = fakeOctokit(state)

    const result = await upsertComment(octokit, repo, 1, `${MARKER}\nA`, {
      createIfMissing: true
    })

    expect(result.status).toBe('created')
    expect(state.comments).toHaveLength(1)
  })

  it('updates the same comment on the next run instead of adding one', async () => {
    const state = {
      comments: [
        { id: 7, body: 'Nice work!', html_url: 'u7' },
        { id: 8, body: `${MARKER}\nold`, html_url: 'u8' }
      ],
      files: []
    }
    const { octokit, rest } = fakeOctokit(state)

    const result = await upsertComment(octokit, repo, 1, `${MARKER}\nnew`, {
      createIfMissing: true
    })

    expect(result).toEqual({ status: 'updated', url: 'u8' })
    expect(rest.issues.createComment).not.toHaveBeenCalled()
    expect(state.comments.map((c) => c.body)).toEqual([
      'Nice work!',
      `${MARKER}\nnew`
    ])
  })

  it('skips the API call when the body did not change', async () => {
    const body = `${MARKER}\nsame`
    const { octokit, rest } = fakeOctokit({
      comments: [{ id: 1, body, html_url: 'u1' }],
      files: []
    })

    const result = await upsertComment(octokit, repo, 1, body, {
      createIfMissing: true
    })

    expect(result.status).toBe('unchanged')
    expect(rest.issues.updateComment).not.toHaveBeenCalled()
  })

  it('updates an existing comment to the clean state even without new issues', async () => {
    const state = {
      comments: [{ id: 1, body: `${MARKER}\nerrors`, html_url: 'u1' }],
      files: []
    }
    const { octokit } = fakeOctokit(state)

    const result = await upsertComment(octokit, repo, 1, `${MARKER}\n✅`, {
      createIfMissing: false
    })

    expect(result.status).toBe('updated')
    expect(state.comments[0]?.body).toBe(`${MARKER}\n✅`)
  })

  it('does not create a comment on a clean pull request', async () => {
    const state = { comments: [], files: [] }
    const { octokit } = fakeOctokit(state)

    const result = await upsertComment(octokit, repo, 1, `${MARKER}\n✅`, {
      createIfMissing: false
    })

    expect(result.status).toBe('skipped')
    expect(state.comments).toHaveLength(0)
  })

  it('reports a read-only token instead of throwing', async () => {
    const { octokit } = fakeOctokit({
      comments: [],
      files: [],
      writeError: 403
    })

    const result = await upsertComment(octokit, repo, 1, `${MARKER}\nA`, {
      createIfMissing: true
    })

    expect(result).toEqual({
      status: 'forbidden',
      message: 'Resource not accessible by integration'
    })
  })

  it('rethrows unexpected errors', async () => {
    const { octokit } = fakeOctokit({
      comments: [],
      files: [],
      writeError: 500
    })

    await expect(
      upsertComment(octokit, repo, 1, `${MARKER}\nA`, { createIfMissing: true })
    ).rejects.toThrow()
  })
})
