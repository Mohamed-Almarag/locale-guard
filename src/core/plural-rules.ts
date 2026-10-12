// In CLDR order
export const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other']

const requiredCache = new Map<string, string[]>()

// Forms reached by whole numbers 0 to 1000, plus `other`; skips French `many`
export function requiredCategories(locale: string, ordinal: boolean): string[] {
  const id = `${locale}|${ordinal}`
  const cached = requiredCache.get(id)
  if (cached) return cached
  const rules = new Intl.PluralRules(locale, {
    type: ordinal ? 'ordinal' : 'cardinal'
  })
  const used = new Set<string>(['other'])
  for (let n = 0; n <= 1000; n++) used.add(rules.select(n))
  const required = PLURAL_CATEGORIES.filter((category) => used.has(category))
  requiredCache.set(id, required)
  return required
}

export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}
