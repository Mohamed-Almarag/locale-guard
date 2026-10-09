import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@actions/core', () => ({
  info: vi.fn(),
  setFailed: vi.fn()
}))

const core = await import('@actions/core')
const { run } = await import('../src/main.js')

describe('run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prints hello', async () => {
    await run()

    expect(core.info).toHaveBeenCalledWith('hello from Locale Guard')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('fails the action when something throws', async () => {
    vi.mocked(core.info).mockImplementationOnce(() => {
      throw new Error('boom')
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith('boom')
  })
})
