import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/core/analyze.js'
import { loadProject, localFileSource } from '../../src/core/loaders/index.js'
import type { CheckId, Format, Issue } from '../../src/core/types.js'
import { summarize } from '../helpers.js'

async function analyzeFixture(
  dir: string,
  pattern: string,
  format: Format,
  only: CheckId[]
): Promise<Issue[]> {
  const project = await loadProject(localFileSource(`tests/fixtures/${dir}`), {
    patterns: [pattern],
    baseLocale: 'en'
  })
  return analyze(project, { format }).filter((issue) =>
    only.includes(issue.check)
  )
}

const KEY_CHECKS: CheckId[] = [
  'parse-error',
  'missing-keys',
  'extra-keys',
  'empty-values'
]

describe('vue-project fixture', () => {
  it('finds the key issues with their lines', async () => {
    const issues = await analyzeFixture(
      'vue-project',
      'locales/{locale}.json',
      'vue-i18n',
      KEY_CHECKS
    )
    expect(summarize(issues)).toEqual([
      'ar auction.bid.tooLow:8 Missing key `auction.bid.tooLow`',
      'ar common.cancel:4 Empty value for `common.cancel`',
      'ar auction.oldKey:12 Key `auction.oldKey` does not exist in en'
    ])
    expect(issues[0]).toMatchObject({
      file: 'locales/ar.json',
      baseValue: 'Your bid must be higher than {amount}'
    })
  })
})

const MESSAGE_CHECKS: CheckId[] = [
  'invalid-syntax',
  'placeholder-mismatch',
  'broken-linked-messages'
]

describe('vue-project fixture: placeholders', () => {
  it('finds placeholder and linked message issues', async () => {
    const issues = await analyzeFixture(
      'vue-project',
      'locales/{locale}.json',
      'vue-i18n',
      MESSAGE_CHECKS
    )
    expect(summarize(issues)).toEqual([
      'ar auction.saveBid:11 `auction.saveBid` links to `@:common.sav`, which does not exist in ar',
      'ar inbox.greeting:18 `inbox.greeting`: missing `{name}`',
      'fr auction.bid.placed:9 `auction.bid.placed`: missing `{amount}`, unexpected `{amout}`'
    ])
  })
})

describe('next-project fixture: placeholders', () => {
  it('finds argument and tag issues', async () => {
    const issues = await analyzeFixture(
      'next-project',
      'messages/{locale}.json',
      'next-intl',
      MESSAGE_CHECKS
    )
    expect(summarize(issues)).toEqual([
      'ar Terms.agree:9 `Terms.agree`: missing `<link>`',
      'ar Profile.welcome:12 `Profile.welcome`: missing `{gender}`, unexpected `{gendr}`'
    ])
  })
})

const POLISH_CHECKS: CheckId[] = ['untranslated', 'plural-forms']

describe('vue-project fixture: untranslated and plurals', () => {
  it('finds untranslated values', async () => {
    const issues = await analyzeFixture(
      'vue-project',
      'locales/{locale}.json',
      'vue-i18n',
      POLISH_CHECKS
    )
    expect(summarize(issues)).toEqual([
      'ar common.ok:5 `common.ok`: no Arabic letters, looks untranslated',
      'fr auction.bid.tooLow:10 `auction.bid.tooLow`: same text as en'
    ])
  })
})

describe('next-project fixture: untranslated and plurals', () => {
  it('finds untranslated text and missing Arabic plural forms', async () => {
    const issues = await analyzeFixture(
      'next-project',
      'messages/{locale}.json',
      'next-intl',
      POLISH_CHECKS
    )
    expect(summarize(issues)).toEqual([
      'ar Checkout.total:3 `Checkout.total`: no Arabic letters, looks untranslated',
      'ar Cart.items:6 `Cart.items`: Arabic uses zero, one, two, few, many, other. Missing: zero, two, few, many'
    ])
  })
})

describe('next-project fixture', () => {
  it('finds the key issues with their lines', async () => {
    const issues = await analyzeFixture(
      'next-project',
      'messages/{locale}.json',
      'next-intl',
      KEY_CHECKS
    )
    expect(summarize(issues)).toEqual([
      'ar Checkout.coupon.invalid:2 Missing key `Checkout.coupon.invalid`'
    ])
  })
})
