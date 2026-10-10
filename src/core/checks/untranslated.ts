import type { Issue } from '../types.js'
import { languageOf } from '../locale-code.js'
import type { Check } from './context.js'

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
 * F7: text that was probably never translated.
 *  - identical to the base value, with at least two words (skipped between
 *    variants of one language, e.g. en and en-GB)
 *  - for non-Latin languages, no letter of that language's script at all
 *
 * Single words are left out of the identical rule: on a real project most of
 * them were brands or words that are the same in both languages ("Total",
 * "Chat", "Premium"). Brand names in non-Latin locales belong in `ignore-values`.
 */
export const untranslated: Check = ({
  base,
  targets,
  describe,
  ignoreValues
}) => {
  const ignored = new Set(
    ignoreValues.map((value) => value.trim().toLowerCase())
  )
  const baseLanguage = languageOf(base.code)
  const issues: Issue[] = []

  for (const target of targets) {
    const language = languageOf(target.code)
    const script = SCRIPTS[language]

    for (const [key, entry] of target.entries) {
      const baseEntry = base.entries.get(key)
      const value = entry.value.trim()
      if (!baseEntry || !value || ignored.has(value.toLowerCase())) continue

      const info = describe(entry.value)
      if (info.error) continue
      const text = info.text.replace(URL_OR_EMAIL, ' ')
      if (!LETTER.test(text)) continue

      let message: string | undefined
      if (
        language !== baseLanguage &&
        value === baseEntry.value.trim() &&
        (text.match(WORD)?.length ?? 0) >= 2
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
