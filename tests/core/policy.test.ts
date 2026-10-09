import { describe, expect, it } from 'vitest'
import { decide } from '../../src/core/policy.js'
import type { Issue } from '../../src/core/types.js'

const base: Issue = {
  check: 'missing-keys',
  severity: 'error',
  locale: 'ar',
  file: 'a.json',
  key: 'k',
  message: 'm',
  isNew: true
}
const error = base
const warning: Issue = { ...base, severity: 'warning', check: 'extra-keys' }
const oldError: Issue = { ...base, isNew: false }

describe('decide (F13)', () => {
  it('fail-on error fails on errors only', () => {
    const options = { failOn: 'error' as const, failOnExisting: false }
    expect(decide([warning], options).failed).toBe(false)
    expect(decide([warning, error], options)).toEqual({
      failed: true,
      blocking: [error]
    })
  })

  it('fail-on warning fails on anything', () => {
    expect(
      decide([warning], { failOn: 'warning', failOnExisting: false }).failed
    ).toBe(true)
  })

  it('fail-on never only reports', () => {
    expect(
      decide([error], { failOn: 'never', failOnExisting: true }).failed
    ).toBe(false)
  })

  it('ignores existing issues unless fail-on-existing is set', () => {
    expect(
      decide([oldError], { failOn: 'error', failOnExisting: false }).failed
    ).toBe(false)
    expect(
      decide([oldError], { failOn: 'error', failOnExisting: true }).failed
    ).toBe(true)
  })

  it('passes with no issues', () => {
    expect(decide([], { failOn: 'warning', failOnExisting: true }).failed).toBe(
      false
    )
  })
})
