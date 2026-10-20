import { describe, expect, it } from 'vitest'
import { readArgs } from '../../src/cli/args.js'

describe('readArgs', () => {
  it('reads settings as the Action inputs do', () => {
    const args = readArgs([
      '--files',
      'a/{locale}.json',
      '--files',
      'b/{locale}.json',
      '--format',
      'next-intl',
      '--ignore-tags',
      '--no-keys-as-text'
    ])
    expect(args.settings).toEqual({
      files: 'a/{locale}.json\nb/{locale}.json',
      format: 'next-intl',
      'ignore-tags': 'true',
      'keys-as-text': 'false'
    })
  })

  it('reads the CLI options', () => {
    expect(
      readArgs(['--base', 'main', '--output', 'report.md', '--config', 'x.yml'])
    ).toEqual({
      settings: {},
      base: 'main',
      all: false,
      staged: false,
      output: 'report.md',
      config: 'x.yml',
      help: false,
      version: false
    })
    expect(readArgs(['--all', '--staged', '-h', '-v'])).toMatchObject({
      all: true,
      staged: true,
      help: true,
      version: true
    })
  })

  it('leaves out settings that were not given', () => {
    expect(readArgs([]).settings).toEqual({})
  })

  it('rejects unknown options and Action-only settings', () => {
    expect(() => readArgs(['--fromat', 'json'])).toThrow(/--fromat/)
    expect(() => readArgs(['--comment', 'false'])).toThrow(/--comment/)
    expect(() => readArgs(['locales'])).toThrow(/locales/)
  })

  it('rejects an option without its value', () => {
    expect(() => readArgs(['--base'])).toThrow(/--base/)
  })
})
