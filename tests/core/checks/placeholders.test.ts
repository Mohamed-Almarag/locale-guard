import { describe, expect, it } from 'vitest'
import { json, run, summarize } from '../../helpers.js'

const vue = { format: 'vue-i18n' as const }
const icu = { format: 'next-intl' as const }

describe('placeholder-mismatch: vue-i18n', () => {
  it('passes when named and list placeholders match, in any order', async () => {
    const issues = await run(
      'placeholder-mismatch',
      {
        'locales/en.json': json({ a: 'Hello {name}, {0} new' }),
        'locales/ar.json': json({ a: '{0} جديد يا {name}' })
      },
      vue
    )
    expect(issues).toEqual([])
  })

  it('reports a missing named placeholder', async () => {
    const issues = await run(
      'placeholder-mismatch',
      {
        'locales/en.json': json({ a: 'Bid higher than {amount}' }),
        'locales/fr.json': json({ a: 'Enchère plus haute' })
      },
      vue
    )
    expect(issues).toMatchObject([
      {
        severity: 'error',
        locale: 'fr',
        key: 'a',
        line: 2,
        message: '`a`: missing `{amount}`',
        baseValue: 'Bid higher than {amount}'
      }
    ])
  })

  it('reports a misspelled placeholder as missing and unexpected', async () => {
    const issues = await run(
      'placeholder-mismatch',
      {
        'locales/en.json': json({ a: 'Bid of {amount}' }),
        'locales/fr.json': json({ a: 'Enchère de {amout}' })
      },
      vue
    )
    expect(summarize(issues)).toEqual([
      'fr a:2 `a`: missing `{amount}`, unexpected `{amout}`'
    ])
  })

  it('reports a changed list placeholder', async () => {
    const issues = await run(
      'placeholder-mismatch',
      {
        'locales/en.json': json({ a: '{0} of {1}' }),
        'locales/ar.json': json({ a: '{0} من {2}' })
      },
      vue
    )
    expect(issues[0]?.message).toBe('`a`: missing `{1}`, unexpected `{2}`')
  })

  it('does not compare linked messages, since translators may inline the text', async () => {
    const issues = await run(
      'placeholder-mismatch',
      {
        'locales/en.json': json({ save: 'Save', a: '@:save bid' }),
        'locales/ar.json': json({ save: 'حفظ', a: 'حفظ المزايدة' })
      },
      vue
    )
    expect(issues).toEqual([])
  })

  it('compares placeholders across plural branches', async () => {
    const issues = await run(
      'placeholder-mismatch',
      {
        'locales/en.json': json({ a: 'no items | {count} items' }),
        'locales/ar.json': json({ a: 'لا عناصر | عناصر' })
      },
      vue
    )
    expect(issues[0]?.message).toBe('`a`: missing `{count}`')
  })

  it('skips empty translations, which empty-values reports', async () => {
    const issues = await run(
      'placeholder-mismatch',
      {
        'locales/en.json': json({ a: 'Hi {name}' }),
        'locales/ar.json': json({ a: '' })
      },
      vue
    )
    expect(issues).toEqual([])
  })
})

describe('placeholder-mismatch: ICU', () => {
  it('passes when arguments, plurals, selects and tags match', async () => {
    const issues = await run(
      'placeholder-mismatch',
      {
        'locales/en.json': json({
          a: 'Total {amount, number}',
          b: '{count, plural, one {# item} other {# items}}',
          c: '{gender, select, male {He} other {They}}',
          d: 'I agree to the <link>terms</link>'
        }),
        'locales/ar.json': json({
          a: 'المجموع {amount}',
          b: '{count, plural, one {عنصر} other {# عناصر}}',
          c: '{gender, select, male {هو} other {هم}}',
          d: 'أوافق على <link>الشروط</link>'
        })
      },
      icu
    )
    expect(issues).toEqual([])
  })

  it('reports a missing argument', async () => {
    const issues = await run(
      'placeholder-mismatch',
      {
        'locales/en.json': json({ a: 'Coupon "{code}" is not valid' }),
        'locales/ar.json': json({ a: 'الكوبون غير صالح' })
      },
      icu
    )
    expect(issues[0]?.message).toBe('`a`: missing `{code}`')
  })

  it('reports a renamed plural or select argument', async () => {
    const issues = await run(
      'placeholder-mismatch',
      {
        'locales/en.json': json({
          a: '{count, plural, one {#} other {#}}',
          b: '{gender, select, male {He} other {They}}'
        }),
        'locales/ar.json': json({
          a: '{cnt, plural, one {#} other {#}}',
          b: '{gendr, select, male {هو} other {هم}}'
        })
      },
      icu
    )
    expect(summarize(issues)).toEqual([
      'ar a:2 `a`: missing `{count}`, unexpected `{cnt}`',
      'ar b:3 `b`: missing `{gender}`, unexpected `{gendr}`'
    ])
  })

  it('reports a missing or extra rich text tag', async () => {
    const issues = await run(
      'placeholder-mismatch',
      {
        'locales/en.json': json({ a: 'Read <link>terms</link>' }),
        'locales/ar.json': json({ a: 'اقرأ <b>الشروط</b>' })
      },
      icu
    )
    expect(issues[0]?.message).toBe('`a`: missing `<link>`, unexpected `<b>`')
  })
})

