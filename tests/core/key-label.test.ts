import { describe, expect, it } from 'vitest'
import { showKey } from '../../src/core/key-label.js'

describe('showKey', () => {
  it('shows a key as is when every space can be seen', () => {
    expect(showKey('cart.title')).toBe('`cart.title`')
    expect(showKey('forgot password')).toBe('`forgot password`')
    expect(showKey('deals .attitude')).toBe('`deals .attitude`')
  })

  it('names a space at the start or end of the key', () => {
    expect(showKey('deals.attitude ')).toBe(
      '`deals.attitude ` (with a space at the end)'
    )
    expect(showKey(' deals.attitude')).toBe(
      '` deals.attitude` (with a space at the start)'
    )
  })

  it('names characters that take no space on screen', () => {
    for (const code of [0x200b, 0x200f, 0x2060, 0xfeff]) {
      const key = `cart${String.fromCharCode(code)}.title`
      expect(showKey(key)).toBe(`\`${key}\` (with an invisible character)`)
    }
  })
})
