import { showKey } from '../key-label.js'
import type { Issue } from '../types.js'
import { pluralLocale } from '../locale-code.js'
import { singleNumber } from '../plural-rules.js'
import { type Check, baseEntryFor } from './context.js'
import { keyFor } from './suffix-plurals.js'

// Linked messages are skipped: translators often write the text instead
export const placeholderMismatch: Check = (context) => {
  const { targets, describe, plurals } = context
  const issues: Issue[] = []

  for (const target of targets) {
    for (const [key, entry] of target.entries) {
      const baseEntry = baseEntryFor(context, key)
      if (!baseEntry || entry.value.trim() === '') continue

      const expected = describe(baseEntry.value)
      const actual = describe(entry.value)
      if (expected.error || actual.error) continue

      const form = plurals?.of(key)
      const comparable = (p: string) =>
        isComparable(p) && !(form && COUNT.has(p))
      const have = actual.placeholders.filter(comparable)
      let missing: string[]
      let unexpected: string[]
      if (form?.separator === '.') {
        // Rails: the count's name varies (`%{friendly_count}`), so a form may
        // drop it only when it covers one number, and may use any base form's
        const forms = [...plurals!.forms(context.base, form).values()].map(
          (formKey) => describe(context.base.entries.get(formKey)!.value)
        )
        if (forms.some((info) => info.error)) continue
        const anyForm = new Set(forms.flatMap((info) => info.placeholders))
        const other = context.base.entries.get(keyFor(form, 'other'))
        const code = pluralLocale(target.code)
        // Ruby I18n shows `zero` for 0 in every language. Without the
        // language's rules there is nothing to prove a number is needed
        const wordsAllowed =
          form.category === 'zero' ||
          (code ? singleNumber(code, form.category) : true)
        const want = wordsAllowed
          ? []
          : describe(other?.value ?? baseEntry.value).placeholders.filter(
              comparable
            )
        missing = want.filter((p) => !have.includes(p))
        unexpected = have.filter((p) => !anyForm.has(p))
      } else {
        const want = expected.placeholders.filter(comparable)
        missing = want.filter((p) => !have.includes(p))
        unexpected = have.filter((p) => !want.includes(p))
      }
      if (missing.length === 0 && unexpected.length === 0) continue

      const parts = [
        missing.length ? `missing ${list(missing)}` : '',
        unexpected.length ? `unexpected ${list(unexpected)}` : ''
      ].filter(Boolean)

      issues.push({
        check: 'placeholder-mismatch',
        severity: 'error',
        locale: target.code,
        file: entry.file,
        key,
        line: entry.line,
        column: entry.column,
        message: `${showKey(key)}: ${parts.join(', ')}`,
        baseValue: baseEntry.value,
        isNew: true
      })
    }
  }

  return issues
}

// A plural form may write the count out in words
const COUNT = new Set(['{{count}}', '{count}'])

function isComparable(placeholder: string): boolean {
  return !placeholder.startsWith('@:')
}

function list(placeholders: string[]): string {
  return placeholders.map((p) => `\`${p}\``).join(', ')
}
