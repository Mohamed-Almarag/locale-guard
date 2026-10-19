import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeOctokit, type FakeState } from './github/fake-octokit.js'

const mocks = vi.hoisted(() => {
  const summary = {
    text: '',
    addRaw: vi.fn(),
    write: vi.fn()
  }
  summary.addRaw.mockImplementation((text: string) => {
    summary.text += text
    return summary
  })
  summary.write.mockImplementation(async () => summary)

  return {
    inputs: {} as Record<string, string>,
    summary,
    context: {} as Record<string, unknown>,
    octokit: undefined as unknown
  }
})

vi.mock('@actions/core', () => ({
  getInput: vi.fn((name: string) => mocks.inputs[name] ?? ''),
  setFailed: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  notice: vi.fn(),
  startGroup: vi.fn(),
  endGroup: vi.fn(),
  summary: mocks.summary
}))

vi.mock('@actions/github', () => ({
  context: mocks.context,
  getOctokit: vi.fn(() => mocks.octokit)
}))

const core = await import('@actions/core')
const { run } = await import('../src/main.js')

function pullRequest(options: { fork?: boolean } = {}) {
  return {
    eventName: 'pull_request',
    sha: 'merge-sha',
    serverUrl: 'https://github.com',
    runId: 42,
    repo: { owner: 'o', repo: 'r' },
    payload: {
      pull_request: {
        number: 1,
        head: {
          sha: 'head-sha',
          repo: { full_name: options.fork ? 'someone/r' : 'o/r' }
        },
        base: { sha: 'base-sha', repo: { full_name: 'o/r' } }
      }
    }
  }
}

function setup(options: {
  inputs?: Record<string, string>
  context?: Record<string, unknown>
  state?: Partial<FakeState>
}) {
  mocks.inputs = {
    'github-token': 'token',
    files: 'locales/{locale}.json',
    format: 'vue-i18n',
    ...options.inputs
  }
  for (const key of Object.keys(mocks.context)) delete mocks.context[key]
  Object.assign(mocks.context, options.context ?? pullRequest())
  const state: FakeState = {
    comments: [],
    files: [{ filename: 'locales/ar.json' }],
    ...options.state
  }
  const fake = fakeOctokit(state)
  mocks.octokit = fake.octokit
  return { state, ...fake }
}

