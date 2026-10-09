/**
 * File patterns use `{locale}` where the locale code appears in the path:
 *
 *   locales/{locale}.json         -> locales/ar.json            (locale "ar")
 *   locales/{locale}/*.json       -> locales/ar/checkout.json   (locale "ar", namespace "checkout")
 *   locales/{locale}/**\/*.yml    -> locales/ar/admin/users.yml (locale "ar", namespace "admin.users")
 *
 * A `*` in the file name or in a folder becomes part of the namespace, so every
 * key in that file is prefixed with it.
 */

export interface PatternMatch {
  locale: string
  namespace: string
}

const LOCALE = '{locale}'

export function validatePattern(pattern: string): string | undefined {
  const count = pattern.split(LOCALE).length - 1
  if (count === 0) return `Pattern "${pattern}" must contain ${LOCALE}`
  if (count > 1) return `Pattern "${pattern}" must contain ${LOCALE} only once`
  return undefined
}

/** Turns a pattern into a glob that finds every locale. */
export function toGlob(pattern: string): string {
  return normalize(pattern).replace(LOCALE, '*')
}

export function matchPattern(
  pattern: string,
  path: string
): PatternMatch | undefined {
  const { regex, namespaceGroups } = compile(normalize(pattern))
  const match = regex.exec(normalize(path))
  if (!match?.groups?.locale) return undefined

  const namespace = namespaceGroups
    .map((name) => match.groups?.[name] ?? '')
    .filter(Boolean)
    .join('/')
    .split('/')
    .filter(Boolean)
    .join('.')

  return { locale: match.groups.locale, namespace }
}

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '')
}

function compile(pattern: string): {
  regex: RegExp
  namespaceGroups: string[]
} {
  const namespaceGroups: string[] = []
  let source = ''
  let i = 0

  while (i < pattern.length) {
    if (pattern.startsWith(LOCALE, i)) {
      source += '(?<locale>[^/]+)'
      i += LOCALE.length
    } else if (pattern.startsWith('**/', i)) {
      const name = `ns${namespaceGroups.length}`
      namespaceGroups.push(name)
      source += `(?:(?<${name}>.+)/)?`
      i += 3
    } else if (pattern[i] === '*') {
      // A star right after a dot is a file extension, not a namespace.
      if (pattern[i - 1] === '.') {
        source += '[^/]+'
      } else {
        const name = `ns${namespaceGroups.length}`
        namespaceGroups.push(name)
        source += `(?<${name}>[^/]+?)`
      }
      i += 1
    } else {
      source += escape(pattern[i] as string)
      i += 1
    }
  }

  return { regex: new RegExp(`^${source}$`), namespaceGroups }
}

function escape(char: string): string {
  return /[.+?^${}()|[\]\\]/.test(char) ? `\\${char}` : char
}
