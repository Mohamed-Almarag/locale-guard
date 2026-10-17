import { describe, expect, it } from 'vitest'
import { analyze } from '../../../src/core/analyze.js'
import { renderReport } from '../../../src/reporters/markdown.js'
import { json, load, summarize } from '../../helpers.js'

const en = {
  title: 'Your cart',
  items_one: '{{count}} item in {{store}}',
  items_other: '{{count}} items in {{store}}'
}

const arabic = {
  title: 'سلة التسوق',
  items_zero: 'لا توجد منتجات في {{store}}',
  items_one: 'منتج واحد في {{store}}',
  items_two: 'منتجان في {{store}}',
  items_few: '{{count}} منتجات في {{store}}',
  items_many: '{{count}} منتجًا في {{store}}',
  items_other: '{{count}} منتج في {{store}}'
}

async function issues(
  files: Record<string, unknown>,
  format: 'json' | 'vue-i18n' = 'json'
) {
  const project = await load(
    Object.fromEntries(
      Object.entries(files).map(([path, value]) => [path, json(value)])
    )
  )
  return analyze(project, { format })
}

describe('i18next plural keys (plain JSON)', () => {
  it('accepts each language with exactly the forms it needs', async () => {
    const found = await issues({
      'locales/en.json': en,
      'locales/ar.json': arabic,
      'locales/ja.json': {
        title: 'カート',
        items_other: '{{store}}に{{count}}個'
      },
      'locales/fr.json': {
        title: 'Votre panier',
        items_one: '{{count}} article dans {{store}}',
        items_other: '{{count}} articles dans {{store}}'
      }
    })
    expect(summarize(found)).toEqual([])
  })

  it('reports the forms a language misses, once per group', async () => {
    const found = await issues({
      'locales/en.json': en,
      'locales/ar.json': {
        title: 'سلة التسوق',
        items_one: 'منتج واحد في {{store}}',
        items_other: '{{count}} منتج في {{store}}'
      },
      'locales/de.json': {
        title: 'Warenkorb',
        items_one: '{{count}} Artikel in {{store}}'
      }
    })
    expect(summarize(found)).toEqual([
      'de items:3 `items`: German uses one, other. Missing: `items_other`',
      'ar items:3 `items`: Arabic uses zero, one, two, few, many, other. Missing: `items_zero`, `items_two`, `items_few`, `items_many`'
    ])
    expect(found.map((issue) => issue.severity)).toEqual(['error', 'warning'])
  })

  it('reports a missing group with the forms each language needs', async () => {
    const found = await issues({
      'locales/en.json': en,
      'locales/ar.json': { title: 'سلة التسوق' },
      'locales/ja.json': { title: 'カート' }
    })
    expect(found.map((issue) => `${issue.locale} ${issue.key}`)).toEqual([
      'ar items_zero',
      'ar items_one',
      'ar items_two',
      'ar items_few',
      'ar items_many',
      'ar items_other',
      'ja items_other'
    ])
    expect(found.every((issue) => issue.check === 'missing-keys')).toBe(true)
    expect(found.find((issue) => issue.key === 'items_few')?.baseValue).toBe(
      '{{count}} items in {{store}}'
    )
  })

  it('writes the copy-paste block with the forms of that language, inside the namespace', async () => {
    const project = await load(
      {
        'locales/en/cart.json': json(en),
        'locales/ar/cart.json': json({ title: 'سلة التسوق' })
      },
      { patterns: ['locales/{locale}/*.json'] }
    )
    const body = renderReport({
      issues: analyze(project, { format: 'json' }),
      project,
      hasBaseline: false
    })
    expect(body).toContain('Copy-paste for locales/ar/cart.json')
    expect(body).toContain(
      [
        '```json',
        '{',
        '  "items_zero": "",',
        '  "items_one": "",',
        '  "items_two": "",',
        '  "items_few": "",',
        '  "items_many": "",',
        '  "items_other": ""',
        '}',
        '```'
      ].join('\n')
    )
  })

  it('writes plural forms as flat keys when the base file uses flat keys', async () => {
    const project = await load({
      'locales/en.json': json({
        'cart.items_one': '{{count}} item',
        'cart.items_other': '{{count}} items'
      }),
      'locales/ar.json': json({ title: 'سلة التسوق' })
    })
    const body = renderReport({
      issues: analyze(project, { format: 'json' }),
      project,
      hasBaseline: false,
      link: (file, line) => `https://x/${file}${line ? `#L${line}` : ''}`
    })
    expect(body).toContain('  "cart.items_few": "",')
    expect(body).toContain('  "cart.items_other": ""')
    expect(body).not.toContain('"cart": {')
    // Arabic-only forms link to the English `other` form, the text to translate
    expect(body).toContain('[`cart.items_few`](https://x/locales/en.json#L3)')
  })

  it('lets a form leave out the count, but not other placeholders', async () => {
    const found = await issues({
      'locales/en.json': en,
      'locales/ar.json': {
        ...arabic,
        items_one: 'منتج واحد',
        items_two: 'منتجان في {{shop}}'
      }
    })
    expect(summarize(found)).toEqual([
      'ar items_one:4 `items_one`: missing `{{store}}`',
      'ar items_two:5 `items_two`: missing `{{store}}`, unexpected `{{shop}}`'
    ])
  })

  it('checks ordinal forms with ordinal rules', async () => {
    const found = await issues({
      'locales/en.json': {
        place_ordinal_one: '{{count}}st place',
        place_ordinal_two: '{{count}}nd place',
        place_ordinal_few: '{{count}}rd place',
        place_ordinal_other: '{{count}}th place'
      },
      'locales/fr.json': {
        place_ordinal_one: '{{count}}re place',
        place_ordinal_other: '{{count}}e place'
      }
    })
    expect(summarize(found)).toEqual([])
  })

  it('keeps numbered keys without an other form as plain keys', async () => {
    const found = await issues({
      'locales/en.json': {
        note_one: 'Pay within 3 days.',
        note_two: 'Late deals are cancelled.',
        note_three: 'Funds are held until you confirm.'
      },
      'locales/ar.json': { note_one: 'ادفع خلال ٣ أيام.' }
    })
    expect(found.map((issue) => `${issue.check} ${issue.key}`)).toEqual([
      'missing-keys note_three',
      'missing-keys note_two'
    ])
  })

  it('leaves vue-i18n projects as they were', async () => {
    const found = await issues(
      { 'locales/en.json': en, 'locales/ar.json': arabic },
      'vue-i18n'
    )
    expect(
      found.filter((issue) => issue.check === 'extra-keys').map((i) => i.key)
    ).toEqual(['items_zero', 'items_two', 'items_few', 'items_many'])
  })
})

