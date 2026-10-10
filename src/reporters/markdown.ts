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
  /**
   * How to show issues that existed before the pull request: every issue (job
   * summary), or a count per locale and check (PR comment, which stays small
   * on projects with many old issues).
   */
  existing?: 'list' | 'counts'
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
  for (const group of mergeMissingKeys(groupIssues(fresh))) {
    const section = `\n${renderGroup(group, input, '###')}`
    if (body.length + section.length > limit) omitted += group.issues.length
    else body += section
  }

  if (existing.length > 0 && input.existing === 'counts') {
    body += `\n${existingCounts(existing, input.summaryUrl)}`
  } else if (existing.length > 0) {
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

function existingCounts(existing: Issue[], summaryUrl?: string): string {
  let table = '| Locale | Issue | Count |\n|---|---|---|\n'
  for (const group of groupIssues(existing)) {
    const icon = group.severity === 'error' ? '❌' : '⚠️'
    const [singular, plural] = LABELS[group.check]
    table += `| ${group.locale} | ${icon} ${group.issues.length === 1 ? singular : plural} | ${group.issues.length} |\n`
  }
  const where = summaryUrl
    ? `[job summary](${summaryUrl})`
    : 'job summary of this run'
  return `<details><summary>${count(existing.length, 'existing issue', 'existing issues')}</summary>\n\n${table}\nEvery issue is listed in the ${where}.\n</details>\n`
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
  /** More than one when the same keys are missing in several locales. */
  locales: string[]
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
      locales: [issue.locale],
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

/**
 * A new key added to the base locale is usually missing in every other locale
 * at once. Instead of repeating the same table for each locale, locales that
 * miss exactly the same keys share one section.
 */
function mergeMissingKeys(groups: Group[]): Group[] {
  const merged: Group[] = []
  const bySignature = new Map<string, Group>()
  for (const group of groups) {
    if (group.check !== 'missing-keys') {
      merged.push(group)
      continue
    }
    const signature = group.issues
      .map((issue) => issue.key)
      .sort()
      .join('\u0000')
    const same = bySignature.get(signature)
    if (same) {
      same.locales.push(group.locale)
      same.issues.push(...group.issues)
    } else {
      const copy = {
        ...group,
        locales: [group.locale],
        issues: [...group.issues]
      }
      bySignature.set(signature, copy)
      merged.push(copy)
    }
  }
  return merged
}

function renderGroup(
  group: Group,
  input: ReportInput,
  heading: string
): string {
  if (group.locales.length > 1)
    return renderSharedMissingKeys(group, input, heading)

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

/** One table for keys that are missing in several locales, linked to the base file. */
function renderSharedMissingKeys(
  group: Group,
  input: ReportInput,
  heading: string
): string {
  const { project } = input
  const base = project.locales.get(project.baseLocale)
  const first = group.issues.filter((issue) => issue.locale === group.locale)
  const locales = group.locales.map((code) => `\`${code}\``).join(', ')

  let out = `${heading} ❌ ${group.locales.length} locales: ${count(first.length, 'missing key', 'missing keys')}\n\n`
  out += `Missing in ${locales}.\n\n`
  out += `| Key | ${project.baseLocale} |\n|---|---|\n`
  for (const issue of first) {
    const entry = base?.entries.get(issue.key)
    const url = entry ? input.link?.(entry.file, entry.line) : undefined
    const key = `\`${issue.key}\``
    out += `| ${url ? `[${key}](${url})` : key} | ${cell(issue.baseValue ?? '')} |\n`
  }

  for (const [file, fileIssues] of byFile(first)) {
    out += copyPasteBlock(
      `Copy-paste for ${withLocalePlaceholder(file, group.locale)} (the same in each locale)`,
      file,
      fileIssues,
      project
    )
  }
  return out
}

/** `locales/ar/common.json` becomes `locales/{locale}/common.json`. */
function withLocalePlaceholder(path: string, locale: string): string {
  return path
    .split('/')
    .map((segment) =>
      segment === locale
        ? '{locale}'
        : segment.startsWith(`${locale}.`)
          ? `{locale}${segment.slice(locale.length)}`
          : segment
    )
    .join('/')
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
  let out = ''
  for (const [file, fileIssues] of byFile(issues)) {
    out += copyPasteBlock(`Copy-paste for ${file}`, file, fileIssues, project)
  }
  return out
}

function copyPasteBlock(
  summary: string,
  file: string,
  issues: Issue[],
  project: Project
): string {
  const base = project.locales.get(project.baseLocale)
  const tree: Record<string, unknown> = {}
  for (const issue of issues) {
    const fileKey = base?.entries.get(issue.key)?.fileKey ?? issue.key
    setPath(tree, fileKey.split('.'), '')
  }
  const yaml = /\.ya?ml$/i.test(file)
  const code = yaml ? toYaml(tree).trimEnd() : JSON.stringify(tree, null, 2)
  return `\n<details><summary>📋 ${summary}</summary>\n\n\`\`\`${yaml ? 'yaml' : 'json'}\n${code}\n\`\`\`\n</details>\n`
}

function byFile(issues: Issue[]): Map<string, Issue[]> {
  const files = new Map<string, Issue[]>()
  for (const issue of issues) {
    files.set(issue.file, [...(files.get(issue.file) ?? []), issue])
  }
  return files
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
