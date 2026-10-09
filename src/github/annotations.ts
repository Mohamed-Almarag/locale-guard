import * as core from '@actions/core'
import type { Issue } from '../core/types.js'

/**
 * GitHub shows at most 10 error and 10 warning annotations per step, so new
 * issues come first and the rest are counted in a single notice.
 */
export const ANNOTATIONS_PER_SEVERITY = 10

type Sink = Pick<typeof core, 'error' | 'warning' | 'notice'>

/** F11: marks issues on their line in the "Files changed" tab. */
export function annotate(
  issues: Issue[],
  baseLocale: string,
  sink: Sink = core
): void {
  const ordered = [
    ...issues.filter((issue) => issue.isNew),
    ...issues.filter((issue) => !issue.isNew)
  ]
  const errors = ordered.filter((issue) => issue.severity === 'error')
  const warnings = ordered.filter((issue) => issue.severity === 'warning')

  for (const issue of errors.slice(0, ANNOTATIONS_PER_SEVERITY)) {
    sink.error(message(issue, baseLocale), properties(issue))
  }
  for (const issue of warnings.slice(0, ANNOTATIONS_PER_SEVERITY)) {
    sink.warning(message(issue, baseLocale), properties(issue))
  }

  const omitted =
    Math.max(0, errors.length - ANNOTATIONS_PER_SEVERITY) +
    Math.max(0, warnings.length - ANNOTATIONS_PER_SEVERITY)
  if (omitted > 0) {
    sink.notice(
      `${omitted} more translation issues are not annotated, because GitHub limits annotations per step. See the job summary for all of them.`,
      { title: 'Locale Guard' }
    )
  }
}

function message(issue: Issue, baseLocale: string): string {
  const plain = issue.message.replace(/`/g, '')
  return issue.baseValue !== undefined
    ? `${plain}\n${baseLocale}: ${issue.baseValue}`
    : plain
}

function properties(issue: Issue): core.AnnotationProperties {
  return {
    title: `Locale Guard: ${issue.check} (${issue.locale})`,
    file: issue.line ? issue.file : undefined,
    startLine: issue.line,
    startColumn: issue.column
  }
}
