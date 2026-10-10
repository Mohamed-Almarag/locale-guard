import type { PluralInfo } from '../formats/index.js'
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
 * vue-i18n: branch counts may legitimately differ with custom plural rules, so
 * only a single branch where the base has several is reported.
 */
export const pluralForms: Check = (context) => {
  if (context.format === 'next-intl') return icuPlurals(context)
  if (context.format === 'vue-i18n') return vuePlurals(context)
  return []
}

function icuPlurals({ base, targets, describe }: CheckContext): Issue[] {
  const issues: Issue[] = []

  for (const locale of [base, ...targets]) {
    const code = intlLocale(locale.code)
    if (!code) continue

    for (const [key, entry] of locale.entries) {
      for (const plural of describe(entry.value).plurals) {
        if (plural.kind !== 'icu') continue
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

function vuePlurals({ base, targets, describe }: CheckContext): Issue[] {
  const issues: Issue[] = []

  for (const target of targets) {
    for (const [key, entry] of target.entries) {
      const baseEntry = base.entries.get(key)
      if (!baseEntry || !entry.value.trim()) continue
      const expected = branches(describe(baseEntry.value).plurals)
      const actual = branches(describe(entry.value).plurals)
      if (expected <= 1 || actual > 1) continue

      issues.push(
        issue(target, key, entry, {
          severity: 'warning',
          message: `\`${key}\`: ${base.code} has ${expected} plural forms separated by \`|\`, ${target.code} has 1`,
          baseValue: baseEntry.value
        })
      )
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

function branches(plurals: PluralInfo[]): number {
  const vue = plurals.find((plural) => plural.kind === 'vue')
  return vue?.kind === 'vue' ? vue.branches : 1
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
