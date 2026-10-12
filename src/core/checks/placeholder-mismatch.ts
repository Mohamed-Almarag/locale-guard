import type { Issue } from '../types.js'
import { type Check, baseEntryFor } from './context.js'

// Linked messages are skipped: translators often write the text instead
export const placeholderMismatch: Check = (context) => {
  const { targets, describe, plurals } = context
  const issues: Issue[] = []

  for (const target of targets) {
    for (const [key, entry] of target.entries) {
      const baseEntry = baseEntryFor(context, key)
      if (!baseEntry || entry.value.trim() === '') continue

      const expected = describe(baseEntry.value)
      const actual = describe(entry.value)
      if (expected.error || actual.error) continue

      const plural = Boolean(plurals?.of(key))
      const comparable = (p: string) =>
        isComparable(p) && !(plural && COUNT.has(p))
      const want = expected.placeholders.filter(comparable)
      const have = actual.placeholders.filter(comparable)
      const missing = want.filter((p) => !have.includes(p))
      const unexpected = have.filter((p) => !want.includes(p))
      if (missing.length === 0 && unexpected.length === 0) continue

      const parts = [
        missing.length ? `missing ${list(missing)}` : '',
        unexpected.length ? `unexpected ${list(unexpected)}` : ''
      ].filter(Boolean)

      issues.push({
        check: 'placeholder-mismatch',
        severity: 'error',
        locale: target.code,
        file: entry.file,
        key,
        line: entry.line,
        column: entry.column,
        message: `\`${key}\`: ${parts.join(', ')}`,
        baseValue: baseEntry.value,
        isNew: true
      })
    }
  }

  return issues
}

// A plural form may write the count out in words
const COUNT = new Set(['{{count}}', '{count}'])

function isComparable(placeholder: string): boolean {
  return !placeholder.startsWith('@:')
}

function list(placeholders: string[]): string {
  return placeholders.map((p) => `\`${p}\``).join(', ')
}
