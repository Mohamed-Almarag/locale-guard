import type { Issue } from '../types.js'
import { type Check, anchorFor, expectedFile, isBroken } from './context.js'

/** F2: a key exists in the base locale but not in another locale. */
export const missingKeys: Check = ({ base, targets }) => {
  const issues: Issue[] = []

  for (const target of targets) {
    for (const [key, entry] of base.entries) {
      if (target.entries.has(key)) continue
      if (isBroken(target, key) || isBroken(base, key)) continue

      const file = expectedFile(target, base, key)
      const anchor = target.files.some((f) => f.path === file)
        ? anchorFor(target, key)
        : { line: undefined, column: undefined }

      issues.push({
        check: 'missing-keys',
        severity: 'error',
        locale: target.code,
        file,
        key,
        line: anchor.line,
        column: anchor.column,
        message: `Missing key \`${key}\``,
        baseValue: entry.value,
        isNew: true
      })
    }
  }

  return issues
}
