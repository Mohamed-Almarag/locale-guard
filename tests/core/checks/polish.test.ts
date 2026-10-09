import { describe, expect, it } from 'vitest'
import { analyze } from '../../../src/core/analyze.js'
import { json, load, run, summarize } from '../../helpers.js'

const icu = { format: 'next-intl' as const }
const vue = { format: 'vue-i18n' as const }

describe('F7 untranslated', () => {
  it('passes for translated values, numbers and placeholders only', async () => {
    const issues = await run('untranslated', {
      'locales/en.json': json({ a: 'Save', b: '{count}', c: '42', d: '—' }),
      'locales/ar.json': json({ a: 'حفظ', b: '{count}', c: '42', d: '—' }),
      'locales/fr.json': json({
        a: 'Enregistrer',
        b: '{count}',
        c: '42',
        d: '—'
      })
    })
    expect(issues).toEqual([])
  })

  it('reports a value identical to the base', async () => {
    const issues = await run('untranslated', {
      'locales/en.json': json({ a: 'Save changes' }),
      'locales/fr.json': json({ a: 'Save changes' })
    })
    expect(issues).toMatchObject([
      {
        severity: 'warning',
        locale: 'fr',
        message: '`a`: same text as en',
        baseValue: 'Save changes'
      }
    ])
  })

  it('does not compare variants of the same language', async () => {
    const issues = await run(
      'untranslated',
      {
        'locales/en-US.json': json({ a: 'Save changes' }),
        'locales/en-GB.json': json({ a: 'Save changes' })
      },
      { baseLocale: 'en-US' }
    )
    expect(issues).toEqual([])
  })

  it('reports Arabic, Persian, Urdu and Hebrew text with no letter of their script', async () => {
    const issues = await run('untranslated', {
      'locales/en.json': json({ a: 'Your bid', b: 'Price {amount}' }),
      'locales/ar.json': json({ a: 'Your bid now', b: 'السعر {amount}' }),
      'locales/fa.json': json({ a: 'پیشنهاد شما', b: 'Prix {amount}' }),
      'locales/ur.json': json({ a: 'آپ کی بولی', b: 'قیمت {amount}' }),
      'locales/he.json': json({ a: 'Your offer', b: 'מחיר {amount}' })
    })
    expect(summarize(issues)).toEqual([
      'ar a:2 `a`: no Arabic letters, looks untranslated',
      'fa b:3 `b`: no Persian letters, looks untranslated',
      'he a:2 `a`: no Hebrew letters, looks untranslated'
    ])
  })

  it('ignores placeholders, URLs and emails when looking for letters', async () => {
    const issues = await run('untranslated', {
      'locales/en.json': json({ a: 'Mail {email}', b: 'See https://x.com' }),
      'locales/ar.json': json({ a: '{email}', b: 'https://x.com' })
    })
    expect(issues).toEqual([])
  })

  it('skips values listed in ignore-values, case-insensitively', async () => {
    const project = await load({
      'locales/en.json': json({ a: 'Google', b: 'OK', c: 'Email' }),
      'locales/ar.json': json({ a: 'Google', b: 'ok', c: 'Email' })
    })
    const issues = analyze(project, {
      format: 'json',
      ignoreValues: ['google', 'OK']
    }).filter((i) => i.check === 'untranslated')
    expect(summarize(issues)).toEqual(['ar c:4 `c`: same text as en'])
  })

  it('skips messages that cannot be parsed', async () => {
    const issues = await run(
      'untranslated',
      {
        'locales/en.json': json({ a: 'Hi {name' }),
        'locales/ar.json': json({ a: 'Hi {name' })
      },
      icu
    )
    expect(issues).toEqual([])
  })
})

