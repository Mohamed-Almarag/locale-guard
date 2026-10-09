import { describe, expect, it } from 'vitest'
import { parseConfig } from '../../src/core/config.js'

describe('parseConfig', () => {
  it('fills in defaults for settings that were not given', () => {
    expect(parseConfig({ files: 'locales/{locale}.json', format: '' })).toEqual(
      {
        ok: true,
        config: {
          format: 'json',
          'base-locale': 'en',
          files: ['locales/{locale}.json'],
          'fail-on': 'error',
          comment: true,
          annotations: true
        }
      }
    )
  })

  it('reads lists from new lines or commas', () => {
    const result = parseConfig({
      files: 'locales/{locale}.json\n messages/{locale}/*.yml ,',
      comment: 'false'
    })
    expect(result.ok && result.config.files).toEqual([
      'locales/{locale}.json',
      'messages/{locale}/*.yml'
    ])
    expect(result.ok && result.config.comment).toBe(false)
  })

  it('explains a wrong value', () => {
    expect(
      parseConfig({ files: 'l/{locale}.json', 'fail-on': 'errors' })
    ).toEqual({
      ok: false,
      errors: [
        'Invalid "fail-on": expected one of error, warning, never (got "errors")'
      ]
    })
  })

  it('requires files', () => {
    expect(parseConfig({})).toEqual({
      ok: false,
      errors: ['Invalid "files": this setting is required']
    })
  })

  it('rejects a pattern without {locale}', () => {
    expect(parseConfig({ files: 'locales/en.json' })).toEqual({
      ok: false,
      errors: [
        'Invalid "files": Pattern "locales/en.json" must contain {locale} (got "locales/en.json")'
      ]
    })
  })

  it('rejects a flag that is not true or false', () => {
    const result = parseConfig({
      files: 'l/{locale}.json',
      annotations: 'yes please'
    })
    expect(result.ok).toBe(false)
  })
})
