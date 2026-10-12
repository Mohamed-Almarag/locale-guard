import { intlLocale } from '../locale-code.js'
import { PLURAL_CATEGORIES, requiredCategories } from '../plural-rules.js'
import type { Locale } from '../types.js'

const SUFFIX = new RegExp(`^(.+?)_(ordinal_)?(${PLURAL_CATEGORIES.join('|')})$`)

export interface SuffixPlural {
  // `cart.items` for `cart.items_one`
  stem: string
  ordinal: boolean
  category: string
}

// A stem is a plural group only when the base has its `other` form
export class SuffixPlurals {
  private readonly groups = new Set<string>()

  constructor(base: Locale) {
    for (const key of base.entries.keys()) {
      const plural = parse(key)
      if (plural?.category === 'other') this.groups.add(groupId(plural))
    }
  }

  // Undefined when the key's stem is not a plural group
  of(key: string): SuffixPlural | undefined {
    const plural = parse(key)
    return plural && this.groups.has(groupId(plural)) ? plural : undefined
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

// `cart.items` + `few` -> `cart.items_few`
export function keyFor(plural: SuffixPlural, category: string): string {
  return `${plural.stem}_${plural.ordinal ? 'ordinal_' : ''}${category}`
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

// Undefined for an unknown locale code
export function neededForms(
  code: string,
  ordinal: boolean
): string[] | undefined {
  const locale = intlLocale(code)
  return locale ? requiredCategories(locale, ordinal) : undefined
}

function parse(key: string): SuffixPlural | undefined {
  const match = SUFFIX.exec(key)
  if (!match) return undefined
  return {
    stem: match[1] as string,
    ordinal: Boolean(match[2]),
    category: match[3] as string
  }
}

function groupId(plural: SuffixPlural): string {
  return `${plural.stem}|${plural.ordinal}`
}
