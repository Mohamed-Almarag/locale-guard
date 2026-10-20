import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  commitFileSource,
  resolveCommit,
  stagedFileSource
} from '../../src/cli/git.js'
import { folder, git, repo, write } from './repo.js'

describe('resolveCommit', () => {
  it('finds a branch, a tag or a commit', async () => {
    const root = repo({ 'a.txt': 'a' })
    git(root, 'tag', 'v1')
    const sha = git(root, 'rev-parse', 'HEAD').trim()

    for (const ref of ['HEAD', 'main', 'v1', sha.slice(0, 7)]) {
      expect(await resolveCommit(root, ref)).toEqual({ ok: true, sha })
    }
  })

  it('tells a missing ref from a folder without git', async () => {
    const root = repo({ 'a.txt': 'a' })
    expect(await resolveCommit(root, 'nope')).toEqual({
      ok: false,
      reason: 'not-found'
    })
    expect(await resolveCommit(folder(), 'HEAD')).toEqual({
      ok: false,
      reason: 'no-git'
    })
  })

  it('finds nothing before the first commit', async () => {
    const root = folder()
    git(root, 'init', '-q')
    expect(await resolveCommit(root, 'HEAD')).toEqual({
      ok: false,
      reason: 'not-found'
    })
  })

  it('does not read a ref as an option', async () => {
    const root = repo({ 'a.txt': 'a' })
    expect(await resolveCommit(root, '--all')).toEqual({
      ok: false,
      reason: 'not-found'
    })
  })
})

describe('commitFileSource', () => {
  it('reads the committed files, not the working tree', async () => {
    const root = repo({
      'locales/en.json': '{"a":"A"}',
      'locales/ar.json': '{"a":"أ"}',
      'src/app.ts': ''
    })
    write(root, { 'locales/en.json': '{"a":"changed"}' })
    const sha = git(root, 'rev-parse', 'HEAD').trim()

    const source = await commitFileSource(root, sha, ['locales/{locale}.json'])
    expect((await source.glob(['locales/*.json'])).sort()).toEqual([
      'locales/ar.json',
      'locales/en.json'
    ])
    expect(await source.read('locales/en.json')).toBe('{"a":"A"}')
    expect(await source.read('locales/ar.json')).toBe('{"a":"أ"}')
  })

  it('uses paths relative to a subfolder, as the working tree does', async () => {
    const root = repo({ 'apps/web/locales/en.json': '{"a":"A"}' })
    const sha = git(root, 'rev-parse', 'HEAD').trim()

    const source = await commitFileSource(join(root, 'apps/web'), sha, [
      'locales/{locale}.json'
    ])
    expect(await source.glob(['locales/*.json'])).toEqual(['locales/en.json'])
    expect(await source.read('locales/en.json')).toBe('{"a":"A"}')
  })
})

describe('stagedFileSource', () => {
  it('reads what the next commit holds, not unstaged edits', async () => {
    const root = repo({
      'locales/en.json': '{"a":"A"}',
      'locales/ar.json': '{"a":"أ"}'
    })
    write(root, {
      'locales/en.json': '{"a":"A","b":"B"}',
      'locales/ar.json': '{"a":"أ","b":"ب"}',
      'locales/fr.json': '{"a":"A"}'
    })
    git(root, 'add', 'locales/en.json', 'locales/fr.json')

    const source = await stagedFileSource(root, ['locales/{locale}.json'])
    expect((await source.glob(['locales/*.json'])).sort()).toEqual([
      'locales/ar.json',
      'locales/en.json',
      'locales/fr.json'
    ])
    expect(await source.read('locales/en.json')).toBe('{"a":"A","b":"B"}')
    expect(await source.read('locales/ar.json')).toBe('{"a":"أ"}')
  })
})
