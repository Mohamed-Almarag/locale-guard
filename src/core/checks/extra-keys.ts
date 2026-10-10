import type { Issue } from '../types.js'
import { type Check, isBroken } from './context.js'

/**
 * F3: a key exists in a locale but not in the base locale (usually removed or
 * misspelled). i18next plural forms the base lacks (Arabic `items_few`) are
 * part of a group the base has, so they are not extra.
 */
export const extraKeys: Check = ({ base, targets, plurals }) => {
  const issues: Issue[] = []

  for (const target of targets) {
    for (const [key, entry] of target.entries) {
      if (base.entries.has(key) || plurals?.of(key)) continue
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
