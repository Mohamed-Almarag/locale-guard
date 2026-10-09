import { type MessageInfo, createDescriber } from '../formats/index.js'
import type { Format, Issue, Locale, Position, Project } from '../types.js'

export interface CheckContext {
  project: Project
  format: Format
  base: Locale
  /** Every locale except the base one. */
  targets: Locale[]
  /** Parses a message in the project's format. Results are cached. */
  describe: (source: string) => MessageInfo
  /** Values that may stay identical to the base or in another script (brand names). */
  ignoreValues: string[]
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
    ignoreValues
  }
}

/** The language part of a locale code: `ar` for `ar-EG` or `ar_EG`. */
export function languageOf(code: string): string {
  return code.split(/[-_]/)[0]?.toLowerCase() ?? code
}

/** A locale code that Intl accepts (`pt_BR` becomes `pt-BR`), or undefined. */
export function intlLocale(code: string): string | undefined {
  const normalized = code.replace(/_/g, '-')
  try {
    return Intl.getCanonicalLocales(normalized)[0]
  } catch {
    return undefined
  }
}

/** The namespace a key belongs to in a locale: the longest file namespace that prefixes it. */
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

/**
 * The file a key should live in for a locale. Falls back to the base file's
 * path with the locale code swapped, for namespace files that do not exist yet.
 */
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

/** Where to point an annotation for a key that does not exist: its closest existing parent. */
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
