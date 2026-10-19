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
          'check-when': 'locale-changes',
          comment: true,
          annotations: true,
          'ignore-keys': [],
          'ignore-locales': [],
          'ignore-values': [],
          'disable-checks': [],
          'ignore-tags': false,
          'keys-as-text': false
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

  it('keeps an ignore-values line whole, so a value can contain commas', () => {
    const result = parseConfig({
      files: 'locales/{locale}.json',
      'ignore-values': 'Visa, Mastercard, Amex\nPayPal'
    })
    expect(result.ok && result.config['ignore-values']).toEqual([
      'Visa, Mastercard, Amex',
      'Visa',
      'Mastercard',
      'Amex',
      'PayPal'
    ])
  })

  it('does not split ignore-values written as a YAML list', () => {
    const result = parseConfig(
      {},
      file({
        files: ['locales/{locale}.json'],
        'ignore-values': ['Visa, Mastercard, Amex', 'PayPal']
      })
    )
    expect(result.ok && result.config['ignore-values']).toEqual([
      'Visa, Mastercard, Amex',
      'PayPal'
    ])
  })

  it('rejects an unknown check-when value', () => {
    const result = parseConfig({
      files: 'locales/{locale}.json',
      'check-when': 'sometimes'
    })
    expect(!result.ok && result.errors).toEqual([
      'Invalid "check-when": expected one of locale-changes, always (got "sometimes")'
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

  it('reads a base file named without its locale', () => {
    const result = parseConfig({
      files: 'lang/main-{locale}.json',
      'base-file': './lang\\main.json'
    })
    expect(result.ok && result.config['base-file']).toBe('lang/main.json')
  })

  it('rejects a base file with {locale} or another extension', () => {
    expect(
      parseConfig({ files: 'l/{locale}.json', 'base-file': 'l/{locale}.json' })
    ).toMatchObject({
      ok: false,
      errors: [expect.stringContaining('must be one file, without {locale}')]
    })
    expect(
      parseConfig({ files: 'l/{locale}.json', 'base-file': 'l/main.txt' })
    ).toMatchObject({
      ok: false,
      errors: [expect.stringContaining('must be a .json, .yml or .yaml file')]
    })
  })

  it('accepts ignore-tags for ICU formats only', () => {
    expect(
      parseConfig({
        files: 'l/{locale}.json',
        format: 'react-intl',
        'ignore-tags': 'true'
      })
    ).toMatchObject({ ok: true, config: { 'ignore-tags': true } })
    expect(
      parseConfig({
        files: 'l/{locale}.json',
        format: 'vue-i18n',
        'ignore-tags': 'true'
      })
    ).toEqual({
      ok: false,
      errors: [
        'Invalid "ignore-tags": works only with ICU messages: format icu, next-intl, use-intl, react-intl or formatjs (got "true")'
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
