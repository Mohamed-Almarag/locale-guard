import { checks } from './checks/index.js'
import { createContext } from './checks/context.js'
import type { CheckId, Format, Issue, Project } from './types.js'

export interface AnalyzeOptions {
  format: Format
  disabledChecks?: CheckId[]
}

/** Runs every enabled check on a loaded project. Never touches files or GitHub. */
export function analyze(project: Project, options: AnalyzeOptions): Issue[] {
  const context = createContext(project, options.format)
  if (!context) return sortIssues(project.parseErrors)

  const disabled = new Set(options.disabledChecks ?? [])
  const issues = [...project.parseErrors]
  for (const [id, check] of Object.entries(checks)) {
    if (!disabled.has(id as CheckId)) issues.push(...check(context))
  }
  return sortIssues(issues)
}

/** Errors first, then by locale, file and line. */
export function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.locale.localeCompare(b.locale) ||
      a.file.localeCompare(b.file) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      a.key.localeCompare(b.key)
  )
}

function rank(issue: Issue): number {
  return issue.severity === 'error' ? 0 : 1
}
