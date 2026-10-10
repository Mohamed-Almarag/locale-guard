import { describe, expect, it } from 'vitest'
import { parseJson } from '../../src/core/loaders/json.js'
import { parseYaml } from '../../src/core/loaders/yaml.js'
import { json, load } from '../helpers.js'

describe('parseJson', () => {
  it('flattens nested keys with their line and column', () => {
    const result = parseJson(
      ['{', '  "auction": {', '    "bid": "Bid"', '  }', '}'].join('\n')
    )
    expect(result).toEqual({
      ok: true,
      nodes: [
        { key: 'auction', line: 2, column: 3 },
        { key: 'auction.bid', line: 3, column: 5 }
      ],
      entries: [{ key: 'auction.bid', value: 'Bid', line: 3, column: 5 }]
    })
  })

  it('flattens arrays by index and stringifies scalars', () => {
    const result = parseJson(json({ days: ['Mon', 'Tue'], n: 1, b: null }))
    expect(result.ok && result.entries.map((e) => [e.key, e.value])).toEqual([
      ['days.0', 'Mon'],
      ['days.1', 'Tue'],
      ['n', '1'],
      ['b', '']
    ])
  })

  it('handles Windows line endings', () => {
    const result = parseJson('{\r\n  "a": "1",\r\n  "b": "2"\r\n}')
    expect(result.ok && result.entries.map((e) => e.line)).toEqual([2, 3])
  })

  it('reports a missing comma with its line', () => {
    const result = parseJson('{\n  "a": "1"\n  "b": "2"\n}')
    expect(result).toEqual({
      ok: false,
      message: 'Invalid JSON: Expected "," between entries',
      line: 3,
      column: 3
    })
  })

  it('reports trailing commas and comments, which JSON.parse rejects', () => {
    expect(parseJson('{\n  "a": "1",\n}').ok).toBe(false)
    expect(parseJson('{\n  // note\n  "a": "1"\n}').ok).toBe(false)
  })

  it('rejects a top level that is not an object', () => {
    expect(parseJson('["a"]')).toMatchObject({
      ok: false,
      message: 'Expected an object at the top level'
    })
  })

  it('rejects an empty file', () => {
    expect(parseJson('').ok).toBe(false)
  })
})

describe('parseYaml', () => {
  it('flattens nested keys with their line and column', () => {
    const result = parseYaml('auction:\n  bid: Bid\n  tooLow: "Too low"\n')
    expect(result).toEqual({
      ok: true,
      nodes: [
        { key: 'auction', line: 1, column: 1 },
        { key: 'auction.bid', line: 2, column: 3 },
        { key: 'auction.tooLow', line: 3, column: 3 }
      ],
      entries: [
        { key: 'auction.bid', value: 'Bid', line: 2, column: 3 },
        { key: 'auction.tooLow', value: 'Too low', line: 3, column: 3 }
      ]
    })
  })

  it('resolves aliases', () => {
    const result = parseYaml('a: &x Hello\nb: *x\n')
    expect(result.ok && result.entries.map((e) => [e.key, e.value])).toEqual([
      ['a', 'Hello'],
      ['b', 'Hello']
    ])
  })

  it('treats an empty file as no keys', () => {
    expect(parseYaml('')).toEqual({ ok: true, entries: [], nodes: [] })
  })

  it('treats a file with only a document marker or comments as no keys', () => {
    const empty = { ok: true, entries: [], nodes: [] }
    expect(parseYaml('---\r\n')).toEqual(empty)
    expect(parseYaml('# translated later\n')).toEqual(empty)
  })

  it('still rejects a scalar at the top level', () => {
    expect(parseYaml('just text\n')).toMatchObject({
      ok: false,
      message: 'Expected a map of keys at the top level'
    })
  })

  it('reports invalid YAML with its line', () => {
    const result = parseYaml('a: 1\nb: [1, 2\nc: 3\n')
    expect(result).toMatchObject({ ok: false, line: expect.any(Number) })
    expect(!result.ok && result.message).toMatch(/^Invalid YAML/)
  })
})

describe('loadProject', () => {
  it('finds every locale from the pattern', async () => {
    const project = await load({
      'locales/en.json': json({ a: 'A' }),
      'locales/ar.json': json({ a: 'أ' }),
      'other/fr.json': json({ a: 'A' })
    })
    expect([...project.locales.keys()]).toEqual(['ar', 'en'])
    expect(project.locales.get('ar')?.entries.get('a')).toMatchObject({
      value: 'أ',
      file: 'locales/ar.json',
      line: 2
    })
  })

  it('prefixes keys with the namespace of their file', async () => {
    const project = await load(
      {
        'locales/en/common.json': json({ save: 'Save' }),
        'locales/en/checkout.yml': 'coupon:\n  invalid: Invalid\n'
      },
      { patterns: ['locales/{locale}/*.json', 'locales/{locale}/*.yml'] }
    )
    const en = project.locales.get('en')
    expect([...(en?.entries.keys() ?? [])].sort()).toEqual([
      'checkout.coupon.invalid',
      'common.save'
    ])
    expect(en?.entries.get('common.save')).toMatchObject({
      fileKey: 'save',
      file: 'locales/en/common.json'
    })
  })

  it('reports a broken file and still loads the other files', async () => {
    const project = await load(
      {
        'locales/en/common.json': json({ save: 'Save' }),
        'locales/en/checkout.json': '{\n  "a": "1",\n}'
      },
      { patterns: ['locales/{locale}/*.json'] }
    )
    expect(project.parseErrors).toMatchObject([
      {
        check: 'parse-error',
        severity: 'error',
        locale: 'en',
        file: 'locales/en/checkout.json',
        line: 3
      }
    ])
    const en = project.locales.get('en')
    expect(en?.entries.has('common.save')).toBe(true)
    expect(en?.brokenNamespaces).toEqual(new Set(['checkout']))
  })

  it('skips files whose locale part is not a locale code', async () => {
    const project = await load({
      'locales/en.json': json({ a: 'A' }),
      'locales/ur.json': json({ a: 'ا' }),
      'locales/vee-validate-ur.json': json({ messages: { required: 'x' } })
    })
    expect([...project.locales.keys()]).toEqual(['en', 'ur'])
    expect(project.skipped).toEqual(['locales/vee-validate-ur.json'])
  })

  it('ignores a byte order mark', async () => {
    const project = await load({ 'locales/en.json': '﻿{"a": "A"}' })
    expect(project.parseErrors).toEqual([])
  })
})
