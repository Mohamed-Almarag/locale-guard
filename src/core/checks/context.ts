import { type MessageInfo, createDescriber } from '../formats/index.js'
import type {
  Entry,
  Format,
  Issue,
  Locale,
  Position,
  Project
} from '../types.js'
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
  // Plain JSON only: i18next `items_one`, `items_other`
  plurals?: SuffixPlurals
}

export type Check = (context: CheckContext) => Issue[]

export function createContext(
  project: Project,
  format: Format,
  ignoreValues: string[] = []
): CheckContext | undefined {
  const base = project.locales.get(project.baseLocale)
  if (!base) return undefined
  const targets = [...project.locales.values()].filter(
    (locale) => locale.code !== base.code
  )
  return {
    project,
    format,
    base,
    targets,
    describe: createDescriber(format),
    ignoreValues,
    plurals: format === 'json' ? new SuffixPlurals(base) : undefined
  }
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
  const namespace = namespaceOf(base, key)
  const existing = target.files.find((file) => file.namespace === namespace)
  if (existing) return existing.path
  const baseFile = base.files.find((file) => file.namespace === namespace)
  return baseFile
    ? swapLocale(baseFile.path, base.code, target.code)
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

function swapLocale(path: string, from: string, to: string): string {
  return path
    .split('/')
    .map((segment) =>
      segment === from
        ? to
        : segment.startsWith(`${from}.`)
          ? to + segment.slice(from.length)
          : segment
    )
    .join('/')
}
