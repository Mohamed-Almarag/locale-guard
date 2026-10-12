import type { Issue, Locale } from '../types.js'
import { type Check, isBroken } from './context.js'

/**
 * A key exists in a locale but not in the base locale (usually removed or
 * misspelled). i18next plural forms the base lacks (Arabic `items_few`) are
 * part of a group the base has, so they are not extra.
 */
export const extraKeys: Check = ({ base, targets, plurals }) => {
  const issues: Issue[] = []

  for (const target of targets) {
    for (const [key, entry] of target.entries) {
      if (base.entries.has(key) || plurals?.of(key)) continue
      if (isBroken(base, key) || isBroken(target, key)) continue

      const meant = meantKey(key, base, target)
      issues.push({
        check: 'extra-keys',
        severity: 'warning',
        locale: target.code,
        file: entry.file,
        key,
        line: entry.line,
        column: entry.column,
        message: `Key \`${key}\` does not exist in ${base.code}`,
        hint: meant ? `Did you mean \`${meant}\`?` : undefined,
        isNew: true
      })
    }
  }

  return issues
}

/**
 * The base key an extra key was probably meant to be, when that key is missing
 * from the locale: the same key in other letter case (`states.add_State`), or
 * one part of the path spelled a little differently (`service.name` for
 * `services.name`). Undefined when there is no single match.
 */
function meantKey(
  key: string,
  base: Locale,
  target: Locale
): string | undefined {
  const parts = key.toLowerCase().split('.')
  const matches: string[] = []

  for (const baseKey of base.entries.keys()) {
    if (target.entries.has(baseKey)) continue
    const other = baseKey.toLowerCase().split('.')
    if (other.length !== parts.length) continue

    const differing = parts.flatMap((part, i) => (part === other[i] ? [] : [i]))
    if (differing.length === 0) return baseKey
    const [i] = differing
    if (differing.length === 1 && i !== undefined) {
      if (isTypo(parts[i] as string, other[i] as string)) matches.push(baseKey)
    }
  }

  return matches.length === 1 ? matches[0] : undefined
}

/** One or two edits apart, and long enough that this is not chance. */
function isTypo(a: string, b: string): boolean {
  const shorter = Math.min(a.length, b.length)
  if (shorter < 4) return false
  return editDistance(a, b) <= (shorter >= 8 ? 2 : 1)
}

/** Levenshtein distance. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        (previous[j] as number) + 1,
        (current[j - 1] as number) + 1,
        (previous[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    previous = current
  }
  return previous[b.length] as number
}
