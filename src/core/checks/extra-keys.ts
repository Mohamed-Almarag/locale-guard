import type { Issue } from '../types.js'
import { type Check, isBroken } from './context.js'

/** F3: a key exists in a locale but not in the base locale (usually removed or misspelled). */
export const extraKeys: Check = ({ base, targets }) => {
  const issues: Issue[] = []

  for (const target of targets) {
    for (const [key, entry] of target.entries) {
      if (base.entries.has(key)) continue
      if (isBroken(base, key) || isBroken(target, key)) continue

      issues.push({
        check: 'extra-keys',
        severity: 'warning',
        locale: target.code,
        file: entry.file,
        key,
        line: entry.line,
        column: entry.column,
        message: `Key \`${key}\` does not exist in ${base.code}`,
        isNew: true
      })
    }
  }

  return issues
}
