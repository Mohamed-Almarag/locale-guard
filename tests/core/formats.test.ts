import { describe, expect, it } from 'vitest'
import { describeIcuMessage } from '../../src/core/formats/icu.js'
import { describePlainMessage } from '../../src/core/formats/plain.js'
import { describeVueMessage } from '../../src/core/formats/vue-i18n.js'

describe('describeVueMessage', () => {
  it('reads named and list placeholders', () => {
    expect(describeVueMessage('Hello {name}, you have {0} messages')).toEqual({
      placeholders: ['{0}', '{name}'],
      linkedKeys: [],
      plurals: [],
      text: 'Hello , you have  messages'
    })
  })

  it('reads linked messages with and without modifiers', () => {
    const info = describeVueMessage('@:common.save and @.lower:common.cancel')
    expect(info.linkedKeys).toEqual(['common.save', 'common.cancel'])
    expect(info.placeholders).toEqual(['@:common.cancel', '@:common.save'])
  })

  it('merges the placeholders of plural branches', () => {
    const info = describeVueMessage('no items | one item | {count} items')
    expect(info.placeholders).toEqual(['{count}'])
  })

  it('keeps literal text such as an escaped @', () => {
    expect(describeVueMessage("support{'@'}example.com").text).toBe(
      'support@example.com'
    )
  })

  it('reports messages vue-i18n cannot compile', () => {
    expect(describeVueMessage('Hi {name').error).toBe(
      'Invalid vue-i18n message: Unterminated closing brace (column 5)'
    )
    expect(describeVueMessage('support@example.com').error).toMatch(
      /^Invalid vue-i18n message: Invalid linked format/
    )
  })
})

describe('describeIcuMessage', () => {
  it('reads simple and formatted arguments', () => {
    expect(
      describeIcuMessage('Hi {name}, total {amount, number, ::currency/USD}')
        .placeholders
    ).toEqual(['{amount}', '{name}'])
  })

  it('reads plural and select arguments and the placeholders inside them', () => {
    const info = describeIcuMessage(
      '{count, plural, =0 {none} one {# item} other {# items for {name}}}'
    )
    expect(info.placeholders).toEqual(['{count}', '{name}'])
    expect(info.plurals).toEqual([
      {
        argument: 'count',
        ordinal: false,
        options: ['=0', 'one', 'other']
      }
    ])
    expect(
      describeIcuMessage('{gender, select, male {He} other {They}}')
        .placeholders
    ).toEqual(['{gender}'])
  })

  it('reads ordinal plurals', () => {
    expect(
      describeIcuMessage('{n, selectordinal, one {#st} other {#th}}').plurals
    ).toMatchObject([{ argument: 'n', ordinal: true }])
  })

  it('reads rich text tags', () => {
    expect(
      describeIcuMessage('Read the <link>terms</link> and <b>{name}</b>')
        .placeholders
    ).toEqual(['<b>', '<link>', '{name}'])
  })

  it('keeps apostrophes in plain text', () => {
    expect(describeIcuMessage("Welcome back, ma'am").text).toBe(
      "Welcome back, ma'am"
    )
  })

  it('accepts a plural without other, so plural-forms can report it', () => {
    expect(describeIcuMessage('{n, plural, one {x}}').error).toBeUndefined()
  })

  it('reports messages ICU cannot parse', () => {
    expect(describeIcuMessage('Hi {name').error).toMatch(
      /^Invalid ICU message: expect argument closing brace/
    )
    expect(describeIcuMessage('<b>bold').error).toMatch(/^Invalid ICU message/)
  })

  it('reads tags as plain text with ignoreTags, keeping arguments', () => {
    const info = describeIcuMessage(
      'Read <a href="https://example.com">the policy</a> and <b>{name}</b>',
      { ignoreTags: true }
    )
    expect(info.error).toBeUndefined()
    expect(info.placeholders).toEqual(['{name}'])
    expect(info.text).toBe('Read the policy and')
  })

  it('still reports broken ICU syntax with ignoreTags', () => {
    expect(describeIcuMessage('Hi {name', { ignoreTags: true }).error).toMatch(
      /^Invalid ICU message: expect argument closing brace/
    )
  })
})

describe('describePlainMessage', () => {
  it('reads {name} and {{name}} placeholders', () => {
    expect(describePlainMessage('Hi {name}, {{ count }} new')).toEqual({
      placeholders: ['{name}', '{{count}}'],
      linkedKeys: [],
      plurals: [],
      text: 'Hi , new'
    })
  })

  it('ignores braces that are not placeholders', () => {
    expect(describePlainMessage('Use { and } carefully').placeholders).toEqual(
      []
    )
    expect(describePlainMessage('{نص عادي}').placeholders).toEqual([])
  })

  it('reads translated placeholder names in any script', () => {
    expect(describePlainMessage('مرحبا {الاسم}').placeholders).toEqual([
      '{الاسم}'
    ])
    expect(describePlainMessage('تم {{ نماذج }}').placeholders).toEqual([
      '{{نماذج}}'
    ])
    expect(describePlainMessage('नमस्ते {नाम}').placeholders).toEqual(['{नाम}'])
  })
})
