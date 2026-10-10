import { languageOf } from '../locale-code.js'
import type { Entry, Issue, Locale } from '../types.js'
import type { Check, CheckContext } from './context.js'

/** Languages written in a script other than Latin, with the letters of that script. */
const SCRIPTS: Record<string, { name: string; letters: RegExp }> = {
  ar: { name: 'Arabic', letters: /\p{Script=Arabic}/u },
  fa: { name: 'Persian', letters: /\p{Script=Arabic}/u },
  ur: { name: 'Urdu', letters: /\p{Script=Arabic}/u },
  ps: { name: 'Pashto', letters: /\p{Script=Arabic}/u },
  ckb: { name: 'Kurdish', letters: /\p{Script=Arabic}/u },
  he: { name: 'Hebrew', letters: /\p{Script=Hebrew}/u },
  yi: { name: 'Yiddish', letters: /\p{Script=Hebrew}/u },
  ru: { name: 'Cyrillic', letters: /\p{Script=Cyrillic}/u },
  uk: { name: 'Cyrillic', letters: /\p{Script=Cyrillic}/u },
  bg: { name: 'Cyrillic', letters: /\p{Script=Cyrillic}/u },
  be: { name: 'Cyrillic', letters: /\p{Script=Cyrillic}/u },
  mk: { name: 'Cyrillic', letters: /\p{Script=Cyrillic}/u },
  kk: { name: 'Cyrillic', letters: /\p{Script=Cyrillic}/u },
  el: { name: 'Greek', letters: /\p{Script=Greek}/u },
  hi: { name: 'Devanagari', letters: /\p{Script=Devanagari}/u },
  mr: { name: 'Devanagari', letters: /\p{Script=Devanagari}/u },
  ne: { name: 'Devanagari', letters: /\p{Script=Devanagari}/u },
  bn: { name: 'Bengali', letters: /\p{Script=Bengali}/u },
  th: { name: 'Thai', letters: /\p{Script=Thai}/u },
  ka: { name: 'Georgian', letters: /\p{Script=Georgian}/u },
  hy: { name: 'Armenian', letters: /\p{Script=Armenian}/u },
  ko: { name: 'Korean', letters: /\p{Script=Hangul}/u },
  ja: {
    name: 'Japanese',
    letters: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u
  },
  zh: { name: 'Chinese', letters: /\p{Script=Han}/u }
}

const URL_OR_EMAIL = /\b(?:https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w-]+\.[\w.-]+)/g
const LETTER = /\p{L}/u
const WORD = /\p{L}+/gu

/**
 * Languages close enough that whole sentences are often written the same way
 * ("Generar Factura" in Spanish and Catalan). Values shared inside a group are
 * not reported by the cross-locale rule.
 */
const RELATED_LANGUAGES = [
  ['no', 'nb', 'nn', 'da'],
  ['es', 'ca', 'gl', 'pt', 'ast'],
  ['tr', 'az'],
  ['sr', 'hr', 'bs', 'sh', 'cnr'],
  ['cs', 'sk'],
  ['ms', 'id'],
  ['bg', 'mk'],
  ['ro', 'mo'],
  ['fa', 'prs'],
  ['nl', 'af']
]

/** A pair of locales must share at least this many values to be reported. */
const MIN_SHARED_VALUES = 2

/**
 * F7: text that was probably never translated.
 *  - identical to the base value, with at least two words (skipped between
 *    variants of one language, e.g. en and en-GB)
 *  - for non-Latin languages, no letter of that language's script at all
 *  - identical in two other locales, e.g. Turkish text pasted into the
 *    French file (see `sharedValues`)
 *
 * Single words are left out of the identical rules: on a real project most of
 * them were brands or words that are the same in both languages ("Total",
 * "Chat", "Premium"). Brand names in non-Latin locales belong in `ignore-values`.
 */
export const untranslated: Check = (context) => [
  ...perValue(context),
  ...sharedValues(context)
]

const perValue: Check = ({ base, targets, describe, ignoreValues }) => {
  const ignored = ignoredSet(ignoreValues)
  const baseLanguage = languageOf(base.code)
  const issues: Issue[] = []

  for (const target of targets) {
    const language = languageOf(target.code)
    const script = SCRIPTS[language]

    for (const [key, entry] of target.entries) {
      const baseEntry = base.entries.get(key)
      const value = entry.value.trim()
      if (!baseEntry || !value || ignored.has(value.toLowerCase())) continue

      const text = visibleText(describe, entry.value)
      if (text === undefined || !LETTER.test(text)) continue

      let message: string | undefined
      if (
        language !== baseLanguage &&
        value === baseEntry.value.trim() &&
        wordCount(text) >= 2
      ) {
        message = `\`${key}\`: same text as ${base.code}`
      } else if (script && !script.letters.test(text)) {
        message = `\`${key}\`: no ${script.name} letters, looks untranslated`
      }
      if (!message) continue

      issues.push({
        check: 'untranslated',
        severity: 'warning',
        locale: target.code,
        file: entry.file,
        key,
        line: entry.line,
        column: entry.column,
        message,
        baseValue: baseEntry.value,
        isNew: true
      })
    }
  }

  return issues
}

/**
 * Two locales of unrelated languages that hold the same text for the same keys,
 * while the base says something else: one file was copied into the other. A
 * real project had 22 Turkish values in its French file.
 *
 * One issue per pair of locales, with the keys as details, because it is one
 * mistake. It is attached to the first locale of the pair by name, since the
 * tool cannot tell which file is the wrong one.
 */
const sharedValues: Check = ({ base, targets, describe, ignoreValues }) => {
  const ignored = ignoredSet(ignoreValues)
  const issues: Issue[] = []
  const sorted = [...targets].sort((a, b) => a.code.localeCompare(b.code))

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const first = sorted[i] as Locale
      const second = sorted[j] as Locale
      if (related(first.code, second.code)) continue

      const shared: string[] = []
      for (const [key, entry] of first.entries) {
        const value = entry.value.trim()
        const baseValue = base.entries.get(key)?.value.trim()
        if (!value || baseValue === undefined || value === baseValue) continue
        if (second.entries.get(key)?.value.trim() !== value) continue
        if (ignored.has(value.toLowerCase())) continue
        const text = visibleText(describe, entry.value)
        if (text !== undefined && wordCount(text) >= 2) shared.push(key)
      }
      if (shared.length < MIN_SHARED_VALUES) continue

      const entry = first.entries.get(shared[0] as string) as Entry
      issues.push({
        check: 'untranslated',
        severity: 'warning',
        locale: first.code,
        file: entry.file,
        key: shared[0] as string,
        line: entry.line,
        column: entry.column,
        message: `${first.code} and ${second.code} have ${shared.length} identical values, so one file was probably copied into the other`,
        details: shared.map(
          (key) => `\`${key}\`: ${first.entries.get(key)?.value.trim()}`
        ),
        isNew: true
      })
    }
  }

  return issues
}

function related(a: string, b: string): boolean {
  const first = languageOf(a)
  const second = languageOf(b)
  return (
    first === second ||
    RELATED_LANGUAGES.some(
      (group) => group.includes(first) && group.includes(second)
    )
  )
}

/** The text a user reads, without placeholders, URLs or emails; undefined if the message is broken. */
function visibleText(
  describe: CheckContext['describe'],
  value: string
): string | undefined {
  const info = describe(value)
  return info.error ? undefined : info.text.replace(URL_OR_EMAIL, ' ')
}

function wordCount(text: string): number {
  return text.match(WORD)?.length ?? 0
}

function ignoredSet(values: string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLowerCase()))
}
