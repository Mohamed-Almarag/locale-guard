import type { Issue } from '../core/types.js'

// util.styleText, or plain text in tests
export type Style = (format: string | string[], text: string) => string

export interface TerminalInput {
  issues: Issue[]
  hasBaseline: boolean
  // e.g. `since the last commit` or `compared with main`
  compared: string
  // Existing issues are listed too, as they can fail the run
  listExisting: boolean
  style: Style
}

export function renderTerminal(input: TerminalInput): string {
  const { issues, hasBaseline, style } = input
  const fresh = issues.filter((issue) => issue.isNew)
  const existing = issues.filter((issue) => !issue.isNew)
  const lines: string[] = []

  renderIssues(fresh, style, lines)
  if (existing.length > 0 && input.listExisting) {
    lines.push(style('bold', 'Existing issues'), '')
    renderIssues(existing, style, lines)
  }

  if (issues.length === 0) {
    lines.push(style('green', '✔ All translations are in sync.'))
  } else if (fresh.length === 0) {
    lines.push(style('green', `✔ No new translation issues ${input.compared}.`))
  } else {
    const errors = fresh.filter((issue) => issue.severity === 'error').length
    const counts = [
      errors ? count(errors, 'error', 'errors') : '',
      fresh.length - errors
        ? count(fresh.length - errors, 'warning', 'warnings')
        : ''
    ].filter(Boolean)
    const total = hasBaseline
      ? `${count(fresh.length, 'new issue', 'new issues')} (${counts.join(', ')}) ${input.compared}`
      : `${count(fresh.length, 'issue', 'issues')} (${counts.join(', ')})`
    lines.push(style(errors ? 'red' : 'yellow', `✖ ${total}`))
  }
  if (existing.length > 0 && !input.listExisting) {
    lines.push(
      style(
        'dim',
        `  ${count(existing.length, 'existing issue is', 'existing issues are')} not shown. --all lists every issue.`
      )
    )
  }
  return lines.join('\n')
}

// Grouped by file, as ESLint does. Appends: a spread overflows past 100k issues
function renderIssues(issues: Issue[], style: Style, lines: string[]): void {
  const files = new Map<string, Issue[]>()
  for (const issue of issues) {
    const group = files.get(issue.file)
    if (group) group.push(issue)
    else files.set(issue.file, [issue])
  }

  for (const [file, group] of files) {
    group.sort((a, b) => (a.line ?? 0) - (b.line ?? 0))
    const width = group.reduce(
      (max, issue) => Math.max(max, position(issue).length),
      0
    )
    lines.push(style('underline', file))
    for (const issue of group) {
      const severity =
        issue.severity === 'error'
          ? style('red', 'error  ')
          : style('yellow', 'warning')
      const text = [issue.message, issue.hint].filter(Boolean).join('. ')
      lines.push(
        `  ${style('dim', position(issue).padEnd(width))}  ${severity}  ${code(text, style)}  ${style('dim', issue.check)}`
      )
    }
    lines.push('')
  }
}

function position(issue: Issue): string {
  if (!issue.line) return ''
  return issue.column ? `${issue.line}:${issue.column}` : `${issue.line}`
}

// `key` in messages is Markdown for the pull request comment
function code(text: string, style: Style): string {
  return text.replace(/`([^`]*)`/g, (_, inner: string) => style('bold', inner))
}

function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}
