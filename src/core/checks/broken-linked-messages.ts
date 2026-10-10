import type { Issue } from '../types.js'
import { type Check, isBroken } from './context.js'

/**
 * A vue-i18n linked message (`@:common.save`) points to a key that does not
 * exist in the same locale, so the message renders broken.
 */
export const brokenLinkedMessages: Check = ({
  format,
  base,
  targets,
  describe
}) => {
  if (format !== 'vue-i18n') return []
  const issues: Issue[] = []

  for (const locale of [base, ...targets]) {
    for (const [key, entry] of locale.entries) {
      for (const linked of describe(entry.value).linkedKeys) {
        if (locale.entries.has(linked) || isBroken(locale, linked)) continue

        issues.push({
          check: 'broken-linked-messages',
          severity: 'error',
          locale: locale.code,
          file: entry.file,
          key,
          line: entry.line,
          column: entry.column,
          message: `\`${key}\` links to \`@:${linked}\`, which does not exist in ${locale.code}`,
          isNew: true
        })
      }
    }
  }

  return issues
}