describe('placeholder-mismatch: plain JSON', () => {
  it('passes when {name} and {{name}} placeholders match', async () => {
    const issues = await run('placeholder-mismatch', {
      'locales/en.json': json({ a: 'Hi {name}', b: 'Hi {{name}}' }),
      'locales/ar.json': json({ a: 'مرحبا {name}', b: 'مرحبا {{ name }}' })
    })
    expect(issues).toEqual([])
  })

  it('reports a placeholder that changed style', async () => {
    const issues = await run('placeholder-mismatch', {
      'locales/en.json': json({ a: 'Hi {{name}}' }),
      'locales/ar.json': json({ a: 'مرحبا {name}' })
    })
    expect(issues[0]?.message).toBe(
      '`a`: missing `{{name}}`, unexpected `{name}`'
    )
  })
})

describe('invalid-syntax', () => {
  it('passes for valid messages', async () => {
    const issues = await run(
      'invalid-syntax',
      { 'locales/en.json': json({ a: "support{'@'}example.com" }) },
      vue
    )
    expect(issues).toEqual([])
  })

  it('reports a vue-i18n message with a raw @ in any locale', async () => {
    const issues = await run(
      'invalid-syntax',
      {
        'locales/en.json': json({ a: 'Mail support@example.com' }),
        'locales/ar.json': json({ a: 'راسل support@example.com' })
      },
      vue
    )
    expect(issues.map((i) => i.locale)).toEqual(['ar', 'en'])
  })

  it('reports an ICU message with an unclosed argument', async () => {
    const issues = await run(
      'invalid-syntax',
      {
        'locales/en.json': json({ a: 'Hi {name}' }),
        'locales/ar.json': json({ a: 'مرحبا {name' })
      },
      icu
    )
    expect(issues).toMatchObject([
      { severity: 'error', locale: 'ar', key: 'a', line: 2 }
    ])
  })

  it('never reports plain JSON messages', async () => {
    const issues = await run('invalid-syntax', {
      'locales/en.json': json({ a: 'Hi {name' })
    })
    expect(issues).toEqual([])
  })
})

describe('broken-linked-messages', () => {
  it('passes when every linked key exists in the same locale', async () => {
    const issues = await run(
      'broken-linked-messages',
      {
        'locales/en.json': json({
          common: { save: 'Save' },
          a: '@:common.save bid',
          b: '@.lower:common.save'
        })
      },
      vue
    )
    expect(issues).toEqual([])
  })

  it('reports a link to a key that does not exist', async () => {
    const issues = await run(
      'broken-linked-messages',
      {
        'locales/en.json': json({
          common: { save: 'Save' },
          a: '@:common.save'
        }),
        'locales/ar.json': json({ common: { save: 'حفظ' }, a: '@:common.sav' })
      },
      vue
    )
    expect(issues).toEqual([
      {
        check: 'broken-linked-messages',
        severity: 'error',
        locale: 'ar',
        file: 'locales/ar.json',
        key: 'a',
        line: 5,
        column: 3,
        message: '`a` links to `@:common.sav`, which does not exist in ar',
        isNew: true
      }
    ])
  })

  it('reports a link to a key that exists only in another locale', async () => {
    const issues = await run(
      'broken-linked-messages',
      {
        'locales/en.json': json({ save: 'Save', a: '@:save' }),
        'locales/ar.json': json({ a: '@:save' })
      },
      vue
    )
    expect(summarize(issues)).toEqual([
      'ar a:2 `a` links to `@:save`, which does not exist in ar'
    ])
  })

  it('only runs for vue-i18n', async () => {
    const issues = await run('broken-linked-messages', {
      'locales/en.json': json({ a: '@:missing' })
    })
    expect(issues).toEqual([])
  })
})
