import { showKey } from '../key-label.js'
import type { Issue } from '../types.js'
import type { Check } from './context.js'

// The library fails on these at runtime, so they are errors in every locale
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
        message: `${showKey(key)}: ${error}`,
        baseValue: locale === base ? undefined : base.entries.get(key)?.value,
        isNew: true
      })
    }
  }

  return issues
}
