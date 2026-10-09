import { describe, expect, it } from 'vitest'
import { baseFileSource, rootDirs } from '../../src/github/files.js'
import { BASE_SHA, fakeOctokit } from './fake-octokit.js'

const repo = { owner: 'o', repo: 'r' }

describe('rootDirs', () => {
  it('keeps the fixed folders before the first wildcard', () => {
    expect(rootDirs(['locales/{locale}.json'])).toEqual(['locales'])
    expect(rootDirs(['src/i18n/{locale}/*.yml'])).toEqual(['src/i18n'])
  })

  it('uses the repo root for a pattern with no fixed folder', () => {
    expect(rootDirs(['{locale}.json', 'locales/{locale}.json'])).toEqual([''])
  })

  it('drops folders nested in another one', () => {
    expect(
      rootDirs([
        'app/locales/{locale}.json',
        'app/{locale}/*.json',
        'messages/{locale}.json'
      ])
    ).toEqual(['app', 'messages'])
  })
})

describe('baseFileSource', () => {
  const baseFiles = {
    'locales/en.json': '{"a":"A"}',
    'locales/ar/common.json': '{"a":"أ"}',
    'src/app.ts': 'export {}',
    'README.md': '# hi'
  }

  it('lists only the files under the pattern folders', async () => {
    const { octokit, rest } = fakeOctokit({
      comments: [],
      files: [],
      baseFiles
    })

    const source = await baseFileSource(octokit, repo, BASE_SHA, [
      'locales/{locale}.json'
    ])

    expect(await source.glob(['locales/*.json'])).toEqual(['locales/en.json'])
    expect(await source.glob(['**/*'])).toEqual([
      'locales/en.json',
      'locales/ar/common.json'
    ])
    expect(rest.git.getTree).toHaveBeenCalledWith({
      ...repo,
      tree_sha: 'tree:locales',
      recursive: 'true'
    })
  })

  it('reads file contents, including non-ASCII text', async () => {
    const { octokit } = fakeOctokit({ comments: [], files: [], baseFiles })
    const source = await baseFileSource(octokit, repo, BASE_SHA, [
      'locales/{locale}/*.json'
    ])
    expect(await source.read('locales/ar/common.json')).toBe('{"a":"أ"}')
  })

  it('returns no files when the folder does not exist on the base branch', async () => {
    const { octokit } = fakeOctokit({ comments: [], files: [], baseFiles })
    const source = await baseFileSource(octokit, repo, BASE_SHA, [
      'messages/{locale}.json'
    ])
    expect(await source.glob(['**/*'])).toEqual([])
  })
})
