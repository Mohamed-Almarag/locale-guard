import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runCli } from '../../src/cli/run.js'
import { json } from '../helpers.js'
import { folder, git, repo, write } from './repo.js'

async function cli(cwd: string, ...argv: string[]) {
  const out: string[] = []
  const err: string[] = []
  const code = await runCli(argv, {
    cwd,
    version: '1.2.3',
    out: (text) => out.push(text),
    err: (text) => err.push(text),
    style: (_, text) => text
  })
  return { code, out: out.join('\n'), err: err.join('\n') }
}

const CONFIG = '.localeguard.yml'

// ar already misses `old` in the first commit
function project() {
  return repo({
    [CONFIG]: 'files: locales/{locale}.json\n',
    'locales/en.json': json({ old: 'Old', a: 'A' }),
    'locales/ar.json': json({ a: 'أ' })
  })
}

describe('runCli', () => {
  it('fails on issues added since the last commit only', async () => {
    const root = project()
    write(root, {
      'locales/en.json': json({ old: 'Old', a: 'A', fresh: 'New' })
    })

    const result = await cli(root)
    expect(result.code).toBe(1)
    expect(result.out).toContain('Missing key fresh')
    expect(result.out).not.toContain('Missing key old')
    expect(result.out).toContain(
      '✖ 1 new issue (1 error) since the last commit'
    )
    expect(result.out).toContain(
      '1 existing issue is not shown. --all lists every issue.'
    )
  })

  it('passes when only old issues are left', async () => {
    const result = await cli(project())
    expect(result.code).toBe(0)
    expect(result.out).toContain(
      '✔ No new translation issues since the last commit.'
    )
  })

  it('checks the staged files with --staged', async () => {
    const root = project()
    write(root, {
      'locales/en.json': json({ old: 'Old', a: 'A', fresh: 'New' })
    })
    git(root, 'add', 'locales/en.json')
    // Translated on disk, but the commit would not hold it
    write(root, { 'locales/ar.json': json({ a: 'أ', fresh: 'جديد' }) })

    expect((await cli(root)).code).toBe(0)
    const result = await cli(root, '--staged')
    expect(result.code).toBe(1)
    expect(result.out).toContain('Missing key fresh')
  })

  it('needs git for --staged', async () => {
    const result = await cli(
      folder({ [CONFIG]: 'files: locales/{locale}.json\n' }),
      '--staged'
    )
    expect(result.code).toBe(2)
    expect(result.err).toContain('not in a git repository')
  })

  it('lists and counts every issue with --all', async () => {
    const result = await cli(project(), '--all')
    expect(result.code).toBe(1)
    expect(result.out).toContain('Missing key old')
    expect(result.out).toContain('✖ 1 issue (1 error)')
  })

  it('compares with another branch', async () => {
    const root = project()
    git(root, 'checkout', '-q', '-b', 'feature')
    write(root, {
      'locales/en.json': json({ old: 'Old', a: 'A', fresh: 'New' })
    })
    git(root, 'commit', '-q', '-am', 'add fresh')

    expect((await cli(root)).code).toBe(0)
    const result = await cli(root, '--base', 'main')
    expect(result.code).toBe(1)
    expect(result.out).toContain('✖ 1 new issue (1 error) compared with main')
  })

  it('lists existing issues when they can fail the run', async () => {
    const result = await cli(project(), '--fail-on-existing')
    expect(result.code).toBe(1)
    expect(result.out).toContain('Existing issues')
    expect(result.out).toContain('Missing key old')
  })

  it('checks every issue outside git, and says why', async () => {
    const result = await cli(
      folder({
        [CONFIG]: 'files: locales/{locale}.json\n',
        'locales/en.json': json({ old: 'Old' }),
        'locales/ar.json': json({})
      })
    )
    expect(result.code).toBe(1)
    expect(result.out).toContain(
      'This folder is not in a git repository, so every issue is checked.'
    )
    expect(result.out).toContain('Missing key old')
  })

  it('checks every issue before the first commit', async () => {
    const root = folder({
      [CONFIG]: 'files: locales/{locale}.json\n',
      'locales/en.json': json({ old: 'Old' }),
      'locales/ar.json': json({})
    })
    git(root, 'init', '-q')
    const result = await cli(root)
    expect(result.code).toBe(1)
    expect(result.out).toContain(
      'There is no commit yet, so every issue is checked.'
    )
  })

  it('follows fail-on', async () => {
    const result = await cli(project(), '--all', '--fail-on', 'never')
    expect(result.code).toBe(0)
  })

  it('writes the report as Markdown', async () => {
    const root = project()
    write(root, {
      'locales/en.json': json({ old: 'Old', a: 'A', fresh: 'New' })
    })

    const result = await cli(root, '--output', 'reports/i18n.md')
    expect(result.out).toContain('Report written to reports/i18n.md')
    const report = readFileSync(join(root, 'reports/i18n.md'), 'utf8')
    expect(report).toContain(
      'New since the last commit: 1 · Already existing: 1'
    )
    expect(report).toContain('[`fresh`](../locales/en.json#L4)')
    expect(report).not.toContain('PR')
  })

  describe('settings', () => {
    it('explains what to add when there are none', async () => {
      const result = await cli(folder())
      expect(result.code).toBe(2)
      expect(result.err).toContain('No .localeguard.yml was found')
      expect(result.err).toContain('npx locale-guard-cli --files')
    })

    it('lets options win over the config file', async () => {
      const root = project()
      const result = await cli(root, '--all', '--base-locale', 'ar')
      expect(result.out).toContain('Key old does not exist in ar')
    })

    it('reports invalid settings with exit code 2', async () => {
      const result = await cli(project(), '--fail-on', 'sometimes')
      expect(result.code).toBe(2)
      expect(result.err).toContain('Locale Guard settings are not valid:')
      expect(result.err).toContain('Invalid "fail-on"')
    })

    it('reports a missing config file named in the command', async () => {
      const result = await cli(project(), '--config', 'other.yml')
      expect(result.code).toBe(2)
      expect(result.err).toBe('Settings file "other.yml" was not found.')
    })

    it('accepts Action-only settings in the config file', async () => {
      const root = project()
      write(root, {
        [CONFIG]:
          'files: locales/{locale}.json\ncomment: false\ncheck-when: always\n'
      })
      expect((await cli(root)).code).toBe(0)
    })

    it('reports locale files that cannot be found', async () => {
      const result = await cli(project(), '--files', 'nope/{locale}.json')
      expect(result.code).toBe(2)
      expect(result.err).toContain('No locale files match "nope/{locale}.json"')
    })
  })

  describe('usage', () => {
    it('rejects an unknown base', async () => {
      const result = await cli(project(), '--base', 'nope')
      expect(result.code).toBe(2)
      expect(result.err).toBe(
        '--base "nope" is not a branch, tag or commit in this repository.'
      )
    })

    it('rejects --all with --base', async () => {
      const result = await cli(project(), '--all', '--base', 'main')
      expect(result.code).toBe(2)
    })

    it('rejects unknown options', async () => {
      const result = await cli(project(), '--fromat', 'json')
      expect(result.code).toBe(2)
      expect(result.err).toContain('Run locale-guard-cli --help')
    })

    it('shows the help and the version', async () => {
      expect((await cli(folder(), '--help')).out).toContain(
        'Usage: locale-guard-cli [options]'
      )
      expect(await cli(folder(), '-v')).toEqual({
        code: 0,
        out: '1.2.3',
        err: ''
      })
    })
  })
})
