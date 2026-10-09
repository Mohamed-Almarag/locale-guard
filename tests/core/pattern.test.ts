import { describe, expect, it } from 'vitest'
import {
  matchPattern,
  toGlob,
  validatePattern
} from '../../src/core/loaders/pattern.js'

describe('validatePattern', () => {
  it('accepts a pattern with {locale} once', () => {
    expect(validatePattern('locales/{locale}.json')).toBeUndefined()
  })

  it('rejects a pattern without {locale}', () => {
    expect(validatePattern('locales/en.json')).toMatch(/must contain/)
  })

  it('rejects a pattern with {locale} twice', () => {
    expect(validatePattern('{locale}/{locale}.json')).toMatch(/only once/)
  })
})

describe('toGlob', () => {
  it('replaces {locale} with a star', () => {
    expect(toGlob('./locales/{locale}/*.json')).toBe('locales/*/*.json')
  })
})

describe('matchPattern', () => {
  it('matches a single file per locale', () => {
    expect(matchPattern('locales/{locale}.json', 'locales/ar.json')).toEqual({
      locale: 'ar',
      namespace: ''
    })
  })

  it('matches region codes', () => {
    expect(
      matchPattern('messages/{locale}.json', 'messages/pt-BR.json')
    ).toEqual({ locale: 'pt-BR', namespace: '' })
  })

  it('uses the file name as the namespace', () => {
    expect(
      matchPattern('locales/{locale}/*.json', 'locales/ar/checkout.json')
    ).toEqual({ locale: 'ar', namespace: 'checkout' })
  })

  it('uses nested folders as the namespace', () => {
    expect(
      matchPattern('locales/{locale}/**/*.yml', 'locales/ar/admin/users.yml')
    ).toEqual({ locale: 'ar', namespace: 'admin.users' })
    expect(
      matchPattern('locales/{locale}/**/*.yml', 'locales/ar/users.yml')
    ).toEqual({ locale: 'ar', namespace: 'users' })
  })

  it('does not treat an extension wildcard as a namespace', () => {
    expect(matchPattern('locales/{locale}.*', 'locales/ar.yaml')).toEqual({
      locale: 'ar',
      namespace: ''
    })
  })

  it('returns undefined for paths outside the pattern', () => {
    expect(matchPattern('locales/{locale}.json', 'src/ar.json')).toBeUndefined()
    expect(
      matchPattern('locales/{locale}.json', 'locales/ar/x.json')
    ).toBeUndefined()
  })

  it('accepts Windows separators', () => {
    expect(matchPattern('locales/{locale}.json', 'locales\\ar.json')).toEqual({
      locale: 'ar',
      namespace: ''
    })
  })
})
