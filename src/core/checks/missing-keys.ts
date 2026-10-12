import type { Entry, Issue, Locale } from '../types.js'
import {
  type Check,
  anchorFor,
  baseEntryFor,
  expectedFile,
  isBroken
} from './context.js'
import { baseKeyFor, keyFor, neededForms } from './suffix-plurals.js'

// An i18next plural group with no forms needs the forms of the locale, not the base
export const missingKeys: Check = (context) => {
  const { base, targets, plurals } = context
  const issues: Issue[] = []

  for (const target of targets) {
    for (const [key, entry] of base.entries) {
      if (plurals?.of(key)) continue
      if (target.entries.has(key)) continue
      if (isBroken(target, key) || isBroken(base, key)) continue
      issues.push(missing(target, base, key, entry))
    }

    for (const plural of plurals?.stems(base) ?? []) {
      const anyBaseKey = baseKeyFor(base, plural)
      if (isBroken(target, anyBaseKey) || isBroken(base, anyBaseKey)) continue
      if (plurals?.forms(target, plural).size) continue

      const categories = neededForms(target.code, plural.ordinal) ?? [
        ...(plurals?.forms(base, plural).keys() ?? [])
      ]
      for (const category of categories) {
        const key = keyFor(plural, category)
        const entry = baseEntryFor(context, key) as Entry
        issues.push(missing(target, base, key, entry))
      }
    }
  }

  return issues
}

function missing(
  target: Locale,
  base: Locale,
  key: string,
  baseEntry: Entry
): Issue {
  const file = expectedFile(target, base, baseEntry.key)
  const anchor = target.files.some((f) => f.path === file)
    ? anchorFor(target, key)
    : { line: undefined, column: undefined }

  return {
    check: 'missing-keys',
    severity: 'error',
    locale: target.code,
    file,
    key,
    line: anchor.line,
    column: anchor.column,
    message: `Missing key \`${key}\``,
    baseValue: baseEntry.value,
    isNew: true
  }
}
