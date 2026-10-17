import { wordCount } from '../formats/message.js'
import { showKey } from '../key-label.js'
import { languageOf } from '../locale-code.js'
import type { Entry, Issue, Locale } from '../types.js'
import { type Check, type CheckContext, baseEntryFor } from './context.js'

// Non-Latin scripts and their letters
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
// e.g. comments.xlsx, usually the same in every language
const FILE_NAME =
  /^[^\s/\\]+\.(?:csv|docx?|gif|jpe?g|json|pdf|png|pptx?|svg|txt|webp|xlsx?|xml|zip)$/i
// Skips date formats like "H:mm:ss"
const LONG_WORD = /[\p{L}\p{M}]{3,}/gu

// Close languages that often share whole sentences or characters
const RELATED_LANGUAGES = [
  ['zh', 'ja'],
  ['no', 'nb', 'nn', 'da'],
  ['es', 'ca', 'gl', 'pt', 'ast', 'it'],
  ['tr', 'az'],
  ['sr', 'hr', 'bs', 'sh', 'cnr'],
  ['cs', 'sk'],
  ['ms', 'id'],
  ['bg', 'mk'],
  ['ro', 'mo'],
  ['fa', 'prs'],
  ['nl', 'af']
]

const MIN_SHARED_VALUES = 2

// Same as the base, no letter of the locale's script, or copied between locales
export const untranslated: Check = (context) => [
  ...perValue(context),
  ...sharedValues(context)
]

const perValue: Check = (context) => {
  const { base, targets, describe, ignoreValues } = context
  const ignored = ignoredSet(ignoreValues)
  const baseLanguage = languageOf(base.code)
  const issues: Issue[] = []

  for (const target of targets) {
    const language = languageOf(target.code)
    const script = SCRIPTS[language]

    for (const [key, entry] of target.entries) {
      const baseEntry = baseEntryFor(context, key)
      const value = entry.value.trim()
      if (!baseEntry || !value || ignored.has(value.toLowerCase())) continue
      if (FILE_NAME.test(value)) continue

      const text = visibleText(describe, entry.value)
      if (text === undefined || !LETTER.test(text)) continue

      // Plurals count one branch: `ticket | tickets` is one word
      const shown =
        describe(entry.value).longestText?.replace(URL_OR_EMAIL, ' ') ?? text
      let message: string | undefined
      if (
        language !== baseLanguage &&
        value === baseEntry.value.trim() &&
        wordCount(shown) >= 2
      ) {
        message = `${showKey(key)}: same text as ${base.code}`
      } else if (script && !script.letters.test(text)) {
        message = `${showKey(key)}: no ${script.name} letters, looks untranslated`
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

// One issue per locale pair, without counts, so partial fixes keep it existing
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
        if (text !== undefined && wordCount(text, LONG_WORD) >= 2) {
          shared.push(key)
        }
      }
      const values = new Set(
        shared.map((key) => first.entries.get(key)?.value.trim())
      )
      if (values.size < MIN_SHARED_VALUES) continue

      const entry = first.entries.get(shared[0] as string) as Entry
      issues.push({
        check: 'untranslated',
        severity: 'warning',
        locale: first.code,
        file: entry.file,
        key: '',
        line: entry.line,
        column: entry.column,
        message: `${first.code} and ${second.code} have the same text in several keys, different from ${base.code}. One file may be copied from the other, or both may still have an older ${base.code} text`,
        details: shared.map(
          (key) => `${showKey(key)}: ${first.entries.get(key)?.value.trim()}`
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

// Undefined when the message is broken
function visibleText(
  describe: CheckContext['describe'],
  value: string
): string | undefined {
  const info = describe(value)
  return info.error ? undefined : info.text.replace(URL_OR_EMAIL, ' ')
}

function ignoredSet(values: string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLowerCase()))
}
