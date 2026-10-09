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

/** Loads in-memory files and returns the issues of a single check. */
export async function run(
  check: CheckId,
  files: Record<string, string>,
  options: { patterns?: string[]; baseLocale?: string; format?: Format } = {}
): Promise<Issue[]> {
  const project = await load(files, options)
  return analyze(project, { format: options.format ?? 'json' }).filter(
    (issue) => issue.check === check
  )
}

/** A compact view of issues that keeps tests readable. */
export function summarize(issues: Issue[]): string[] {
  return issues.map(
    (issue) =>
      `${issue.locale} ${issue.key || issue.file}${issue.line ? `:${issue.line}` : ''} ${issue.message}`
  )
}
