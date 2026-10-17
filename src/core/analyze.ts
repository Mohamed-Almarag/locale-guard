import picomatch from 'picomatch'
import { createContext } from './checks/context.js'
import { checks } from './checks/index.js'
import { PLURAL_CATEGORIES } from './plural-rules.js'
import type { CheckId, Format, Issue, Project } from './types.js'

export interface AnalyzeOptions {
  format: Format
  disabledChecks?: CheckId[]
  // Globs, e.g. `legacy.*`
  ignoreKeys?: string[]
  ignoreValues?: string[]
}

// Pure: never touches files or GitHub
export function analyze(project: Project, options: AnalyzeOptions): Issue[] {
  const disabled = new Set(options.disabledChecks ?? [])
  const issues = disabled.has('parse-error') ? [] : [...project.parseErrors]

  const context = createContext(project, options.format, options.ignoreValues)
  if (context) {
    for (const [id, check] of Object.entries(checks)) {
      if (disabled.has(id as CheckId)) continue
      // A spread overflows the stack past about 100k issues
      for (const issue of check(context)) issues.push(issue)
    }
  }

  const ignoreKeys = options.ignoreKeys?.length
    ? picomatch(options.ignoreKeys)
    : undefined
  return sortIssues(
    ignoreKeys
      ? issues.filter((issue) => !issue.key || !ignoreKeys(issue.key))
      : issues
  )
}

// Errors first, then by locale, file and line
export function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.locale.localeCompare(b.locale) ||
      a.file.localeCompare(b.file) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      compareKeys(a.key, b.key)
  )
}

const PLURAL_FORM = new RegExp(
  `^(.+[_.](?:ordinal_)?)(${PLURAL_CATEGORIES.join('|')})$`
)

// Alphabetical, but plural forms of one key keep CLDR order (zero … other)
function compareKeys(a: string, b: string): number {
  const pluralA = PLURAL_FORM.exec(a)
  const pluralB = PLURAL_FORM.exec(b)
  if (pluralA && pluralB && pluralA[1] === pluralB[1]) {
    return (
      PLURAL_CATEGORIES.indexOf(pluralA[2] as string) -
      PLURAL_CATEGORIES.indexOf(pluralB[2] as string)
    )
  }
  return a.localeCompare(b)
}

function rank(issue: Issue): number {
  return issue.severity === 'error' ? 0 : 1
}
