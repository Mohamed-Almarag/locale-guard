import { intlLocale } from '../locale-code.js'
import { PLURAL_CATEGORIES, requiredCategories } from '../plural-rules.js'
import type { Locale } from '../types.js'

const SUFFIX = new RegExp(`^(.+?)_(ordinal_)?(${PLURAL_CATEGORIES.join('|')})$`)

export interface SuffixPlural {
  /** The key without its plural suffix: `cart.items` for `cart.items_one`. */
  stem: string
  ordinal: boolean
  category: string
}

/**
 * i18next writes each plural form as its own key: `items_one`, `items_other`,
 * and for Arabic also `items_zero`, `items_two`, `items_few`, `items_many`.
 * Compared key by key, a correct Arabic file has "extra" keys and a correct
 * Japanese file (only `items_other`) has "missing" ones.
 *
 * A stem counts as a plural group only when the base locale has its `other`
 * form, which i18next requires. Numbered keys like `note_one`, `note_two`,
 * `note_three` (seen on a real project) stay plain keys.
 */
export class SuffixPlurals {
  private readonly groups = new Set<string>()

  constructor(base: Locale) {
    for (const key of base.entries.keys()) {
      const plural = parse(key)
      if (plural?.category === 'other') this.groups.add(groupId(plural))
    }
  }

  /** The plural form a key stands for, if its stem is a plural group in the base. */
  of(key: string): SuffixPlural | undefined {
    const plural = parse(key)
    return plural && this.groups.has(groupId(plural)) ? plural : undefined
  }

  /** The forms of a group that a locale has, by category. */
  forms(locale: Locale, plural: SuffixPlural): Map<string, string> {
    const found = new Map<string, string>()
    for (const category of PLURAL_CATEGORIES) {
      const key = keyFor(plural, category)
      if (locale.entries.has(key)) found.set(category, key)
    }
    return found
  }

  /** Every group in the base, once. */
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

/** The key of one form of a group: `cart.items` and `few` give `cart.items_few`. */
export function keyFor(plural: SuffixPlural, category: string): string {
  return `${plural.stem}_${plural.ordinal ? 'ordinal_' : ''}${category}`
}

/**
 * The base key to compare a plural form with: the same form when the base has
 * it, otherwise its `other` form (Arabic `items_few` against English
 * `items_other`), otherwise any form the base has.
 */
export function baseKeyFor(base: Locale, plural: SuffixPlural): string {
  const candidates = [plural.category, 'other', ...PLURAL_CATEGORIES]
  for (const category of candidates) {
    const key = keyFor(plural, category)
    if (base.entries.has(key)) return key
  }
  return keyFor(plural, 'other')
}

/** The forms a locale needs, or undefined when its code is not a known locale. */
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