describe('Rails plural forms (nested under the key)', () => {
  const enYml = [
    'en:',
    '  items:',
    '    one: "%{count} item"',
    '    other: "%{count} items"',
    '  filters:',
    '    other: Other',
    '    all: All',
    ''
  ].join('\n')

  async function rails(ar: string) {
    const project = await load(
      { 'config/locales/en.yml': enYml, 'config/locales/ar.yml': ar },
      { patterns: ['config/locales/{locale}.yml'] }
    )
    return summarize(analyze(project, { format: 'json' }))
  }

  it('accepts the six Arabic forms, and a form without the count', async () => {
    const found = await rails(
      [
        'ar:',
        '  items:',
        '    zero: لا توجد عناصر',
        '    one: عنصر واحد',
        '    two: عنصران',
        '    few: "%{count} عناصر"',
        '    many: "%{count} عنصرًا"',
        '    other: "%{count} عنصر"',
        '  filters:',
        '    other: أخرى',
        '    all: الكل',
        ''
      ].join('\n')
    )
    expect(found).toEqual([])
  })

  it('reports the forms Arabic needs', async () => {
    const found = await rails(
      [
        'ar:',
        '  items:',
        '    one: عنصر واحد',
        '    other: "%{count} عنصر"',
        '  filters:',
        '    other: أخرى',
        '    all: الكل',
        ''
      ].join('\n')
    )
    expect(found).toEqual([
      'ar items:3 `items`: Arabic uses zero, one, two, few, many, other. Missing: `items.zero`, `items.two`, `items.few`, `items.many`'
    ])
  })

  it('keeps a key named other next to other keys as a plain key', async () => {
    const found = await rails(
      'ar:\n  items:\n    other: "%{count} عنصر"\n  filters:\n    other: أخرى\n'
    )
    expect(found.filter((line) => line.includes('filters'))).toEqual([
      'ar filters.all:4 Missing key `filters.all`'
    ])
  })

  it('needs YAML files wrapped in their locale', async () => {
    const plain = await load({
      'locales/en.json': json({ items: { one: 'One', other: 'Many' } }),
      'locales/ar.json': json({ items: { one: 'واحد', other: 'كثير' } })
    })
    const wrappedJson = await load({
      'locales/en.json': json({ en: { items: { one: 'One', other: 'Many' } } }),
      'locales/ar.json': json({ ar: { items: { one: 'واحد', other: 'كثير' } } })
    })
    for (const project of [plain, wrappedJson]) {
      expect(
        analyze(project, { format: 'json' }).filter(
          (issue) => issue.check === 'plural-forms'
        )
      ).toEqual([])
    }
  })
})

