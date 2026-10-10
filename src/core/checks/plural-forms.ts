import type { Issue, Locale } from '../types.js'
import { intlLocale } from '../locale-code.js'
import { languageName, requiredCategories } from '../plural-rules.js'
import type { Check, CheckContext } from './context.js'
import { keyFor, neededForms } from './suffix-plurals.js'

/** `=0`, `=1` and `=2` cover the categories that only contain that number. */
const EXACT: Record<string, string> = { '=0': 'zero', '=1': 'one', '=2': 'two' }

/**
 * Plural messages that miss forms the language needs.
 *
 * ICU (next-intl): the forms come from `Intl.PluralRules`, so every language
 * works without hand-written tables. A missing `other` is an error, since ICU
 * requires it.
 *
 * Plain JSON (i18next): each form is its own key (`items_one`, `items_few`),
 * checked against the same rules. A missing `other` is an error, since
 * i18next falls back to it for every count without its own form.
 *
 * vue-i18n is not checked. Its plurals are `|` branches whose count depends
 * on custom rules, and a single branch is often correct ("{count} mois" in
 * French, "{count} ay" in Turkish), so a real project showed only false alarms.
 */
export const pluralForms: Check = (context) =>
  context.format === 'next-intl'
    ? icuPlurals(context)
    : context.format === 'json'
      ? suffixPlurals(context)
      : []

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

/** i18next plural groups: one issue per group and locale that misses forms. */
function suffixPlurals({ base, targets, plurals }: CheckContext): Issue[] {
  if (!plurals) return []
  const issues: Issue[] = []

  for (const locale of [base, ...targets]) {
    const code = intlLocale(locale.code)
    for (const plural of plurals.stems(base)) {
      const forms = plurals.forms(locale, plural)
      // A group with no form at all is reported by missing-keys.
      const needed = neededForms(locale.code, plural.ordinal)
      if (forms.size === 0 || !code || !needed) continue

      const missing = needed.filter((category) => !forms.has(category))
      if (missing.length === 0) continue

      const entry = locale.entries.get([...forms.values()][0] as string)
      if (!entry) continue
      issues.push(
        issue(locale, plural.stem, entry, {
          severity: missing.includes('other') ? 'error' : 'warning',
          message: `\`${plural.stem}\`: ${languageName(code)} uses ${needed.join(', ')}. Missing: ${missing.map((category) => `\`${keyFor(plural, category)}\``).join(', ')}`,
          baseValue:
            locale === base
              ? undefined
              : base.entries.get(keyFor(plural, 'other'))?.value
        })
      )
    }
  }

  return issues
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
