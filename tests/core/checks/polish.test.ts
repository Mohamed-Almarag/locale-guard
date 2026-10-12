import { describe, expect, it } from 'vitest'
import { analyze } from '../../../src/core/analyze.js'
import { json, load, run, summarize } from '../../helpers.js'

const icu = { format: 'next-intl' as const }
const vue = { format: 'vue-i18n' as const }

describe('untranslated', () => {
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

  it('leaves single identical words to the script rule, since most are brands or cognates', async () => {
    const issues = await run('untranslated', {
      'locales/en.json': json({
        a: 'Total',
        b: 'Chat',
        c: 'Notifications enabled'
      }),
      'locales/es.json': json({
        a: 'Total',
        b: 'Chat',
        c: 'Notifications enabled'
      }),
      'locales/ar.json': json({ a: 'المجموع', b: 'Chat', c: 'تم التفعيل' })
    })
    expect(summarize(issues)).toEqual([
      'ar b:3 `b`: no Arabic letters, looks untranslated',
      'es c:4 `c`: same text as en'
    ])
  })

  it('counts the words of one plural branch, so a single word in two forms is left out', async () => {
    const values = {
      one: 'ticket | tickets',
      two: 'open ticket | open tickets',
      icu: '{count, plural, one {# ticket} other {# tickets}}'
    }
    const vueIssues = await run(
      'untranslated',
      {
        'locales/en.json': json({ one: values.one, two: values.two }),
        'locales/fr.json': json({ one: values.one, two: values.two }),
        'locales/ar.json': json({ one: values.one, two: 'تذكرة | تذاكر' })
      },
      vue
    )
    expect(summarize(vueIssues)).toEqual([
      'ar one:2 `one`: no Arabic letters, looks untranslated',
      'fr two:3 `two`: same text as en'
    ])

    const icuIssues = await run(
      'untranslated',
      {
        'locales/en.json': json({ icu: values.icu }),
        'locales/fr.json': json({ icu: values.icu })
      },
      icu
    )
    expect(icuIssues).toEqual([])
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
      'locales/ar.json': json({ a: 'Google', b: 'ok', c: 'Email' }),
      'locales/fr.json': json({ a: 'Google', b: 'OK', c: 'Email' })
    })
    const issues = analyze(project, {
      format: 'json',
      ignoreValues: ['google', 'OK']
    }).filter((i) => i.check === 'untranslated')
    expect(summarize(issues)).toEqual([
      'ar c:4 `c`: no Arabic letters, looks untranslated'
    ])
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

describe('untranslated: values shared by two locales', () => {
  const en = json({
    title: 'Change password',
    done: 'Password changed',
    save: 'Save changes',
    drive: 'Google Drive'
  })

  it('reports Turkish text copied into the French file, once for the pair', async () => {
    const turkish = { title: 'Şifre Değiştir', done: 'Şifre Değiştirildi' }
    const issues = await run('untranslated', {
      'locales/en.json': en,
      'locales/fr.json': json({
        ...turkish,
        save: 'Enregistrer les modifications'
      }),
      'locales/tr.json': json({ ...turkish, save: 'Değişiklikleri kaydet' })
    })
    expect(issues).toEqual([
      {
        check: 'untranslated',
        severity: 'warning',
        locale: 'fr',
        file: 'locales/fr.json',
        key: '',
        line: 2,
        column: 3,
        message:
          'fr and tr have identical values, so one file was probably copied into the other',
        details: ['`title`: Şifre Değiştir', '`done`: Şifre Değiştirildi'],
        isNew: true
      }
    ])
  })

  it('needs at least two shared values, so one brand name is not reported', async () => {
    const issues = await run('untranslated', {
      'locales/en.json': json({ drive: 'Cloud storage', save: 'Save changes' }),
      'locales/es.json': json({
        drive: 'Google Drive',
        save: 'Guardar cambios'
      }),
      'locales/fr.json': json({ drive: 'Google Drive', save: 'Enregistrer' })
    })
    expect(issues).toEqual([])
  })

  it('counts a value used by several keys once', async () => {
    const issues = await run('untranslated', {
      'locales/en.json': json({ a: 'Email address', b: 'Email address' }),
      'locales/fr.json': json({ a: 'Adresse e-mail', b: 'Adresse e-mail' }),
      'locales/it.json': json({ a: 'Adresse e-mail', b: 'Adresse e-mail' })
    })
    expect(issues).toEqual([])
  })

  it('keeps words with combining marks whole, like Hindi', async () => {
    const issues = await run('untranslated', {
      'locales/en.json': json({ a: 'Published', b: 'Archived' }),
      'locales/hi.json': json({ a: 'प्रकाशित', b: 'संग्रहित' }),
      'locales/ne.json': json({ a: 'प्रकाशित', b: 'संग्रहित' })
    })
    expect(issues).toEqual([])
  })

  it('does not count formats like H:mm:ss as text', async () => {
    const issues = await run('untranslated', {
      'locales/en.json': json({ a: 'h:mm:ss a', b: 'h:mm a', c: 'MMM d' }),
      'locales/de.json': json({ a: 'H:mm:ss', b: 'H:mm', c: 'd MMM u' }),
      'locales/nl.json': json({ a: 'H:mm:ss', b: 'H:mm', c: 'd MMM u' })
    })
    expect(issues).toEqual([])
  })

  it('keeps the same message when some of the values get translated', async () => {
    const files = (title: string) => ({
      'locales/en.json': en,
      'locales/fr.json': json({
        title,
        done: 'Şifre Değiştirildi',
        save: 'Kaydet değişiklikleri'
      }),
      'locales/tr.json': json({
        title: 'Şifre Değiştir',
        done: 'Şifre Değiştirildi',
        save: 'Kaydet değişiklikleri'
      })
    })
    const before = await run('untranslated', files('Şifre Değiştir'))
    const after = await run('untranslated', files('Changer le mot de passe'))
    expect(before[0]?.details).toHaveLength(3)
    expect(after[0]?.details).toHaveLength(2)
    expect(after[0]?.message).toBe(before[0]?.message)
    expect(after[0]?.key).toBe(before[0]?.key)
  })

  it('does not compare related languages, which often share whole sentences', async () => {
    const shared = { title: 'Generar factura', done: 'Factura generada' }
    const issues = await run('untranslated', {
      'locales/en.json': en,
      'locales/es.json': json(shared),
      'locales/ca.json': json(shared),
      'locales/nb-NO.json': json({
        title: 'Generer faktura',
        done: 'Faktura laget'
      }),
      'locales/nn-NO.json': json({
        title: 'Generer faktura',
        done: 'Faktura laget'
      })
    })
    expect(issues).toEqual([])
  })

  it('does not compare Italian with Spanish or Portuguese, which share short phrases', async () => {
    const issues = await run('untranslated', {
      'locales/en.json': json({
        person: 'A person',
        name: 'Full name',
        size: 'Extra large'
      }),
      'locales/es.json': json({
        person: 'Una persona',
        name: 'Nombre completo',
        size: 'Extra grande'
      }),
      'locales/it.json': json({
        person: 'Una persona',
        name: 'Nome completo',
        size: 'Extra grande'
      }),
      'locales/pt.json': json({
        person: 'Uma pessoa',
        name: 'Nome completo',
        size: 'Extra grande'
      })
    })
    expect(issues).toEqual([])
  })

  it('still reports Italian text copied into an unrelated language', async () => {
    const italian = { person: 'Una persona', size: 'Extra grande' }
    const issues = await run('untranslated', {
      'locales/en.json': json({ person: 'A person', size: 'Extra large' }),
      'locales/it.json': json(italian),
      'locales/tr.json': json(italian)
    })
    expect(summarize(issues)).toEqual([
      'it locales/it.json:2 it and tr have identical values, so one file was probably copied into the other'
    ])
  })

  it('does not compare Chinese and Japanese, which share characters', async () => {
    const shared = { title: 'API Key 管理', done: 'Webhook 設定' }
    const issues = await run('untranslated', {
      'locales/en.json': json({
        title: 'API Key Management',
        done: 'Webhook Settings'
      }),
      'locales/ja.json': json(shared),
      'locales/zh-TW.json': json(shared)
    })
    expect(issues).toEqual([])
  })

  it('leaves values equal to the base to the base rule', async () => {
    const issues = await run('untranslated', {
      'locales/en.json': en,
      'locales/de.json': json({
        title: 'Change password',
        done: 'Password changed'
      }),
      'locales/fr.json': json({
        title: 'Change password',
        done: 'Password changed'
      })
    })
    expect(issues.map((issue) => issue.message)).toEqual([
      '`title`: same text as en',
      '`done`: same text as en',
      '`title`: same text as en',
      '`done`: same text as en'
    ])
  })

  it('skips values in ignore-values', async () => {
    const project = await load({
      'locales/en.json': en,
      'locales/fr.json': json({ title: 'Acme Cloud', done: 'Acme Drive' }),
      'locales/tr.json': json({ title: 'Acme Cloud', done: 'Acme Drive' })
    })
    const issues = analyze(project, {
      format: 'json',
      ignoreValues: ['Acme Cloud']
    }).filter((issue) => issue.check === 'untranslated')
    expect(issues).toEqual([])
  })
})

describe('plural-forms: ICU', () => {
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

describe('plural-forms: other formats', () => {
  it('does not run for vue-i18n, where one branch is often right', async () => {
    const issues = await run(
      'plural-forms',
      {
        'locales/en.json': json({ a: '{count} month | {count} months' }),
        'locales/fr.json': json({ a: '{count} mois' }),
        'locales/tr.json': json({ a: '{count} ay' })
      },
      vue
    )
    expect(issues).toEqual([])
  })

  it('does not run for plain JSON', async () => {
    const issues = await run('plural-forms', {
      'locales/en.json': json({ a: '{n, plural, one {#}}' })
    })
    expect(issues).toEqual([])
  })
})

describe('ignore rules', () => {
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