describe('run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.summary.text = ''
    process.env.GITHUB_WORKSPACE = 'tests/fixtures/vue-project'
  })

  it('comments, annotates, writes the summary and fails on errors', async () => {
    const { state } = setup({})

    await run()

    expect(state.comments).toHaveLength(1)
    expect(state.comments[0]?.body).toContain('## 🌐 Locale Guard: ')
    expect(state.comments[0]?.body).toContain(
      '[`auction.bid.tooLow`](https://github.com/o/r/blob/head-sha/locales/ar.json#L8)'
    )
    expect(mocks.summary.text).toContain('### ❌ ar: 1 missing key')
    expect(core.error).toHaveBeenCalledWith(
      expect.stringContaining('Missing key auction.bid.tooLow'),
      expect.objectContaining({ file: 'locales/ar.json', startLine: 8 })
    )
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringMatching(
        /^Locale Guard found \d+ translation issues \(fail-on: error\)\.$/
      )
    )
  })

  it('updates the same comment on the next run', async () => {
    const { state } = setup({})
    await run()
    await run()
    expect(state.comments).toHaveLength(1)
  })

  it('does not fail with fail-on never', async () => {
    setup({ inputs: { 'fail-on': 'never' } })
    await run()
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('skips quickly when no locale file changed', async () => {
    const { state, rest } = setup({
      state: { files: [{ filename: 'src/a.ts' }] }
    })

    await run()

    expect(core.info).toHaveBeenCalledWith(
      'No locale files changed in this pull request. Nothing to check.'
    )
    expect(rest.issues.createComment).not.toHaveBeenCalled()
    expect(state.comments).toHaveLength(0)
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('still runs when an earlier comment exists, so it does not stay stale', async () => {
    const { state } = setup({
      state: {
        files: [{ filename: 'src/a.ts' }],
        comments: [
          { id: 1, body: '<!-- locale-guard -->\nold', html_url: 'u1' }
        ]
      }
    })

    await run()

    expect(core.info).not.toHaveBeenCalledWith(
      'No locale files changed in this pull request. Nothing to check.'
    )
    expect(state.comments[0]?.body).toContain('### ❌ ar: 1 missing key')
  })

  it('does not try to comment on a fork, and still reports', async () => {
    const { paginate, rest } = setup({ context: pullRequest({ fork: true }) })

    await run()

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('comes from a fork')
    )
    expect(rest.issues.createComment).not.toHaveBeenCalled()
    expect(paginate).toHaveBeenCalledTimes(1)
    expect(mocks.summary.text).toContain('Locale Guard')
    expect(core.setFailed).toHaveBeenCalled()
  })

  it('warns instead of crashing when the token cannot write comments', async () => {
    setup({ state: { writeError: 403 } })

    await run()

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('pull-requests: write')
    )
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringMatching(/^Locale Guard found/)
    )
  })

  it('runs on push events without a comment', async () => {
    const { rest } = setup({
      context: { ...pullRequest(), eventName: 'push', payload: {} }
    })

    await run()

    expect(rest.issues.listComments).not.toHaveBeenCalled()
    expect(mocks.summary.text).toContain('### ❌ ar: 1 missing key')
  })

  it('reads ignore-tags from the inputs', async () => {
    setup({ inputs: { 'ignore-tags': 'true' } })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Locale Guard settings are not valid:\nInvalid "ignore-tags": works only with ICU messages: format icu, next-intl, use-intl, react-intl or formatjs (got "true")'
    )
  })

  it('fails with a clear message for invalid settings', async () => {
    setup({ inputs: { 'fail-on': 'sometimes' } })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Locale Guard settings are not valid:\nInvalid "fail-on": expected one of error, warning, never (got "sometimes")'
    )
  })

  it('names the locales it found when the base locale is missing', async () => {
    setup({ inputs: { 'base-locale': 'de' } })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Base locale "de" was not found. Found: ar, en, fr. Check "base-locale" and "files".'
    )
  })

  describe('baseline', () => {
    const fixture = (name: string) =>
      readFileSync(`tests/fixtures/vue-project/locales/${name}.json`, 'utf8')
    const sameAsHead = () => ({
      'locales/en.json': fixture('en'),
      'locales/ar.json': fixture('ar'),
      'locales/fr.json': fixture('fr')
    })

    it('does not comment or fail when every issue already existed', async () => {
      const { state } = setup({ state: { baseFiles: sameAsHead() } })

      await run()

      expect(state.comments).toHaveLength(0)
      expect(core.setFailed).not.toHaveBeenCalled()
      expect(core.error).not.toHaveBeenCalled()
      expect(mocks.summary.text).toContain(
        '✅ This pull request adds no new translation issues.'
      )
    })

    it('reports only what the pull request added, and collapses the rest', async () => {
      const base = sameAsHead()
      base['locales/ar.json'] = base['locales/ar.json'].replace(
        '"placed": "تم تقديم مزايدتك بقيمة {amount}"',
        '"placed": "تم تقديم مزايدتك بقيمة {amount}",\n      "tooLow": "أعلى من {amount}"'
      )
      const { state } = setup({ state: { baseFiles: base } })

      await run()

      const body = state.comments[0]?.body ?? ''
      expect(body).toContain('## 🌐 Locale Guard: 1 error\n')
      expect(body).toMatch(
        /New in this PR: 1 · Already existing: \d+ \(collapsed below\)/
      )
      expect(body).toContain('### ❌ ar: 1 missing key')
      expect(core.startGroup).toHaveBeenCalledWith('Locale Guard: 1 new issue')
      expect(core.info).toHaveBeenCalledWith(
        expect.stringMatching(
          /^error ar locales\/ar\.json:\d+ Missing key auction\.bid\.tooLow$/
        )
      )
      expect(core.info).toHaveBeenCalledWith(
        expect.stringMatching(
          /^Locale Guard: \d+ existing issues from the base branch, listed in the job summary\.$/
        )
      )
      expect(core.info).not.toHaveBeenCalledWith(
        expect.stringMatching(/^warning /)
      )
      expect(core.error).toHaveBeenCalledTimes(1)
      expect(core.setFailed).toHaveBeenCalledWith(
        'Locale Guard found 1 translation issue (fail-on: error).'
      )
    })

    it('with check-when always, lists existing issues on a pull request without locale changes and does not fail', async () => {
      const { state } = setup({
        inputs: { 'check-when': 'always' },
        state: {
          files: [{ filename: 'src/a.ts' }],
          baseFiles: sameAsHead()
        }
      })

      await run()

      expect(core.info).not.toHaveBeenCalledWith(
        'No locale files changed in this pull request. Nothing to check.'
      )
      const body = state.comments[0]?.body ?? ''
      expect(body).toContain(
        '✅ This pull request adds no new translation issues.'
      )
      expect(body).toMatch(/Already existing: \d+ \(listed below\)/)
      expect(body).toMatch(/<details open><summary>\d+ existing issues/)
      expect(body).toContain('#### ❌ ar: 1 missing key')
      expect(core.setFailed).not.toHaveBeenCalled()
    })

    it('fails on existing issues with fail-on-existing', async () => {
      setup({
        inputs: { 'fail-on-existing': 'true' },
        state: { baseFiles: sameAsHead() }
      })

      await run()

      expect(core.setFailed).toHaveBeenCalled()
    })

    it('treats every issue as new when the base branch cannot be read', async () => {
      const { rest, state } = setup({ state: { baseFiles: sameAsHead() } })
      rest.git.getTree.mockRejectedValueOnce(new Error('API down'))

      await run()

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('every issue is treated as new. API down')
      )
      expect(state.comments).toHaveLength(1)
      expect(core.setFailed).toHaveBeenCalled()
    })
  })

  describe('config file', () => {
    it('reads settings and ignore rules from the file', async () => {
      const { state } = setup({
        inputs: {
          files: '',
          format: '',
          'config-file': 'quiet.localeguard.yml'
        }
      })

      await run()

      const body = state.comments[0]?.body ?? ''
      expect(core.info).toHaveBeenCalledWith(
        'Using settings from quiet.localeguard.yml'
      )
      expect(body).not.toContain('auction.')
      expect(body).not.toContain('common.ok')
      expect(body).toContain('inbox.greeting')
      expect(core.setFailed).not.toHaveBeenCalled()
    })

    it('lets inputs win over the file', async () => {
      setup({
        inputs: {
          files: '',
          format: '',
          'fail-on': 'error',
          'config-file': 'quiet.localeguard.yml'
        }
      })

      await run()

      expect(core.setFailed).toHaveBeenCalled()
    })

    it('explains a wrong value in the file', async () => {
      setup({ inputs: { 'config-file': 'broken.localeguard.yml' } })

      await run()

      expect(core.setFailed).toHaveBeenCalledWith(
        'Locale Guard settings are not valid:\nInvalid "fail-on" in broken.localeguard.yml: expected one of error, warning, never (got "sometimes")'
      )
    })

    it('runs when only the config file changed', async () => {
      const { rest } = setup({
        inputs: { 'config-file': 'quiet.localeguard.yml' },
        state: { files: [{ filename: 'quiet.localeguard.yml' }] }
      })

      await run()

      expect(rest.issues.createComment).toHaveBeenCalled()
    })
  })

  it('compares with a base file named without its locale, on both branches', async () => {
    process.env.GITHUB_WORKSPACE = 'tests/fixtures/base-file-project'
    const read = (name: string) =>
      readFileSync(`tests/fixtures/base-file-project/lang/${name}`, 'utf8')
    const { state } = setup({
      inputs: {
        files: 'lang/main-{locale}.json',
        'base-file': 'lang/main.json',
        format: 'json'
      },
      state: {
        // Only the base file changed: the run must not be skipped
        files: [{ filename: 'lang/main.json' }],
        baseFiles: {
          'lang/main.json': '{\n  "title": "Campaigns"\n}\n',
          'lang/main-ar.json': read('main-ar.json')
        }
      }
    })

    await run()

    const body = state.comments[0]?.body ?? ''
    expect(body).toContain('### ❌ ar: 1 missing key')
    expect(body).toContain('`notFound`')
    expect(body).toContain('Copy-paste for lang/main-ar.json')
    // The base branch was read through its base file too
    expect(body).toContain('New in this PR: 1 · Already existing: 0')
  })

  it('names the base file setting when that file does not exist', async () => {
    process.env.GITHUB_WORKSPACE = 'tests/fixtures/base-file-project'
    setup({
      inputs: {
        files: 'lang/main-{locale}.json',
        'base-file': 'lang/mian.json',
        format: 'json'
      },
      state: { files: [{ filename: 'lang/main-ar.json' }] }
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Base file "lang/mian.json" was not found. Check "base-file".'
    )
  })

  it('explains when no file matches the pattern', async () => {
    setup({
      inputs: { files: 'nothing/{locale}.json' },
      state: { files: [{ filename: 'nothing/en.json' }] }
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'No locale files match "nothing/{locale}.json". Check "files".'
    )
  })
})
