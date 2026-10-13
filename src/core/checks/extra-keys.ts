import { showKey } from '../key-label.js'
import type { Issue, Locale } from '../types.js'
import { type Check, isBroken } from './context.js'

// i18next plural forms the base lacks (Arabic `items_few`) are not extra
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
        message: `Key ${showKey(key)} does not exist in ${base.code}`,
        hint: meant ? `Did you mean ${showKey(meant)}?` : undefined,
        isNew: true
      })
    }
  }

  return issues
}

// A missing base key in other letter case, or with one path segment misspelled
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

// Long enough that a small difference is not chance
function isTypo(a: string, b: string): boolean {
  const shorter = Math.min(a.length, b.length)
  if (shorter < 4) return false
  return editDistance(a, b) <= (shorter >= 8 ? 2 : 1)
}

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
