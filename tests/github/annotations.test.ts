import { describe, expect, it, vi } from 'vitest'
import type { Issue } from '../../src/core/types.js'
import { annotate } from '../../src/github/annotations.js'

function issue(overrides: Partial<Issue>): Issue {
  const key = overrides.key ?? 'a'
  return {
    check: 'missing-keys',
    severity: 'error',
    locale: 'ar',
    file: 'locales/ar.json',
    key,
    line: 3,
    column: 5,
    message: `Missing key \`${key}\``,
    isNew: true,
    ...overrides
  }
}

function sink() {
  return { error: vi.fn(), warning: vi.fn(), notice: vi.fn() }
}

describe('annotate', () => {
  it('annotates each issue on its file and line, with the base value', () => {
    const out = sink()
    annotate(
      [
        issue({ baseValue: 'Bid' }),
        issue({ severity: 'warning', check: 'extra-keys', line: 9 })
      ],
      'en',
      out
    )

    expect(out.error).toHaveBeenCalledWith('Missing key a\nen: Bid', {
      title: 'Locale Guard: missing-keys (ar)',
      file: 'locales/ar.json',
      startLine: 3,
      startColumn: 5
    })
    expect(out.warning).toHaveBeenCalledTimes(1)
    expect(out.notice).not.toHaveBeenCalled()
  })

  it('leaves out the file when there is no line, e.g. a namespace file that does not exist', () => {
    const out = sink()
    annotate([issue({ line: undefined, column: undefined })], 'en', out)
    expect(out.error.mock.calls[0]?.[1]).toMatchObject({ file: undefined })
  })

  it('keeps to 10 per severity, new issues first, and counts the rest', () => {
    const out = sink()
    const existing = Array.from({ length: 5 }, (_, i) =>
      issue({ key: `old${i}`, isNew: false })
    )
    const fresh = Array.from({ length: 12 }, (_, i) =>
      issue({ key: `new${i}` })
    )

    annotate([...existing, ...fresh], 'en', out)

    expect(out.error).toHaveBeenCalledTimes(10)
    expect(out.error.mock.calls.map(([m]) => m)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Missing key new${i}`)
    )
    expect(out.notice).toHaveBeenCalledWith(
      expect.stringMatching(/^7 more translation issues/),
      { title: 'Locale Guard' }
    )
  })
})