describe('Rails plural forms: placeholders', () => {
  const enYml = [
    'en:',
    '  shared:',
    '    one: Shared one time',
    '    other: Shared %{friendly_count} times',
    '  people:',
    '    zero: Nobody yet',
    '    one: "%{people} person"',
    '    other: "%{people} people"',
    ''
  ].join('\n')

  async function placeholders(locale: string, body: string[]) {
    const project = await load(
      {
        'config/locales/en.yml': enYml,
        [`config/locales/${locale}.yml`]: [`${locale}:`, ...body, ''].join('\n')
      },
      { patterns: ['config/locales/{locale}.yml'] }
    )
    return summarize(
      analyze(project, { format: 'json' }).filter(
        (issue) => issue.check === 'placeholder-mismatch'
      )
    )
  }

  it('lets a form that covers one number write it in words', async () => {
    // Hebrew `one` is only 1, `two` only 2; Ruby I18n uses `zero` for 0 in any language
    expect(
      await placeholders('he', [
        '  shared:',
        '    one: שותף פעם אחת',
        '    two: שותף פעמיים',
        '    other: "שותף %{friendly_count} פעמים"',
        '  people:',
        '    zero: אף אחד',
        '    one: איש אחד',
        '    two: שני אנשים',
        '    other: "%{people} אנשים"'
      ])
    ).toEqual([])
  })

  it('lets a form use the count that another base form has', async () => {
    expect(
      await placeholders('be', [
        '  shared:',
        '    one: "Пашыраны %{friendly_count} раз"',
        '    few: "Пашыраны %{friendly_count} разы"',
        '    many: "Пашыраны %{friendly_count} разоў"',
        '    other: "Пашыраны %{friendly_count} разоў"'
      ])
    ).toEqual([])
  })

  it('needs the number in a form that covers many numbers', async () => {
    // Russian `one` is also used for 21, 31…
    expect(
      await placeholders('ru', [
        '  shared:',
        '    one: Поделились один раз',
        '    few: "Поделились %{friendly_count} раза"',
        '    many: "Поделились %{friendly_count} раз"',
        '    other: "Поделились %{friendly_count} раз"'
      ])
    ).toEqual(['ru shared.one:3 `shared.one`: missing `{friendly_count}`'])
  })

  it('reports a placeholder that no base form has', async () => {
    expect(
      await placeholders('de', [
        '  shared:',
        '    one: "Einmal von %{name} geteilt"',
        '    other: "%{friendly_count} Mal geteilt"'
      ])
    ).toEqual(['de shared.one:3 `shared.one`: unexpected `{name}`'])
  })

  it('does not judge the number for a language without plural rules', async () => {
    expect(
      await placeholders('sco', [
        '  shared:',
        '    one: Shared ae time',
        '    other: "Shared %{friendly_count} times"'
      ])
    ).toEqual([])
  })
})

describe('plural rules', () => {
  it('skips plural forms of a language Intl has no rules for', async () => {
    // `qaa` is reserved for private use, so no Intl version has its rules
    const project = await load({
      'locales/en.json': json({ items_one: 'One', items_other: 'Many' }),
      'locales/qaa.json': json({ items_other: 'Multi' })
    })
    expect(project.locales.has('qaa')).toBe(true)
    expect(
      analyze(project, { format: 'json' }).filter(
        (issue) => issue.check === 'plural-forms'
      )
    ).toEqual([])
  })
})
