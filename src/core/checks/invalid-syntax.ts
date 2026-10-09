import type { Issue } from '../types.js'
import type { Check } from './context.js'

/**
 * Part of F5: a message the i18n library cannot compile. vue-i18n and next-intl
 * fail at runtime on these, so they are errors in every locale.
 */
export const invalidSyntax: Check = ({ base, targets, describe }) => {
  const issues: Issue[] = []

  for (const locale of [base, ...targets]) {
    for (const [key, entry] of locale.entries) {
      const { error } = describe(entry.value)
      if (!error) continue

      issues.push({
        check: 'invalid-syntax',
        severity: 'error',
        locale: locale.code,
        file: entry.file,
        key,
        line: entry.line,
        column: entry.column,
        message: error,
        baseValue: locale === base ? undefined : base.entries.get(key)?.value,
        isNew: true
      })
    }
  }

  return issues
}
