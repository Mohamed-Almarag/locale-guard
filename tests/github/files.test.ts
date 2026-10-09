import { describe, expect, it } from 'vitest'
import { listChangedFiles, touchesLocales } from '../../src/github/files.js'
import { fakeOctokit } from './fake-octokit.js'

describe('listChangedFiles', () => {
  it('returns every file, with the old name of renamed files', async () => {
    const { octokit, paginate } = fakeOctokit({
      comments: [],
      files: [
        { filename: 'src/app.ts' },
        { filename: 'locales/ar.json', previous_filename: 'lang/ar.json' }
      ]
    })

    const files = await listChangedFiles(octokit, { owner: 'o', repo: 'r' }, 4)

    expect(files).toEqual(['src/app.ts', 'locales/ar.json', 'lang/ar.json'])
    expect(paginate).toHaveBeenCalledWith(expect.anything(), {
      owner: 'o',
      repo: 'r',
      pull_number: 4,
      per_page: 100
    })
  })
})

describe('touchesLocales', () => {
  const patterns = ['locales/{locale}.json', 'messages/{locale}/*.yml']

  it('is true when a locale file changed', () => {
    expect(touchesLocales(['src/a.ts', 'locales/ar.json'], patterns)).toBe(true)
    expect(touchesLocales(['messages/fr/common.yml'], patterns)).toBe(true)
  })

  it('is false when only other files changed', () => {
    expect(
      touchesLocales(
        ['src/a.ts', 'locales/README.md', 'locales/ar/x.json'],
        patterns
      )
    ).toBe(false)
  })

  it('is true when one of the extra files changed', () => {
    expect(
      touchesLocales(['.localeguard.yml'], patterns, ['.localeguard.yml'])
    ).toBe(true)
  })
})
