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
