import type { Issue } from '../types.js'
import type { Check } from './context.js'

// Checked in every locale, the base included
export const emptyValues: Check = ({ base, targets }) => {
  const issues: Issue[] = []

  for (const locale of [base, ...targets]) {
    for (const [key, entry] of locale.entries) {
      if (entry.value.trim() !== '') continue

      issues.push({
        check: 'empty-values',
        severity: 'warning',
        locale: locale.code,
        file: entry.file,
        key,
        line: entry.line,
        column: entry.column,
        message: `Empty value for \`${key}\``,
        baseValue: locale === base ? undefined : base.entries.get(key)?.value,
        isNew: true
      })
    }
  }

  return issues
}
