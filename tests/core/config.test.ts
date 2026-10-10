import { describe, expect, it } from 'vitest'
import { parseConfig, readConfigFile } from '../../src/core/config.js'

const file = (values: Record<string, unknown>) => ({
  path: '.localeguard.yml',
  values
})

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
          'fail-on-existing': false,
          comment: true,
          annotations: true,
          'ignore-keys': [],
          'ignore-locales': [],
          'ignore-values': [],
          'disable-checks': []
        }
      }
    )
  })

  it('reads lists from new lines or commas', () => {
    const result = parseConfig({
      files: 'locales/{locale}.json\n messages/{locale}/*.yml ,',
      comment: 'false',
      'ignore-keys': 'legacy.*, admin.**'
    })
    expect(result.ok && result.config.files).toEqual([
      'locales/{locale}.json',
      'messages/{locale}/*.yml'
    ])
    expect(result.ok && result.config.comment).toBe(false)
    expect(result.ok && result.config['ignore-keys']).toEqual([
      'legacy.*',
      'admin.**'
    ])
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

  it('accepts the name of any supported translation library as the format', () => {
    const format = (name: string) => {
      const result = parseConfig({ files: 'l/{locale}.json', format: name })
      return result.ok ? result.config.format : result.errors
    }
    expect(format('@nuxtjs/i18n')).toBe('vue-i18n')
    expect(format('react-intl')).toBe('next-intl')
    expect(format('ICU')).toBe('next-intl')
    expect(format('react-i18next')).toBe('json')
    expect(format(' next-intl ')).toBe('next-intl')
  })

  it('asks for the library when the format names a framework', () => {
    expect(parseConfig({ files: 'l/{locale}.json', format: 'Nuxt' })).toEqual({
      ok: false,
      errors: [
        'Invalid "format": "Nuxt" is a framework, so name the translation library it uses: @nuxtjs/i18n'
      ]
    })
  })

  it('lists the formats for an unknown one', () => {
    const result = parseConfig({ files: 'l/{locale}.json', format: 'gettext' })
    expect(!result.ok && result.errors[0]).toMatch(
      /^Invalid "format": expected one of vue-i18n, @nuxtjs\/i18n, icu, next-intl/
    )
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
    expect(result).toEqual({
      ok: false,
      errors: [
        'Invalid "annotations": expected true or false (got "yes please")'
      ]
    })
  })

  it('rejects an unknown check name', () => {
    const result = parseConfig({
      files: 'l/{locale}.json',
      'disable-checks': 'untranslated, plurals'
    })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors[0]).toMatch(
      /^Invalid "disable-checks": expected one of parse-error, missing-keys/
    )
  })
})

describe('parseConfig with a config file', () => {
  it('reads settings from the file, with YAML lists and booleans', () => {
    const result = parseConfig(
      {},
      file({
        files: ['locales/{locale}.json'],
        format: 'vue-i18n',
        comment: false,
        'ignore-values': ['Google', 'OK']
      })
    )
    expect(result.ok && result.config).toMatchObject({
      files: ['locales/{locale}.json'],
      format: 'vue-i18n',
      comment: false,
      'ignore-values': ['Google', 'OK']
    })
  })

  it('lets an input that was set win over the file', () => {
    const result = parseConfig(
      { 'fail-on': 'warning', format: '' },
      file({
        files: 'l/{locale}.json',
        'fail-on': 'never',
        format: 'next-intl'
      })
    )
    expect(result.ok && result.config['fail-on']).toBe('warning')
    expect(result.ok && result.config.format).toBe('next-intl')
  })

  it('names the file in errors about its settings', () => {
    expect(
      parseConfig({}, file({ files: 'l/{locale}.json', 'fail-on': 'always' }))
    ).toEqual({
      ok: false,
      errors: [
        'Invalid "fail-on" in .localeguard.yml: expected one of error, warning, never (got "always")'
      ]
    })
  })

  it('reports unknown settings, which are usually typos', () => {
    expect(
      parseConfig({}, file({ files: 'l/{locale}.json', 'ignore-key': ['a'] }))
    ).toEqual({
      ok: false,
      errors: ['Unknown setting "ignore-key" in .localeguard.yml']
    })
  })
})

describe('readConfigFile', () => {
  it('reads a YAML map', () => {
    expect(readConfigFile('.localeguard.yml', 'format: vue-i18n\n')).toEqual({
      path: '.localeguard.yml',
      values: { format: 'vue-i18n' }
    })
  })

  it('accepts an empty file', () => {
    expect(readConfigFile('.localeguard.yml', '')).toEqual({
      path: '.localeguard.yml',
      values: {}
    })
  })

  it('explains invalid YAML or a non-map file', () => {
    expect(readConfigFile('.localeguard.yml', 'a: [1')).toMatch(
      /^\.localeguard\.yml is not valid YAML/
    )
    expect(readConfigFile('.localeguard.yml', '- a\n- b')).toBe(
      '.localeguard.yml must contain settings as "name: value" lines'
    )
  })
})
