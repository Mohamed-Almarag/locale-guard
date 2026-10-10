import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/core/analyze.js'
import { markNew } from '../../src/core/baseline.js'
import { json, load, summarize } from '../helpers.js'

async function issues(files: Record<string, string>) {
  return analyze(await load(files), { format: 'next-intl' })
}

describe('markNew', () => {
  it('marks issues that already exist on the base branch as existing', async () => {
    const base = await issues({
      'locales/en.json': json({ a: 'A', b: 'B' }),
      'locales/ar.json': json({})
    })
    const head = await issues({
      'locales/en.json': json({ a: 'A', b: 'B', c: 'Hi {name}' }),
      'locales/ar.json': json({ c: 'مرحبا' })
    })

    const marked = markNew(head, base)

    expect(summarize(marked.filter((i) => i.isNew))).toEqual([
      'ar c:2 `c`: missing `{name}`'
    ])
    expect(summarize(marked.filter((i) => !i.isNew))).toEqual([
      'ar a:1 Missing key `a`',
      'ar b:1 Missing key `b`'
    ])
  })

  it('keeps an issue existing when the key moved to another line', async () => {
    const base = await issues({
      'locales/en.json': json({ a: 'Hi {name}' }),
      'locales/ar.json': json({ a: 'مرحبا' })
    })
    const head = await issues({
      'locales/en.json': json({ z: 'Z', a: 'Hi {name}' }),
      'locales/ar.json': json({ z: 'ي', a: 'مرحبا' })
    })

    expect(markNew(head, base).map((i) => i.isNew)).toEqual([false])
  })

  it('treats a changed problem on the same key as new', async () => {
    const base = await issues({
      'locales/en.json': json({ a: 'Hi {name} {count}' }),
      'locales/ar.json': json({ a: 'مرحبا {count}' })
    })
    const head = await issues({
      'locales/en.json': json({ a: 'Hi {name} {count}' }),
      'locales/ar.json': json({ a: 'مرحبا' })
    })

    expect(markNew(head, base).map((i) => [i.message, i.isNew])).toEqual([
      ['`a`: missing `{count}`, `{name}`', true]
    ])
  })

  it('treats everything as new when the base has no locale files yet', async () => {
    const head = await issues({
      'locales/en.json': json({ a: 'A' }),
      'locales/ar.json': json({})
    })
    expect(markNew(head, []).every((i) => i.isNew)).toBe(true)
  })
})
