import { pluralLocale } from '../locale-code.js'
import { PLURAL_CATEGORIES, requiredCategories } from '../plural-rules.js'
import type { Locale } from '../types.js'

const SUFFIX = new RegExp(`^(.+?)_(ordinal_)?(${PLURAL_CATEGORIES.join('|')})$`)
// Rails: `items: { one: ..., other: ... }`
const NESTED = new RegExp(`^(.+)\\.(${PLURAL_CATEGORIES.join('|')})$`)

export interface SuffixPlural {
  // `cart.items` for `cart.items_one`
  stem: string
  ordinal: boolean
  category: string
  // `_` for i18next `items_one`, `.` for Rails `items.one`
  separator: '_' | '.'
}

// A stem is a plural group only when the base has its `other` form. A Rails
// group also needs YAML files wrapped in their locale, and only forms under it
export class SuffixPlurals {
  private readonly groups = new Set<string>()

  constructor(base: Locale) {
    const nested = base.files.some(
      (file) => file.root && /\.ya?ml$/i.test(file.path)
    )
    for (const key of base.entries.keys()) {
      for (const plural of parse(key, nested)) {
        if (plural.category !== 'other') continue
        if (plural.separator === '.' && !onlyForms(base, plural.stem)) continue
        this.groups.add(groupId(plural))
      }
    }
  }

  // Undefined when the key's stem is not a plural group
  of(key: string): SuffixPlural | undefined {
    return parse(key, true).find((plural) => this.groups.has(groupId(plural)))
  }

  // Category -> key
  forms(locale: Locale, plural: SuffixPlural): Map<string, string> {
    const found = new Map<string, string>()
    for (const category of PLURAL_CATEGORIES) {
      const key = keyFor(plural, category)
      if (locale.entries.has(key)) found.set(category, key)
    }
    return found
  }

  stems(base: Locale): SuffixPlural[] {
    const seen = new Map<string, SuffixPlural>()
    for (const key of base.entries.keys()) {
      const plural = this.of(key)
      if (plural && !seen.has(groupId(plural))) {
        seen.set(groupId(plural), plural)
      }
    }
    return [...seen.values()]
  }
}

// `cart.items` + `few` -> `cart.items_few`, or `cart.items.few` in Rails
export function keyFor(plural: SuffixPlural, category: string): string {
  return `${plural.stem}${plural.separator}${plural.ordinal ? 'ordinal_' : ''}${category}`
}

// The same form, else `other`, else any form the base has
export function baseKeyFor(base: Locale, plural: SuffixPlural): string {
  const candidates = [plural.category, 'other', ...PLURAL_CATEGORIES]
  for (const category of candidates) {
    const key = keyFor(plural, category)
    if (base.entries.has(key)) return key
  }
  return keyFor(plural, 'other')
}

// Undefined for an unknown locale code, or one without plural rules in Intl
export function neededForms(
  code: string,
  ordinal: boolean
): string[] | undefined {
  const locale = pluralLocale(code)
  return locale ? requiredCategories(locale, ordinal) : undefined
}

function parse(key: string, nested: boolean): SuffixPlural[] {
  const found: SuffixPlural[] = []
  const suffix = SUFFIX.exec(key)
  if (suffix) {
    found.push({
      stem: suffix[1] as string,
      ordinal: Boolean(suffix[2]),
      category: suffix[3] as string,
      separator: '_'
    })
  }
  const child = nested ? NESTED.exec(key) : null
  if (child) {
    found.push({
      stem: child[1] as string,
      ordinal: false,
      category: child[2] as string,
      separator: '.'
    })
  }
  return found
}

// Every base key under the stem is a plural form
function onlyForms(base: Locale, stem: string): boolean {
  for (const key of base.entries.keys()) {
    if (!key.startsWith(`${stem}.`)) continue
    if (!PLURAL_CATEGORIES.includes(key.slice(stem.length + 1))) return false
  }
  return true
}

function groupId(plural: SuffixPlural): string {
  return `${plural.stem}|${plural.separator}|${plural.ordinal}`
}
