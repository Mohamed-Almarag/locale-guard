import * as core from '@actions/core'
import * as github from '@actions/github'
import { analyze } from './core/analyze.js'
import { type Config, parseConfig } from './core/config.js'
import { loadProject, localFileSource } from './core/loaders/index.js'
import { decide } from './core/policy.js'
import type { Issue } from './core/types.js'
import { annotate } from './github/annotations.js'
import { upsertComment } from './github/comment.js'
import {
  type Octokit,
  type RunContext,
  lineLinker,
  readRunContext
} from './github/context.js'
import { listChangedFiles, touchesLocales } from './github/files.js'
import { renderReport } from './reporters/markdown.js'
import { SUMMARY_LIMIT, writeSummary } from './reporters/summary.js'

/** GitHub rejects comments longer than 65,536 characters. */
const COMMENT_LIMIT = 65_000

const INPUTS = [
  'format',
  'base-locale',
  'files',
  'fail-on',
  'comment',
  'annotations'
] as const

export async function run(): Promise<void> {
  try {
    const parsed = parseConfig(
      Object.fromEntries(INPUTS.map((name) => [name, core.getInput(name)]))
    )
    if (!parsed.ok) {
      core.setFailed(
        ['Locale Guard settings are not valid:', ...parsed.errors].join('\n')
      )
      return
    }
    await check(parsed.config)
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}

async function check(config: Config): Promise<void> {
  const context = readRunContext()
  const token = core.getInput('github-token')
  const octokit = token ? github.getOctokit(token) : undefined
  const pr = context.pullRequest

  // F15: leave quickly when the pull request does not touch translations.
  if (pr && octokit && (await skipPullRequest(octokit, context, config))) {
    core.info('No locale files changed in this pull request. Nothing to check.')
    await writeSummary(
      '## 🌐 Locale Guard\n\nNo locale files changed in this pull request.\n'
    )
    return
  }

  const baseLocale = config['base-locale']
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd()
  const project = await loadProject(localFileSource(workspace), {
    patterns: config.files,
    baseLocale
  })

  if (!project.locales.has(baseLocale)) {
    const found = [...project.locales.keys()]
    core.setFailed(
      found.length
        ? `Base locale "${baseLocale}" was not found. Found: ${found.join(', ')}. Check "base-locale" and "files".`
        : `No locale files match ${config.files.map((p) => `"${p}"`).join(', ')}. Check "files".`
    )
    return
  }

  const issues = analyze(project, { format: config.format })
  logIssues(issues)

  const link = lineLinker(context, pr?.headSha ?? context.sha)
  const report = { issues, project, hasBaseline: false, link }

  await writeSummary(renderReport({ ...report, maxLength: SUMMARY_LIMIT }))
  if (config.annotations) annotate(issues, baseLocale)
  if (config.comment && pr && octokit) {
    await comment(
      octokit,
      context,
      renderReport({
        ...report,
        maxLength: COMMENT_LIMIT,
        summaryUrl: context.runUrl
      }),
      issues
    )
  }

  // F13
  const verdict = decide(issues, {
    failOn: config['fail-on'],
    failOnExisting: true
  })
  if (verdict.failed) {
    core.setFailed(
      `Locale Guard found ${verdict.blocking.length} translation ${verdict.blocking.length === 1 ? 'issue' : 'issues'} (fail-on: ${config['fail-on']}).`
    )
  } else {
    core.info(
      issues.length
        ? `Locale Guard found ${issues.length} issues, none blocking (fail-on: ${config['fail-on']}).`
        : 'All translations are in sync.'
    )
  }
}

async function skipPullRequest(
  octokit: Octokit,
  context: RunContext,
  config: Config
): Promise<boolean> {
  const pr = context.pullRequest
  if (!pr) return false
  try {
    const changed = await listChangedFiles(octokit, context.repo, pr.number)
    return !touchesLocales(changed, config.files)
  } catch (error) {
    core.warning(
      `Could not list the files of this pull request, so every locale file is checked. ${error instanceof Error ? error.message : ''}`
    )
    return false
  }
}

async function comment(
  octokit: Octokit,
  context: RunContext,
  body: string,
  issues: Issue[]
): Promise<void> {
  const pr = context.pullRequest
  if (!pr) return

  // F14: a fork's token is read-only, so do not even try.
  if (pr.isFork) {
    core.info(
      'This pull request comes from a fork, and GitHub gives forks a read-only token, so Locale Guard cannot comment. The results are in the job summary and the annotations.'
    )
    return
  }

  const result = await upsertComment(octokit, context.repo, pr.number, body, {
    createIfMissing: issues.some((issue) => issue.isNew)
  })
  switch (result.status) {
    case 'created':
    case 'updated':
    case 'unchanged':
      core.info(`Pull request comment ${result.status}: ${result.url}`)
      break
    case 'skipped':
      core.info('No new issues, so no pull request comment was added.')
      break
    case 'forbidden':
      core.warning(
        `Locale Guard could not write the pull request comment (${result.message}). Add "pull-requests: write" to the workflow permissions. The results are in the job summary.`
      )
      break
  }
}

function logIssues(issues: Issue[]): void {
  if (issues.length === 0) return
  core.startGroup(`Locale Guard: ${issues.length} issues`)
  for (const issue of issues) {
    core.info(
      `${issue.severity} ${issue.locale} ${issue.file}${issue.line ? `:${issue.line}` : ''} ${issue.message.replace(/`/g, '')}`
    )
  }
  core.endGroup()
}
