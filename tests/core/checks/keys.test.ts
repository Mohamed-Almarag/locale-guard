import { describe, expect, it } from 'vitest'
import { json, run, summarize } from '../../helpers.js'

const en = json({
  common: { save: 'Save', cancel: 'Cancel' },
  auction: { bid: { tooLow: 'Your bid must be higher than {amount}' } }
})

describe('missing-keys', () => {
  it('passes when every locale has every base key', async () => {
    const issues = await run('missing-keys', {
      'locales/en.json': en,
      'locales/ar.json': json({
        common: { save: 'حفظ', cancel: 'إلغاء' },
        auction: { bid: { tooLow: 'أعلى من {amount}' } }
      })
    })
    expect(issues).toEqual([])
  })

  it('reports a missing key with the base value and the closest parent line', async () => {
    const issues = await run('missing-keys', {
      'locales/en.json': en,
      'locales/ar.json': json({
        common: { save: 'حفظ', cancel: 'إلغاء' },
        auction: { bid: {} }
      })
    })
    expect(issues).toEqual([
      {
        check: 'missing-keys',
        severity: 'error',
        locale: 'ar',
        file: 'locales/ar.json',
        key: 'auction.bid.tooLow',
        line: 7,
        column: 5,
        message: 'Missing key `auction.bid.tooLow`',
        baseValue: 'Your bid must be higher than {amount}',
        isNew: true
      }
    ])
  })

  it('points to line 1 when no parent exists', async () => {
    const issues = await run('missing-keys', {
      'locales/en.json': en,
      'locales/ar.json': json({ common: { save: 'حفظ', cancel: 'إلغاء' } })
    })
    expect(issues[0]).toMatchObject({ key: 'auction.bid.tooLow', line: 1 })
  })

  it('reports every missing key in every locale', async () => {
    const issues = await run('missing-keys', {
      'locales/en.json': en,
      'locales/ar.json': json({ common: { save: 'حفظ' } }),
      'locales/fr.json': json({})
    })
    expect(summarize(issues)).toEqual([
      'ar auction.bid.tooLow:1 Missing key `auction.bid.tooLow`',
      'ar common.cancel:2 Missing key `common.cancel`',
      'fr auction.bid.tooLow:1 Missing key `auction.bid.tooLow`',
      'fr common.cancel:1 Missing key `common.cancel`',
      'fr common.save:1 Missing key `common.save`'
    ])
  })

  it('names the namespace file that should hold the key, even if it does not exist yet', async () => {
    const issues = await run(
      'missing-keys',
      {
        'locales/en/common.json': json({ save: 'Save' }),
        'locales/en/checkout.json': json({ pay: 'Pay' }),
        'locales/ar/common.json': json({ save: 'حفظ' })
      },
      { patterns: ['locales/{locale}/*.json'] }
    )
    expect(issues).toMatchObject([
      {
        key: 'checkout.pay',
        file: 'locales/ar/checkout.json',
        line: undefined
      }
    ])
  })

  it('skips keys of a file that could not be parsed', async () => {
    const issues = await run('missing-keys', {
      'locales/en.json': en,
      'locales/ar.json': '{ "common": '
    })
    expect(issues).toEqual([])
  })
})