describe('F8 plural-forms: ICU', () => {
  it('passes when every form the language needs is there', async () => {
    const issues = await run(
      'plural-forms',
      {
        'locales/en.json': json({
          a: '{n, plural, one {# item} other {# items}}'
        }),
        'locales/ar.json': json({
          a: '{n, plural, zero {لا عناصر} one {عنصر} two {عنصران} few {# عناصر} many {# عنصرًا} other {# عنصر}}'
        }),
        'locales/ja.json': json({ a: '{n, plural, other {#個}}' })
      },
      icu
    )
    expect(issues).toEqual([])
  })

  it('reports the forms Arabic needs that are missing', async () => {
    const issues = await run(
      'plural-forms',
      {
        'locales/en.json': json({
          a: '{n, plural, one {# item} other {# items}}'
        }),
        'locales/ar.json': json({
          a: '{n, plural, one {عنصر} other {# عناصر}}'
        })
      },
      icu
    )
    expect(issues).toMatchObject([
      {
        severity: 'warning',
        locale: 'ar',
        message:
          '`a`: Arabic uses zero, one, two, few, many, other. Missing: zero, two, few, many'
      }
    ])
  })

  it('accepts =0, =1 and =2 for zero, one and two', async () => {
    const issues = await run(
      'plural-forms',
      {
        'locales/en.json': json({ a: '{n, plural, one {#} other {#}}' }),
        'locales/ar.json': json({
          a: '{n, plural, =0 {لا} =1 {واحد} =2 {اثنان} few {#} many {#} other {#}}'
        })
      },
      icu
    )
    expect(issues).toEqual([])
  })

  it('does not ask for forms that only apply to millions, like French many', async () => {
    const issues = await run(
      'plural-forms',
      {
        'locales/en.json': json({ a: '{n, plural, one {#} other {#}}' }),
        'locales/fr.json': json({ a: '{n, plural, one {#} other {#}}' })
      },
      icu
    )
    expect(issues).toEqual([])
  })

  it('reports a missing other as an error, in any locale', async () => {
    const issues = await run(
      'plural-forms',
      {
        'locales/en.json': json({ a: '{n, plural, one {# item}}' })
      },
      icu
    )
    expect(issues).toMatchObject([
      {
        severity: 'error',
        locale: 'en',
        message: '`a`: `{n, plural}` has no `other` form, which ICU requires'
      }
    ])
  })

  it('uses ordinal rules for selectordinal', async () => {
    const issues = await run(
      'plural-forms',
      {
        'locales/en.json': json({
          a: '{n, selectordinal, one {#st} other {#th}}'
        })
      },
      icu
    )
    expect(issues[0]?.message).toBe(
      '`a`: English uses one, two, few, other. Missing: two, few'
    )
  })

  it('accepts locale codes with an underscore', async () => {
    const issues = await run(
      'plural-forms',
      {
        'locales/en.json': json({ a: '{n, plural, one {#} other {#}}' }),
        'locales/ar_EG.json': json({ a: '{n, plural, one {#} other {#}}' })
      },
      icu
    )
    expect(issues[0]?.locale).toBe('ar_EG')
  })
})

describe('F8 plural-forms: vue-i18n', () => {
  it('passes when the translation has plural branches too', async () => {
    const issues = await run(
      'plural-forms',
      {
        'locales/en.json': json({ a: 'no items | one item | {n} items' }),
        'locales/ar.json': json({ a: 'لا عناصر | عنصر | {n} عناصر | عنصران' })
      },
      vue
    )
    expect(issues).toEqual([])
  })

  it('reports a single branch where the base has several', async () => {
    const issues = await run(
      'plural-forms',
      {
        'locales/en.json': json({ a: 'no items | one item | {n} items' }),
        'locales/ar.json': json({ a: '{n} عناصر' })
      },
      vue
    )
    expect(summarize(issues)).toEqual([
      'ar a:2 `a`: en has 3 plural forms separated by `|`, ar has 1'
    ])
  })

  it('does not run for plain JSON', async () => {
    const issues = await run('plural-forms', {
      'locales/en.json': json({ a: '{n, plural, one {#}}' })
    })
    expect(issues).toEqual([])
  })
})

describe('F16 ignore rules', () => {
  const files = {
    'locales/en.json': json({ legacy: { a: 'A', b: { c: 'C' } }, keep: 'K' }),
    'locales/ar.json': json({}),
    'locales/de.json': json({})
  }

  it('drops issues for keys that match ignore-keys', async () => {
    const issues = analyze(await load(files), {
      format: 'json',
      ignoreKeys: ['legacy.*']
    })
    expect(issues.map((i) => `${i.locale} ${i.key}`)).toEqual([
      'ar keep',
      'de keep'
    ])
  })

  it('skips disabled checks by name', async () => {
    const issues = analyze(await load(files), {
      format: 'json',
      disabledChecks: ['missing-keys']
    })
    expect(issues).toEqual([])
  })

  it('does not load locales listed in ignore-locales', async () => {
    const project = await load(files)
    expect([...project.locales.keys()]).toContain('de')
    const { loadProject, memoryFileSource } =
      await import('../../../src/core/loaders/index.js')
    const filtered = await loadProject(memoryFileSource(files), {
      patterns: ['locales/{locale}.json'],
      baseLocale: 'en',
      ignoreLocales: ['de']
    })
    expect([...filtered.locales.keys()]).toEqual(['ar', 'en'])
  })
})
