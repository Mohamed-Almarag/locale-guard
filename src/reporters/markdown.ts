import { stringify as toYaml } from 'yaml'
import type { CheckId, Issue, Project } from '../core/types.js'

/** Hidden marker that identifies the Locale Guard comment on a pull request. */
export const MARKER = '<!-- locale-guard -->'

export interface ReportInput {
  issues: Issue[]
  project: Project
  /** Whether issues were split into new and existing (F9). */
  hasBaseline: boolean
  /** Builds a link to a line in the repo, when one is available. */
  link?: (file: string, line?: number) => string | undefined
  /** Longest allowed output. Issues past it are replaced by a pointer to the job summary. */
  maxLength?: number
  summaryUrl?: string
}

const LABELS: Record<CheckId, [singular: string, plural: string]> = {
  'parse-error': ['file could not be parsed', 'files could not be parsed'],
  'missing-keys': ['missing key', 'missing keys'],
  'extra-keys': ['extra key', 'extra keys'],
  'empty-values': ['empty value', 'empty values'],
  'invalid-syntax': ['invalid message', 'invalid messages'],
  'placeholder-mismatch': ['placeholder mismatch', 'placeholder mismatches'],
  'broken-linked-messages': ['broken linked message', 'broken linked messages'],
  untranslated: ['untranslated value', 'untranslated values'],
  'plural-forms': ['missing plural form', 'missing plural forms']
}

const CHECK_ORDER = Object.keys(LABELS) as CheckId[]
const RESERVED = 400

export function renderReport(input: ReportInput): string {
  const fresh = input.issues.filter((issue) => issue.isNew)
  const existing = input.issues.filter((issue) => !issue.isNew)
  const limit = (input.maxLength ?? Infinity) - RESERVED

  let body = `${MARKER}\n${title(fresh, existing)}\n`
  if (input.hasBaseline && input.issues.length > 0) {
    body += `\nNew in this PR: ${fresh.length} · Already existing: ${existing.length}${existing.length ? ' (collapsed below)' : ''}\n`
  }

  let omitted = 0
  for (const group of groupIssues(fresh)) {
    const section = `\n${renderGroup(group, input, '###')}`
    if (body.length + section.length > limit) omitted += group.issues.length
    else body += section
  }

  if (existing.length > 0) {
    let details = `\n<details><summary>${count(existing.length, 'existing issue', 'existing issues')}</summary>\n`
    for (const group of groupIssues(existing)) {
      const section = `\n${renderGroup(group, input, '####')}`
      if (body.length + details.length + section.length > limit) {
        omitted += group.issues.length
      } else details += section
    }
    body += `${details}\n</details>\n`
  }

  if (omitted > 0) {
    const where = input.summaryUrl
      ? `[job summary](${input.summaryUrl})`
      : 'job summary'
    body += `\n…and ${count(omitted, 'more issue', 'more issues')}, see the ${where}.\n`
  }
  return body
}

function title(fresh: Issue[], existing: Issue[]): string {
  if (fresh.length === 0 && existing.length === 0) {
    return '## 🌐 Locale Guard\n\n✅ All translations are in sync.'
  }
  if (fresh.length === 0) {
    return '## 🌐 Locale Guard\n\n✅ This pull request adds no new translation issues.'
  }
  const errors = fresh.filter((issue) => issue.severity === 'error').length
  const warnings = fresh.length - errors
  const parts = [
    errors ? count(errors, 'error', 'errors') : '',
    warnings ? count(warnings, 'warning', 'warnings') : ''
  ].filter(Boolean)
  return `## 🌐 Locale Guard: ${parts.join(', ')}`
}

interface Group {
  severity: Issue['severity']
  locale: string
  check: CheckId
  issues: Issue[]
}

function groupIssues(issues: Issue[]): Group[] {
  const groups = new Map<string, Group>()
  for (const issue of issues) {
    const id = `${issue.severity}|${issue.locale}|${issue.check}`
    const group = groups.get(id) ?? {
      severity: issue.severity,
      locale: issue.locale,
      check: issue.check,
      issues: []
    }
    group.issues.push(issue)
    groups.set(id, group)
  }
  return [...groups.values()].sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1) ||
      a.locale.localeCompare(b.locale) ||
      CHECK_ORDER.indexOf(a.check) - CHECK_ORDER.indexOf(b.check)
  )
}

function renderGroup(
  group: Group,
  input: ReportInput,
  heading: string
): string {
  const icon = group.severity === 'error' ? '❌' : '⚠️'
  const [singular, plural] = LABELS[group.check]
  let out = `${heading} ${icon} ${group.locale}: ${count(group.issues.length, singular, plural)}\n\n`

  if (group.check === 'missing-keys') {
    out += `| Key | ${input.project.baseLocale} |\n|---|---|\n`
    for (const issue of group.issues) {
      out += `| ${linked(`\`${issue.key}\``, issue, input)} | ${cell(issue.baseValue ?? '')} |\n`
    }
    out += copyPaste(group.issues, input.project)
  } else {
    for (const issue of group.issues) {
      const where = location(issue, input)
      out += `- ${issue.message}${where ? ` · ${where}` : ''}\n`
    }
  }
  return out
}

function location(issue: Issue, input: ReportInput): string {
  const name = issue.file.split('/').pop() ?? issue.file
  const label = issue.line ? `${name}:${issue.line}` : name
  const url = input.link?.(issue.file, issue.line)
  return url ? `[${label}](${url})` : label
}

function linked(text: string, issue: Issue, input: ReportInput): string {
  const url = input.link?.(issue.file, issue.line)
  return url ? `[${text}](${url})` : text
}

/** Ready-to-paste nested object with the missing keys and empty values, one block per file. */
function copyPaste(issues: Issue[], project: Project): string {
  const base = project.locales.get(project.baseLocale)
  const byFile = new Map<string, Issue[]>()
  for (const issue of issues) {
    byFile.set(issue.file, [...(byFile.get(issue.file) ?? []), issue])
  }

  let out = ''
  for (const [file, fileIssues] of byFile) {
    const tree: Record<string, unknown> = {}
    for (const issue of fileIssues) {
      const fileKey = base?.entries.get(issue.key)?.fileKey ?? issue.key
      setPath(tree, fileKey.split('.'), '')
    }
    const yaml = /\.ya?ml$/i.test(file)
    const code = yaml ? toYaml(tree).trimEnd() : JSON.stringify(tree, null, 2)
    out += `\n<details><summary>📋 Copy-paste for ${file}</summary>\n\n\`\`\`${yaml ? 'yaml' : 'json'}\n${code}\n\`\`\`\n</details>\n`
  }
  return out
}

function setPath(tree: Record<string, unknown>, path: string[], value: string) {
  let node = tree
  path.forEach((part, index) => {
    if (index === path.length - 1) {
      node[part] = value
      return
    }
    const next = node[part]
    if (typeof next !== 'object' || next === null) node[part] = {}
    node = node[part] as Record<string, unknown>
  })
}

function cell(value: string): string {
  const short = value.length > 150 ? `${value.slice(0, 147)}...` : value
  return short
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>')
}

function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}
