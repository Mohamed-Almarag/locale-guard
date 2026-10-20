import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/core/analyze.js'
import type { Issue } from '../../src/core/types.js'
import { MARKER, renderReport } from '../../src/reporters/markdown.js'
import { loadProject, memoryFileSource } from '../../src/core/loaders/index.js'
import { json, load } from '../helpers.js'

async function report(
  files: Record<string, string>,
  options: {
    patterns?: string[]
    maxLength?: number
    mark?: (i: Issue) => Issue
    existing?: 'list' | 'counts'
  } = {}
) {
  const project = await load(files, { patterns: options.patterns })
  const issues = analyze(project, { format: 'next-intl' }).map(
    options.mark ?? ((i) => i)
  )
  return renderReport({
    issues,
    project,
    hasBaseline: Boolean(options.mark),
    link: (file, line) => `https://x/${file}${line ? `#L${line}` : ''}`,
    maxLength: options.maxLength,
    summaryUrl: 'https://x/run',
    existing: options.existing
  })
}

const en = json({
  checkout: { coupon: { invalid: 'Coupon "{code}" is <b>not</b> valid' } },
  auction: { bid: { tooLow: 'Your bid must be higher than {amount}' } },
  extra: 'x'
})

describe('renderReport', () => {
  it('says everything is in sync when there are no issues', async () => {
    const body = await report({
      'locales/en.json': json({ a: 'A' }),
      'locales/ar.json': json({ a: 'أ' })
    })
    expect(body).toBe(
      `${MARKER}\n## 🌐 Locale Guard\n\n✅ All translations are in sync.\n`
    )
  })

  it('lists missing keys with base values, links and a copy-paste block', async () => {
    const body = await report({
      'locales/en.json': en,
      'locales/ar.json': json({ extra: 'س' })
    })

    expect(body).toContain('## 🌐 Locale Guard: 2 errors')
    expect(body).toContain('### ❌ ar: 2 missing keys')
    expect(body).toContain(
      '| [`checkout.coupon.invalid`](https://x/locales/en.json#L4) | Coupon "{code}" is &lt;b&gt;not&lt;/b&gt; valid |'
    )
    expect(body).toContain(
      '<details><summary>📋 Copy-paste for locales/ar.json</summary>'
    )
    expect(body).toContain(
      [
        '```json',
        '{',
        '  "auction": {',
        '    "bid": {',
        '      "tooLow": ""',
        '    }',
        '  },',
        '  "checkout": {',
        '    "coupon": {',
        '      "invalid": ""',
        '    }',
        '  }',
        '}',
        '```'
      ].join('\n')
    )
  })

  it('writes the copy-paste block in YAML for YAML files, keyed inside the namespace', async () => {
    const body = await report(
      {
        'locales/en/checkout.yml': 'coupon:\n  invalid: Invalid\n',
        'locales/ar/checkout.yml': 'other: x\n'
      },
      { patterns: ['locales/{locale}/*.yml'] }
    )
    expect(body).toContain('```yaml\ncoupon:\n  invalid: ""\n```')
  })

  it('wraps the copy-paste block in the locale key, as Rails files are', async () => {
    const files = {
      'config/locales/en.yml':
        'en:\n  cart:\n    title: Cart\n    empty: Empty\n',
      'config/locales/ar.yml': 'ar:\n  cart:\n    title: السلة\n'
    }
    const patterns = ['config/locales/{locale}.yml']
    const body = await report(files, { patterns })
    expect(body).toContain('### ❌ ar: 1 missing key')
    expect(body).toContain('```yaml\nar:\n  cart:\n    empty: ""\n```')

    const shared = await report(
      {
        ...files,
        'config/locales/fr.yml': 'fr:\n  cart:\n    title: Panier\n'
      },
      { patterns }
    )
    expect(shared).toContain(
      'Copy-paste for config/locales/{locale}.yml (the same in each locale, under each locale key)'
    )
    expect(shared).toContain('```yaml\ncart:\n  empty: ""\n```')
  })

  it('names the shared file with {locale} wherever the code sits in the name', async () => {
    const project = await loadProject(
      memoryFileSource({
        'lang/main.json': json({ a: 'A', b: 'B' }),
        'lang/main-ar.json': json({ a: 'ا' }),
        'lang/main-fr.json': json({ a: 'A-fr' })
      }),
      {
        patterns: ['lang/main-{locale}.json'],
        baseLocale: 'en',
        baseFile: 'lang/main.json'
      }
    )
    const body = renderReport({
      issues: analyze(project, { format: 'json' }),
      project,
      hasBaseline: false
    })
    expect(body).toContain(
      'Copy-paste for lang/main-{locale}.json (the same in each locale)'
    )
  })

  it('puts a missing Rails key in the file that mirrors the base file', async () => {
    const body = await report(
      {
        'config/locales/en.yml': 'en:\n  title: Home\n',
        'config/locales/devise.en.yml': 'en:\n  devise:\n    failure: Failed\n',
        'config/locales/ar.yml': 'ar:\n  title: الرئيسية\n',
        'config/locales/devise.ar.yml': 'ar:\n  devise: {}\n'
      },
      {
        patterns: [
          'config/locales/{locale}.yml',
          'config/locales/*.{locale}.yml'
        ]
      }
    )
    expect(body).toContain('[`devise.failure`]')
    expect(body).toContain(
      'Copy-paste for config/locales/devise.ar.yml</summary>\n\n```yaml\nar:\n  devise:\n    failure: ""\n```'
    )
  })

  it('wraps a file not created yet like the base file', async () => {
    const body = await report(
      {
        'config/locales/en/shop.yml': 'en:\n  a: A\n',
        'config/locales/en/user.yml': 'en:\n  b: B\n',
        'config/locales/ar/user.yml': 'ar:\n  b: ب\n'
      },
      { patterns: ['config/locales/{locale}/*.yml'] }
    )
    expect(body).toContain(
      'Copy-paste for config/locales/ar/shop.yml</summary>\n\n```yaml\nar:\n  a: ""\n```'
    )
  })

  it('keeps flat keys flat in the copy-paste block, as react-intl expects', async () => {
    const body = await report({
      'locales/en.json': json({
        'cart.title': 'Your cart',
        'cart.total': 'Total: {total}',
        nav: { home: 'Home' }
      }),
      'locales/ar.json': json({ other: 'x' })
    })
    expect(body).toContain(
      [
        '```json',
        '{',
        '  "cart.title": "",',
        '  "cart.total": "",',
        '  "nav": {',
        '    "home": ""',
        '  }',
        '}',
        '```'
      ].join('\n')
    )
  })

  it('links a missing key to its parent when the locale has it, otherwise to the base file', async () => {
    const body = await report({
      'locales/en.json': json({
        checkout: { title: 'Checkout', pay: 'Pay' },
        'cart.title': 'Cart'
      }),
      'locales/ar.json': json({ checkout: { title: 'الدفع' } })
    })
    expect(body).toContain('| [`checkout.pay`](https://x/locales/ar.json#L2) |')
    expect(body).toContain('| [`cart.title`](https://x/locales/en.json#L6) |')
  })

  it('links keys of a namespace file the locale does not have to the base file', async () => {
    const body = await report(
      {
        'locales/en/common.json': json({ save: 'Save' }),
        'locales/en/billing.json': json({ title: 'Billing' }),
        'locales/ar/common.json': json({ save: 'حفظ' })
      },
      { patterns: ['locales/{locale}/*.json'] }
    )
    expect(body).toContain(
      '| [`billing.title`](https://x/locales/en/billing.json#L2) | Billing |'
    )
    expect(body).toContain('Copy-paste for locales/ar/billing.json')
  })

  it('lists other issues with their location, errors before warnings', async () => {
    const body = await report({
      'locales/en.json': json({ a: 'Hi {name}', b: 'B' }),
      'locales/ar.json': json({ a: 'مرحبا', b: 'ب', c: 'ج' })
    })
    const error = body.indexOf('### ❌ ar: 1 placeholder mismatch')
    const warning = body.indexOf('### ⚠️ ar: 1 extra key')
    expect(error).toBeGreaterThan(0)
    expect(warning).toBeGreaterThan(error)
    expect(body).toContain(
      '- `a`: missing `{name}` · [ar.json:2](https://x/locales/ar.json#L2)'
    )
  })

  it('adds the suggested key after an extra key', async () => {
    const body = await report({
      'locales/en.json': json({ services: { name: 'Name' } }),
      'locales/tr.json': json({ service: { name: 'Ad' } })
    })
    expect(body).toContain(
      '- Key `service.name` does not exist in en. Did you mean `services.name`? · [tr.json:3](https://x/locales/tr.json#L3)'
    )
  })

  it('splits new and existing issues and collapses the existing ones', async () => {
    const body = await report(
      {
        'locales/en.json': json({ a: 'A', b: 'B', c: 'C' }),
        'locales/ar.json': json({})
      },
      { mark: (i) => ({ ...i, isNew: i.key === 'a' }) }
    )
    expect(body).toContain('## 🌐 Locale Guard: 1 error\n')
    expect(body).toContain(
      'New in this PR: 1 · Already existing: 2 (collapsed below)'
    )
    expect(body).toContain('<details><summary>2 existing issues</summary>')
    expect(body).toContain('#### ❌ ar: 2 missing keys')
  })

  it('shares one table between locales that miss the same keys', async () => {
    const body = await report({
      'locales/en.json': json({ a: 'A', b: 'B' }),
      'locales/ar.json': json({}),
      'locales/fr.json': json({}),
      'locales/de.json': json({ a: 'A-de' })
    })
    expect(body).toContain(
      [
        '### ❌ 2 locales: 2 missing keys',
        '',
        'Missing in `ar`, `fr`.',
        '',
        '| Key | en |',
        '|---|---|',
        '| [`a`](https://x/locales/en.json#L2) | A |',
        '| [`b`](https://x/locales/en.json#L3) | B |',
        '',
        '<details><summary>📋 Copy-paste for locales/{locale}.json (the same in each locale)</summary>'
      ].join('\n')
    )
    expect(body).toContain('### ❌ de: 1 missing key')
    expect(body.match(/Copy-paste for/g)).toHaveLength(2)
  })

  it('can show existing issues as a count table, to keep the comment small', async () => {
    const body = await report(
      {
        'locales/en.json': json({ a: 'A', b: 'B', c: 'Hi {name}' }),
        'locales/ar.json': json({ c: 'مرحبا', z: 'ز' })
      },
      { mark: (i) => ({ ...i, isNew: false }), existing: 'counts' }
    )
    expect(body).toContain(
      [
        '<details><summary>4 existing issues</summary>',
        '',
        '| Locale | Issue | Count |',
        '|---|---|---|',
        '| ar | ❌ missing keys | 2 |',
        '| ar | ❌ placeholder mismatch | 1 |',
        '| ar | ⚠️ extra key | 1 |',
        '',
        'Every issue is listed in the [job summary](https://x/run).',
        '</details>'
      ].join('\n')
    )
    expect(body).not.toContain('`b`')
  })

  it('says the pull request adds nothing new when only old issues remain', async () => {
    const body = await report(
      { 'locales/en.json': json({ a: 'A' }), 'locales/ar.json': json({}) },
      { mark: (i) => ({ ...i, isNew: false }) }
    )
    expect(body).toContain(
      '✅ This pull request adds no new translation issues.'
    )
    expect(body).toContain('New in this PR: 0 · Already existing: 1')
  })

  it('stays under the length limit and points to the job summary', async () => {
    const many = Object.fromEntries(
      Array.from({ length: 400 }, (_, i) => [`key${i}`, `Value number ${i}`])
    )
    const body = await report(
      {
        'locales/en.json': json(many),
        'locales/ar.json': json({}),
        'locales/fr.json': json({}),
        'locales/de.json': json({})
      },
      { maxLength: 30_000 }
    )
    // Every row fits, the copy-paste block does not
    expect(body.length).toBeLessThanOrEqual(30_000)
    expect(body.match(/^\| \[`key\d+`\]/gm)).toHaveLength(400)
    expect(body).not.toContain('Copy-paste for')
    expect(body).toContain(
      '📋 The copy-paste block is in the [job summary](https://x/run).'
    )
    expect(body).not.toContain('more issues')
  })

  it('cuts a section that is bigger than the limit to the rows that fit', async () => {
    const many = Object.fromEntries(
      Array.from({ length: 400 }, (_, i) => [`key${i}`, `Value number ${i}`])
    )
    const body = await report(
      {
        'locales/en.json': json(many),
        'locales/ar.json': json({}),
        'locales/fr.json': json({})
      },
      { maxLength: 10_000 }
    )
    const rows = body.match(/^\| \[`key\d+`\]/gm) ?? []
    expect(body.length).toBeLessThanOrEqual(10_000)
    expect(body).toContain('### ❌ 2 locales: 400 missing keys')
    expect(rows.length).toBeGreaterThan(50)
    expect(rows[0]).toBe('| [`key0`]')
    expect(body).not.toContain('Copy-paste for')
    expect(body).toContain('📋 The copy-paste block is in the [job summary]')
    // Each row stands for its key in both locales
    expect(body).toContain(
      `…and ${800 - rows.length * 2} more issues, see the [job summary](https://x/run).`
    )
  })

  it('keeps errors first when the limit cuts them', async () => {
    const many = Object.fromEntries(
      Array.from({ length: 400 }, (_, i) => [`key${i}`, `Value number ${i}`])
    )
    const body = await report(
      {
        'locales/en.json': json(many),
        'locales/ar.json': json({}),
        'locales/fr.json': json(
          Object.fromEntries(
            Array.from({ length: 400 }, (_, i) => [
              `key${i}`,
              i ? `Valeur ${i}` : ''
            ])
          )
        )
      },
      { maxLength: 10_000 }
    )
    const rows = body.match(/^\| \[`key\d+`\]/gm) ?? []
    expect(body).toContain('### ❌ ar: 400 missing keys')
    expect(body).not.toContain('⚠️ fr')
    expect(body).toContain(
      `…and ${400 - rows.length + 1} more issues, see the [job summary](https://x/run).`
    )
  })

  it('cuts existing issues to the rows that fit', async () => {
    const many = Object.fromEntries(
      Array.from({ length: 400 }, (_, i) => [`key${i}`, `Value number ${i}`])
    )
    const body = await report(
      { 'locales/en.json': json(many), 'locales/ar.json': json({}) },
      { maxLength: 10_000, mark: (i) => ({ ...i, isNew: false }) }
    )
    const rows = body.match(/^\| \[`key\d+`\]/gm) ?? []
    expect(body.length).toBeLessThanOrEqual(10_000)
    expect(body).toContain('#### ❌ ar: 400 missing keys')
    expect(rows.length).toBeGreaterThan(50)
    expect(body).toContain('</details>')
    expect(body).toContain(`…and ${400 - rows.length} more issues`)
  })

  it('points to the CLI, not to itself, when the job summary is cut', async () => {
    const many = Object.fromEntries(
      Array.from({ length: 400 }, (_, i) => [`key${i}`, `Value number ${i}`])
    )
    const project = await load({
      'locales/en.json': json(many),
      'locales/ar.json': json({}),
      'locales/fr.json': json({})
    })
    const body = renderReport({
      issues: analyze(project, { format: 'json' }),
      project,
      hasBaseline: false,
      maxLength: 5_000
    })
    expect(body).toMatch(
      /…and \d+ more issues not shown, because this page reached its size limit\. To list every issue, run `npx locale-guard-cli --all --output report\.md` on your machine\.\n$/
    )
    expect(body).not.toContain('see the job summary')
    expect(body).toContain('📋 The copy-paste block did not fit on this page.')
  })

  it('lists the keys of a grouped issue in a collapsed block', async () => {
    const body = await report({
      'locales/en.json': json({ a: 'Change password', b: 'Password changed' }),
      'locales/fr.json': json({ a: 'Şifre Değiştir', b: 'Şifre Değiştirildi' }),
      'locales/tr.json': json({ a: 'Şifre Değiştir', b: 'Şifre Değiştirildi' })
    })
    expect(body).toContain(
      [
        '- fr and tr have the same text in several keys, different from en. One file may be copied from the other, or both may still have an older en text · [fr.json:2](https://x/locales/fr.json#L2)',
        '  <details><summary>2 keys</summary>',
        '',
        '  - `a`: Şifre Değiştir',
        '  - `b`: Şifre Değiştirildi',
        '',
        '  </details>'
      ].join('\n')
    )
  })

  it('escapes table cells', async () => {
    const body = await report({
      'locales/en.json': json({ a: 'A | B\nC' }),
      'locales/ar.json': json({})
    })
    expect(body).toContain('| A \\| B<br>C |')
  })

  it('escapes a backslash so it cannot cancel the escaped pipe', async () => {
    const body = await report({
      'locales/en.json': json({ a: 'A \\| B' }),
      'locales/ar.json': json({})
    })
    expect(body).toContain('| A \\\\\\| B |')
  })

  it('names a space in a missing key in the table and keeps it in the copy-paste block', async () => {
    const body = await report({
      'locales/en.json': json({ deals: { 'attitude ': 'Attitude' } }),
      'locales/ar.json': json({})
    })
    expect(body).toContain(
      '| [`deals.attitude ` (with a space at the end)](https://x/locales/en.json#L3) | Attitude |'
    )
    expect(body).toContain('"attitude ": ""')
  })
})
