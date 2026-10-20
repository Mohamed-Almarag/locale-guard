import type { AnalyzeOptions } from '../analyze.js'
import { type MessageInfo, createDescriber } from '../formats/index.js'
import type {
  Entry,
  Format,
  Issue,
  Locale,
  Position,
  Project
} from '../types.js'
import { replaceLocale } from '../locale-code.js'
import { SuffixPlurals, baseKeyFor } from './suffix-plurals.js'

export interface CheckContext {
  project: Project
  format: Format
  base: Locale
  // Every locale except the base
  targets: Locale[]
  // Cached per message
  describe: (source: string) => MessageInfo
  ignoreValues: string[]
  keysAsText: boolean
  // Plain JSON only: i18next `items_one`, `items_other`
  plurals?: SuffixPlurals
}

export type Check = (context: CheckContext) => Issue[]

export function createContext(
  project: Project,
  {
    format,
    ignoreValues = [],
    ignoreTags = false,
    keysAsText = false
  }: Pick<
    AnalyzeOptions,
    'format' | 'ignoreValues' | 'ignoreTags' | 'keysAsText'
  >
): CheckContext | undefined {
  const loaded = project.locales.get(project.baseLocale)
  if (!loaded) return undefined
  const plurals = format === 'json' ? new SuffixPlurals(loaded) : undefined
  const base = keysAsText ? withKeysAsText(loaded, plurals) : loaded
  const targets = [...project.locales.values()].filter(
    (locale) => locale.code !== base.code
  )
  return {
    project,
    format,
    base,
    targets,
    describe: createDescriber(format, { ignoreTags }),
    ignoreValues,
    keysAsText,
    plurals
  }
}

// An empty base value means the key is the text: { "Save": "" }
function withKeysAsText(locale: Locale, plurals?: SuffixPlurals): Locale {
  const entries = new Map<string, Entry>()
  for (const [key, entry] of locale.entries) {
    if (entry.value.trim() !== '') {
      entries.set(key, entry)
      continue
    }
    const text = entry.filePath.at(-1) ?? key
    // i18next shows `{{count}} files` for an empty `{{count}} files_one`
    const plural = plurals?.of(key)
    const suffix = plural ? key.length - plural.stem.length : 0
    entries.set(key, { ...entry, value: text.slice(0, text.length - suffix) })
  }
  return { ...locale, entries }
}

// The same key, or the base `other` form for a plural form the base lacks
export function baseEntryFor(
  { base, plurals }: CheckContext,
  key: string
): Entry | undefined {
  const same = base.entries.get(key)
  if (same) return same
  const plural = plurals?.of(key)
  return plural ? base.entries.get(baseKeyFor(base, plural)) : undefined
}

// The longest file namespace that prefixes the key
export function namespaceOf(locale: Locale, key: string): string {
  let best = ''
  for (const { namespace } of locale.files) {
    if (
      namespace &&
      namespace.length > best.length &&
      (key === namespace || key.startsWith(`${namespace}.`))
    ) {
      best = namespace
    }
  }
  return best
}

export function isBroken(locale: Locale, key: string): boolean {
  return locale.brokenNamespaces.has(namespaceOf(locale, key))
}

// Falls back to the base file's path with the locale swapped, for files not created yet
export function expectedFile(
  target: Locale,
  base: Locale,
  key: string
): string {
  // The base key's own file, e.g. Rails devise.en.yml -> devise.ar.yml
  const own = base.entries.get(key)?.file
  const mirror = own && replaceLocale(own, base.code, target.code)
  if (mirror && target.files.some((file) => file.path === mirror)) return mirror
  // A Rails file the locale does not have yet: devise.ar.yml, to create
  const rails = base.files.some((file) => file.path === own && file.root)
  if (mirror && rails && mirror !== own) return mirror

  const namespace = namespaceOf(base, key)
  const existing = target.files.find((file) => file.namespace === namespace)
  if (existing) return existing.path
  const baseFile = base.files.find((file) => file.namespace === namespace)
  return baseFile
    ? replaceLocale(baseFile.path, base.code, target.code)
    : (target.files[0]?.path ?? '')
}

// The closest existing parent of a missing key
export function anchorFor(locale: Locale, key: string): Position {
  const parts = key.split('.')
  for (let length = parts.length - 1; length > 0; length--) {
    const node = locale.nodes.get(parts.slice(0, length).join('.'))
    if (node) return { line: node.line, column: node.column }
  }
  return { line: 1, column: 1 }
}
