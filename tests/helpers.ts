import { analyze } from '../src/core/analyze.js'
import { loadProject, memoryFileSource } from '../src/core/loaders/index.js'
import type { CheckId, Format, Issue, Project } from '../src/core/types.js'

export function json(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export async function load(
  files: Record<string, string>,
  options: { patterns?: string[]; baseLocale?: string } = {}
): Promise<Project> {
  return loadProject(memoryFileSource(files), {
    patterns: options.patterns ?? ['locales/{locale}.json'],
    baseLocale: options.baseLocale ?? 'en'
  })
}

// Issues of a single check on in-memory files
export async function run(
  check: CheckId,
  files: Record<string, string>,
  options: {
    patterns?: string[]
    baseLocale?: string
    format?: Format
    ignoreTags?: boolean
  } = {}
): Promise<Issue[]> {
  const project = await load(files, options)
  return analyze(project, {
    format: options.format ?? 'json',
    ignoreTags: options.ignoreTags
  }).filter((issue) => issue.check === check)
}

// One line per issue
export function summarize(issues: Issue[]): string[] {
  return issues.map(
    (issue) =>
      `${issue.locale} ${issue.key || issue.file}${issue.line ? `:${issue.line}` : ''} ${issue.message}`
  )
}
