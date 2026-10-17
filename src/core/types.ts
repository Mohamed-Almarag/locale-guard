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

// One message, after flattening nested objects
export interface Entry extends Position {
  key: string
  value: string
  file: string
  // Differs from `key` in a namespace file
  fileKey: string
  // As written: `['cart', 'title']` nested, `['cart.title']` flat
  filePath: string[]
}

// An object key, where annotations for missing keys point
export interface Node extends Position {
  file: string
}

export interface LocaleFile {
  path: string
  // Prefix of every key in a namespace file, '' otherwise
  namespace: string
  // The locale key the file is wrapped in, as in Rails: `en:`
  root?: string
}

export interface Locale {
  code: string
  files: LocaleFile[]
  entries: Map<string, Entry>
  // Every key path, objects included
  nodes: Map<string, Node>
  // Unparsable namespaces, whose keys checks skip
  brokenNamespaces: Set<string>
}

export interface Project {
  baseLocale: string
  locales: Map<string, Locale>
  // Unparsable files; their locale loads without them
  parseErrors: Issue[]
  // Matched a pattern, but {locale} is not a locale code
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
  // Not in the baseline fingerprint, so it can change without making an issue new
  hint?: string
  baseValue?: string
  // Shown collapsed, e.g. every key of a grouped issue
  details?: string[]
  isNew: boolean
}
