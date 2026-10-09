import type { Issue } from '../types.js'
import type { Check } from './context.js'

/**
 * F5: the placeholders of a translation differ from the base message.
 * Messages that cannot be parsed are left to the invalid-syntax check.
 *
 * vue-i18n linked messages (`@:key`) are not compared: translators often write
 * the text instead of linking, to fit the grammar of their language, and a link
 * to a wrong key is reported by broken-linked-messages.
 */
export const placeholderMismatch: Check = ({ base, targets, describe }) => {
  const issues: Issue[] = []

  for (const target of targets) {
    for (const [key, entry] of target.entries) {
      const baseEntry = base.entries.get(key)
      if (!baseEntry || entry.value.trim() === '') continue

      const expected = describe(baseEntry.value)
      const actual = describe(entry.value)
      if (expected.error || actual.error) continue

      const want = expected.placeholders.filter(isComparable)
      const have = actual.placeholders.filter(isComparable)
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

function isComparable(placeholder: string): boolean {
  return !placeholder.startsWith('@:')
}

function list(placeholders: string[]): string {
  return placeholders.map((p) => `\`${p}\``).join(', ')
}
