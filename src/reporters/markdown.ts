import { stringify as toYaml } from 'yaml'
import { namespaceOf } from '../core/checks/context.js'
import { showKey } from '../core/key-label.js'
import { replaceLocale } from '../core/locale-code.js'
import { PLURAL_CATEGORIES } from '../core/plural-rules.js'
import type { CheckId, Issue, Locale, Project } from '../core/types.js'

export const MARKER = '<!-- locale-guard -->'

export interface ReportInput {
  issues: Issue[]
  project: Project
  hasBaseline: boolean
  link?: (file: string, line?: number) => string | undefined
  // Issues past it point to the job summary
  maxLength?: number
  summaryUrl?: string
  // list: collapsed, open: listed open, counts: one row per locale and check
  existing?: 'list' | 'open' | 'counts'
  // What new issues are new against, when it is not a pull request
  compared?: { label: string; clean: string }
}

const PULL_REQUEST = {
  label: 'New in this PR',
  clean: 'This pull request adds no new translation issues.'
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
const PLURAL_SUFFIX = new RegExp(
  `([_.])(ordinal_)?(?:${PLURAL_CATEGORIES.filter((c) => c !== 'other').join('|')})$`
)
const RESERVED = 400

export function renderReport(input: ReportInput): string {
  const fresh = input.issues.filter((issue) => issue.isNew)
  const existing = input.issues.filter((issue) => !issue.isNew)
  const limit = (input.maxLength ?? Infinity) - RESERVED

  const compared = input.compared ?? PULL_REQUEST
  let body = `${MARKER}\n${title(fresh, existing, compared.clean)}\n`
  if (input.hasBaseline && input.issues.length > 0) {
    const where = input.existing === 'open' ? 'listed below' : 'collapsed below'
    body += `\n${compared.label}: ${fresh.length} · Already existing: ${existing.length}${existing.length ? ` (${where})` : ''}\n`
  }

  const groups = mergeMissingKeys(groupIssues(fresh))
  const listed = fill(groups, input, '###', limit - body.length)
  body += listed.text
  let omitted = listed.omitted

  if (existing.length > 0 && input.existing === 'counts') {
    body += `\n${existingCounts(existing, input.summaryUrl)}`
  } else if (existing.length > 0) {
    const open = input.existing === 'open' ? ' open' : ''
    const details = `\n<details${open}><summary>${count(existing.length, 'existing issue', 'existing issues')}</summary>\n`
    const room = listed.omitted ? 0 : limit - body.length - details.length
    const old = fill(groupIssues(existing), input, '####', room)
    body += `${details}${old.text}\n</details>\n`
    omitted += old.omitted
  }

  if (omitted > 0) {
    // Without a summary link, this is the job summary itself
    const rest = input.summaryUrl
      ? `, see the [job summary](${input.summaryUrl})`
      : ' not shown, because this page reached its size limit. To list every issue, run `npx locale-guard-cli --all --output locale-guard-report.md` on your machine'
    body += `\n…and ${count(omitted, 'more issue', 'more issues')}${rest}.\n`
  }
  return body
}

// In order, so errors come first. The first section that does not fit shows the
// rows that do, without its copy-paste block, and the rest is left out
function fill(
  groups: Group[],
  input: ReportInput,
  heading: string,
  room: number
): { text: string; omitted: number } {
  let text = ''
  let omitted = 0
  let full = false
  for (const group of groups) {
    if (full) {
      omitted += group.issues.length
      continue
    }
    const section = renderGroup(group, input, heading)
    const whole = `\n${section.head}${section.rows.map((row) => row.text).join('')}${section.tail}`
    if (text.length + whole.length <= room) {
      text += whole
      continue
    }
    full = true
    const note = section.tail ? copyPasteNote(input.summaryUrl) : ''
    let part = `\n${section.head}`
    let shown = 0
    for (const row of section.rows) {
      if (text.length + part.length + row.text.length + note.length > room)
        break
      part += row.text
      shown += row.issues
    }
    if (shown > 0) text += part + note
    omitted += group.issues.length - shown
  }
  return { text, omitted }
}

function copyPasteNote(summaryUrl?: string): string {
  return summaryUrl
    ? `\n📋 The copy-paste block is in the [job summary](${summaryUrl}).\n`
    : '\n📋 The copy-paste block did not fit on this page.\n'
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

function title(fresh: Issue[], existing: Issue[], clean: string): string {
  if (fresh.length === 0 && existing.length === 0) {
    return '## 🌐 Locale Guard\n\n✅ All translations are in sync.'
  }
  if (fresh.length === 0) {
    return `## 🌐 Locale Guard\n\n✅ ${clean}`
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
  // Several when the same keys are missing in more than one locale
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

// Locales that miss exactly the same keys share one section
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
      for (const issue of group.issues) same.issues.push(issue)
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

// A cut section keeps its first rows and drops the copy-paste tail
interface Section {
  head: string
  rows: { text: string; issues: number }[]
  tail: string
}

function renderGroup(
  group: Group,
  input: ReportInput,
  heading: string
): Section {
  if (group.locales.length > 1)
    return renderSharedMissingKeys(group, input, heading)

  const icon = group.severity === 'error' ? '❌' : '⚠️'
  const [singular, plural] = LABELS[group.check]
  let head = `${heading} ${icon} ${group.locale}: ${count(group.issues.length, singular, plural)}\n\n`

  if (group.check === 'missing-keys') {
    head += `| Key | ${input.project.baseLocale} |\n|---|---|\n`
    return {
      head,
      rows: group.issues.map((issue) => ({
        text: `| ${missingKeyLink(issue, input)} | ${cell(issue.baseValue ?? '')} |\n`,
        issues: 1
      })),
      tail: copyPaste(group.issues, input.project)
    }
  }

  const rows = group.issues.map((issue) => {
    const where = location(issue, input)
    const hint = issue.hint ? `. ${issue.hint}` : ''
    let text = `- ${issue.message}${hint}${where ? ` · ${where}` : ''}\n`
    if (issue.details?.length) {
      const lines = issue.details.map((line) => `  - ${cell(line)}`)
      text += `  <details><summary>${count(issue.details.length, 'key', 'keys')}</summary>\n\n${lines.join('\n')}\n\n  </details>\n`
    }
    return { text, issues: 1 }
  })
  return { head, rows, tail: '' }
}

// Links point to the base file. A row stands for its key in every locale
function renderSharedMissingKeys(
  group: Group,
  input: ReportInput,
  heading: string
): Section {
  const { project } = input
  const base = project.locales.get(project.baseLocale)
  const first = group.issues.filter((issue) => issue.locale === group.locale)
  const locales = group.locales.map((code) => `\`${code}\``).join(', ')

  let head = `${heading} ❌ ${group.locales.length} locales: ${count(first.length, 'missing key', 'missing keys')}\n\n`
  head += `Missing in ${locales}.\n\n`
  head += `| Key | ${project.baseLocale} |\n|---|---|\n`
  const rows = first.map((issue) => {
    const entry = base?.entries.get(issue.key)
    const url = entry ? input.link?.(entry.file, entry.line) : undefined
    const key = showKey(issue.key)
    return {
      text: `| ${url ? `[${key}](${url})` : key} | ${cell(issue.baseValue ?? '')} |\n`,
      issues: group.locales.length
    }
  })

  let tail = ''
  for (const [file, fileIssues] of byFile(first)) {
    const under = rootKey(project, group.locale, file)
      ? ', under each locale key'
      : ''
    tail += copyPasteBlock(
      `Copy-paste for ${withLocalePlaceholder(file, group.locale)} (the same in each locale${under})`,
      file,
      fileIssues,
      project,
      false
    )
  }
  return { head, rows, tail }
}

// `locales/ar/common.json` -> `locales/{locale}/common.json`, `main-ar.json` -> `main-{locale}.json`
function withLocalePlaceholder(path: string, locale: string): string {
  return replaceLocale(path, locale, '{locale}')
}

function location(issue: Issue, input: ReportInput): string {
  const name = issue.file.split('/').pop() ?? issue.file
  const label = issue.line ? `${name}:${issue.line}` : name
  const url = input.link?.(issue.file, issue.line)
  return url ? `[${label}](${url})` : label
}

// Links to the parent object in the locale file, or to the base key when it has none
function missingKeyLink(issue: Issue, input: ReportInput): string {
  const { project } = input
  const label = showKey(issue.key)
  const target = project.locales.get(issue.locale)
  const inTarget =
    target?.files.some((file) => file.path === issue.file) &&
    hasParent(target, issue.key)
  const base = project.locales.get(project.baseLocale)
  const entry = inTarget ? undefined : baseEntryOf(base, issue.key)
  const url = entry
    ? input.link?.(entry.file, entry.line)
    : input.link?.(issue.file, issue.line)
  return url ? `[${label}](${url})` : label
}

// Only parents inside the key's namespace count
function hasParent(locale: Locale, key: string): boolean {
  const namespace = namespaceOf(locale, key)
  const parts = key.split('.')
  for (let length = parts.length - 1; length > 0; length--) {
    const parent = parts.slice(0, length).join('.')
    if (parent.length <= namespace.length) return false
    if (locale.nodes.has(parent)) return true
  }
  return false
}

// Falls back to the `other` form for a plural form the base lacks
function baseEntryOf(base: Locale | undefined, key: string) {
  return (
    base?.entries.get(key) ??
    base?.entries.get(key.replace(PLURAL_SUFFIX, '$1$2other'))
  )
}

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
  project: Project,
  wrap = true
): string {
  const base = project.locales.get(project.baseLocale)
  const root = wrap
    ? rootKey(project, issues[0]?.locale ?? '', file)
    : undefined
  const tree: Record<string, unknown> = {}
  for (const issue of issues) {
    const path = pathInFile(base, issue.key)
    setPath(tree, root ? [root, ...path] : path, '')
  }
  const yaml = /\.ya?ml$/i.test(file)
  const code = yaml ? toYaml(tree).trimEnd() : JSON.stringify(tree, null, 2)
  return `\n<details><summary>📋 ${summary}</summary>\n\n\`\`\`${yaml ? 'yaml' : 'json'}\n${code}\n\`\`\`\n</details>\n`
}

// The file's locale key, or the locale for a file not created yet when the base has one
function rootKey(
  project: Project,
  locale: string,
  file: string
): string | undefined {
  const own = project.locales
    .get(locale)
    ?.files.find((localeFile) => localeFile.path === file)
  if (own) return own.root
  const base = project.locales.get(project.baseLocale)
  return base?.files.some((baseFile) => baseFile.root) ? locale : undefined
}

// The key without its file's namespace
function keyInFile(base: Locale | undefined, key: string): string {
  const entry = base?.entries.get(key)
  if (entry) return entry.fileKey
  const namespace = base ? namespaceOf(base, key) : ''
  return namespace ? key.slice(namespace.length + 1) : key
}

// Segments as the base file writes them, so a flat file gets flat keys back
function pathInFile(base: Locale | undefined, key: string): string[] {
  const entry = base?.entries.get(key)
  if (entry) return entry.filePath
  const inFile = keyInFile(base, key)
  const namespace = key.slice(0, key.length - inFile.length)
  let best: string[] | undefined
  for (const other of base?.entries.values() ?? []) {
    if (
      other.key.slice(0, other.key.length - other.fileKey.length) !== namespace
    ) {
      continue
    }
    const parent = other.filePath.slice(0, -1)
    const prefix = parent.join('.')
    if (prefix && !inFile.startsWith(`${prefix}.`)) continue
    if (!best || parent.length > best.length) best = parent
  }
  if (!best) return inFile.split('.')
  const prefix = best.join('.')
  return [...best, prefix ? inFile.slice(prefix.length + 1) : inFile]
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
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>')
}

function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}
