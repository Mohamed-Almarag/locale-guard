import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/core/analyze.js'
import type { Issue } from '../../src/core/types.js'
import { MARKER, renderReport } from '../../src/reporters/markdown.js'
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
    expect(body.length).toBeLessThanOrEqual(30_000)
    expect(body).toMatch(
      /…and \d+ more issues, see the \[job summary\]\(https:\/\/x\/run\)\./
    )
  })

  it('does not point the job summary at itself when it is cut', async () => {
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
      /…and \d+ more issues not shown, because this page reached its size limit\./
    )
    expect(body).not.toContain('see the job summary')
  })

  it('lists the keys of a grouped issue in a collapsed block', async () => {
    const body = await report({
      'locales/en.json': json({ a: 'Change password', b: 'Password changed' }),
      'locales/fr.json': json({ a: 'Şifre Değiştir', b: 'Şifre Değiştirildi' }),
      'locales/tr.json': json({ a: 'Şifre Değiştir', b: 'Şifre Değiştirildi' })
    })
    expect(body).toContain(
      [
        '- fr and tr have identical values, so one file was probably copied into the other · [fr.json:2](https://x/locales/fr.json#L2)',
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
})