describe('extra-keys', () => {
  it('passes when no locale has keys outside the base', async () => {
    const issues = await run('extra-keys', {
      'locales/en.json': en,
      'locales/ar.json': json({ common: { save: 'حفظ' } })
    })
    expect(issues).toEqual([])
  })

  it('reports a key that is not in the base, at its own line', async () => {
    const issues = await run('extra-keys', {
      'locales/en.json': en,
      'locales/ar.json': json({ common: { save: 'حفظ', sav: 'حفظ' } })
    })
    expect(issues).toEqual([
      {
        check: 'extra-keys',
        severity: 'warning',
        locale: 'ar',
        file: 'locales/ar.json',
        key: 'common.sav',
        line: 4,
        column: 5,
        message: 'Key `common.sav` does not exist in en',
        isNew: true
      }
    ])
  })

  it('reports a string where the base has an object', async () => {
    const issues = await run('extra-keys', {
      'locales/en.json': en,
      'locales/ar.json': json({ auction: 'مزاد' })
    })
    expect(summarize(issues)).toEqual([
      'ar auction:2 Key `auction` does not exist in en'
    ])
  })

  it('suggests the base key when only the letter case differs', async () => {
    const issues = await run('extra-keys', {
      'locales/en.json': json({ states: { add_state: 'Add state' } }),
      'locales/tr.json': json({ states: { add_State: 'Durum Ekle' } })
    })
    expect(issues.map((issue) => issue.hint)).toEqual([
      'Did you mean `states.add_state`?'
    ])
  })

  it('suggests the base key when one part of the path is spelled a little differently', async () => {
    const issues = await run('extra-keys', {
      'locales/en.json': json({
        services: { name: 'Name', code: 'Code' },
        connectionVerified: 'Connection verified'
      }),
      'locales/tr.json': json({
        service: { name: 'Ad', code: 'Kod' },
        connectionVerifeid: 'Bağlantı doğrulandı'
      })
    })
    expect(issues.map((issue) => [issue.key, issue.hint])).toEqual([
      ['service.name', 'Did you mean `services.name`?'],
      ['service.code', 'Did you mean `services.code`?'],
      ['connectionVerifeid', 'Did you mean `connectionVerified`?']
    ])
  })

  it('names a space at the end of the suggested key, since it cannot be seen', async () => {
    const issues = await run('extra-keys', {
      'locales/en.json': json({ deals: { 'attitude ': 'Attitude' } }),
      'locales/tr.json': json({ deals: { attitude: 'Tutum' } })
    })
    expect(issues.map((issue) => issue.hint)).toEqual([
      'Did you mean `deals.attitude ` (with a space at the end)?'
    ])
  })

  it('names a space at the end of the extra key itself', async () => {
    const issues = await run('extra-keys', {
      'locales/en.json': json({ deals: { attitude: 'Attitude' } }),
      'locales/tr.json': json({ deals: { 'attitude ': 'Tutum' } })
    })
    expect(issues.map((issue) => [issue.message, issue.hint])).toEqual([
      [
        'Key `deals.attitude ` (with a space at the end) does not exist in en',
        'Did you mean `deals.attitude`?'
      ]
    ])
  })

  it('names a space in a missing key', async () => {
    const issues = await run('missing-keys', {
      'locales/en.json': json({ deals: { 'attitude ': 'Attitude' } }),
      'locales/fr.json': json({})
    })
    expect(issues.map((issue) => issue.message)).toEqual([
      'Missing key `deals.attitude ` (with a space at the end)'
    ])
  })

  it('does not suggest a key the locale already has, or an unrelated one', async () => {
    const issues = await run('extra-keys', {
      'locales/en.json': json({ menu: { save: 'Save', home: 'Home' } }),
      'locales/ar.json': json({
        menu: { save: 'حفظ', Save: 'حفظ', exit: 'خروج' }
      })
    })
    expect(issues.map((issue) => [issue.key, issue.hint])).toEqual([
      ['menu.Save', undefined],
      ['menu.exit', undefined]
    ])
  })

  it('skips keys when the base file could not be parsed', async () => {
    const issues = await run('extra-keys', {
      'locales/en.json': '{',
      'locales/ar.json': json({ a: 'أ' })
    })
    expect(issues).toEqual([])
  })
})

describe('empty-values', () => {
  it('passes when every value has text', async () => {
    const issues = await run('empty-values', {
      'locales/en.json': en,
      'locales/ar.json': json({ common: { save: 'حفظ' } })
    })
    expect(issues).toEqual([])
  })

  it('reports empty and whitespace-only values in any locale', async () => {
    const issues = await run('empty-values', {
      'locales/en.json': json({ a: 'A', b: '' }),
      'locales/ar.json': json({ a: '   ', b: '' })
    })
    expect(summarize(issues)).toEqual([
      'ar a:2 Empty value for `a`',
      'ar b:3 Empty value for `b`',
      'en b:3 Empty value for `b`'
    ])
    expect(issues[0]?.baseValue).toBe('A')
  })
})
