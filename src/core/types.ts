export type Format = 'vue-i18n' | 'next-intl' | 'json'

export type Severity = 'error' | 'warning'

export type CheckId =
  | 'parse-error'
  | 'missing-keys'
  | 'extra-keys'
  | 'empty-values'
  | 'invalid-syntax'
  | 'placeholder-mismatch'
  | 'broken-linked-messages'
  | 'untranslated'
  | 'plural-forms'

export interface Position {
  line: number
  column: number
}

/** A single translated message, after flattening nested objects. */
export interface Entry extends Position {
  key: string
  value: string
  file: string
  /** Key inside its file. Differs from `key` when the file is a namespace. */
  fileKey: string
}

/** Where an object (non-leaf) key starts, used to place annotations for missing keys. */
export interface Node extends Position {
  file: string
}

export interface LocaleFile {
  path: string
  /** Prefix added to every key in this file (namespace files), or '' for single-file locales. */
  namespace: string
}

export interface Locale {
  code: string
  files: LocaleFile[]
  entries: Map<string, Entry>
  /** Every key path that exists in the source, including objects. */
  nodes: Map<string, Node>
  /** Namespaces whose file could not be parsed. Checks skip their keys. */
  brokenNamespaces: Set<string>
}

export interface Project {
  baseLocale: string
  locales: Map<string, Locale>
  /** Files that could not be parsed. Their locale is loaded without them. */
  parseErrors: Issue[]
  /** Files that match a pattern but whose {locale} part is not a locale code. */
  skipped: string[]
}

export interface Issue {
  check: CheckId
  severity: Severity
  locale: string
  file: string
  key: string
  line?: number
  column?: number
  message: string
  baseValue?: string
  /** Extra lines shown collapsed under the issue, e.g. every key of a grouped issue. */
  details?: string[]
  isNew: boolean
}
