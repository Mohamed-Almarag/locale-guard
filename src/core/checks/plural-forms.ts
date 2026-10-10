import type { Issue, Locale } from '../types.js'
import { intlLocale } from '../locale-code.js'
import type { Check, CheckContext } from './context.js'

const ORDER = ['zero', 'one', 'two', 'few', 'many', 'other']

/** `=0`, `=1` and `=2` cover the categories that only contain that number. */
const EXACT: Record<string, string> = { '=0': 'zero', '=1': 'one', '=2': 'two' }

/**
 * F8: plural messages that miss forms the language needs.
 *
 * ICU (next-intl): the forms come from `Intl.PluralRules`, so every language
 * works without hand-written tables. A missing `other` is an error, since ICU
 * requires it.
 *
 * Only ICU is checked. vue-i18n plurals are `|` branches whose count depends
 * on custom rules, and a single branch is often correct ("{count} mois" in
 * French, "{count} ay" in Turkish), so a real project showed only false alarms.
 */
export const pluralForms: Check = (context) =>
  context.format === 'next-intl' ? icuPlurals(context) : []

function icuPlurals({ base, targets, describe }: CheckContext): Issue[] {
  const issues: Issue[] = []

  for (const locale of [base, ...targets]) {
    const code = intlLocale(locale.code)
    if (!code) continue

    for (const [key, entry] of locale.entries) {
      for (const plural of describe(entry.value).plurals) {
        const required = requiredCategories(code, plural.ordinal)
        const present = new Set(
          plural.options.map((option) => EXACT[option] ?? option)
        )
        const missing = required.filter((category) => !present.has(category))
        if (missing.length === 0) continue

        const needsOther = missing.includes('other')
        issues.push(
          issue(locale, key, entry, {
            severity: needsOther ? 'error' : 'warning',
            message: needsOther
              ? `\`${key}\`: \`{${plural.argument}, ${plural.ordinal ? 'selectordinal' : 'plural'}}\` has no \`other\` form, which ICU requires`
              : `\`${key}\`: ${languageName(code)} uses ${required.join(', ')}. Missing: ${missing.join(', ')}`,
            baseValue:
              locale === base ? undefined : base.entries.get(key)?.value
          })
        )
      }
    }
  }

  return issues
}

/**
 * Categories a message must cover: the ones that whole numbers from 0 to 1000
 * reach, plus `other`. This leaves out forms that only apply to millions or
 * decimals, such as French `many`, which almost no project writes.
 */
const requiredCache = new Map<string, string[]>()

function requiredCategories(locale: string, ordinal: boolean): string[] {
  const id = `${locale}|${ordinal}`
  const cached = requiredCache.get(id)
  if (cached) return cached
  const rules = new Intl.PluralRules(locale, {
    type: ordinal ? 'ordinal' : 'cardinal'
  })
  const used = new Set<string>(['other'])
  for (let n = 0; n <= 1000; n++) used.add(rules.select(n))
  const required = ORDER.filter((category) => used.has(category))
  requiredCache.set(id, required)
  return required
}

function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

function issue(
  locale: Locale,
  key: string,
  entry: { file: string; line: number; column: number },
  details: Pick<Issue, 'severity' | 'message' | 'baseValue'>
): Issue {
  return {
    check: 'plural-forms',
    locale: locale.code,
    file: entry.file,
    key,
    line: entry.line,
    column: entry.column,
    isNew: true,
    ...details
  }
}
