import * as core from '@actions/core'
import * as github from '@actions/github'
import { analyze } from './core/analyze.js'
import { markNew } from './core/baseline.js'
import { type Config, parseConfig } from './core/config.js'
import { loadProject, localFileSource } from './core/loaders/index.js'
import { decide } from './core/policy.js'
import type { Issue } from './core/types.js'
import { annotate } from './github/annotations.js'
import { findComment, upsertComment } from './github/comment.js'
import {
  type Octokit,
  type RunContext,
  lineLinker,
  readRunContext
} from './github/context.js'
import {
  baseFileSource,
  listChangedFiles,
  touchesLocales
} from './github/files.js'
import { renderReport } from './reporters/markdown.js'
import { SUMMARY_LIMIT, writeSummary } from './reporters/summary.js'

/** GitHub rejects comments longer than 65,536 characters. */
const COMMENT_LIMIT = 65_000

const INPUTS = [
  'format',
  'base-locale',
  'files',
  'fail-on',
  'fail-on-existing',
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

  const headIssues = analyze(project, { format: config.format })
  const baseIssues =
    pr && octokit ? await analyzeBase(octokit, context, config) : undefined
  const issues = baseIssues ? markNew(headIssues, baseIssues) : headIssues
  const hasBaseline = baseIssues !== undefined
  logIssues(issues)

  const link = lineLinker(context, pr?.headSha ?? context.sha)
  const report = { issues, project, hasBaseline, link }

  await writeSummary(renderReport({ ...report, maxLength: SUMMARY_LIMIT }))
  if (config.annotations) {
    // With a baseline, old issues are not annotated: they are not this PR's doing.
    annotate(
      hasBaseline ? issues.filter((issue) => issue.isNew) : issues,
      baseLocale
    )
  }
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
    failOnExisting: config['fail-on-existing']
  })
  const existing = issues.filter((issue) => !issue.isNew).length
  if (verdict.failed) {
    core.setFailed(
      `Locale Guard found ${verdict.blocking.length} translation ${verdict.blocking.length === 1 ? 'issue' : 'issues'} (fail-on: ${config['fail-on']}).`
    )
  } else {
    core.info(
      issues.length
        ? `Locale Guard found ${issues.length} issues, none blocking (fail-on: ${config['fail-on']}${existing ? `, ${existing} already existed before this pull request` : ''}).`
        : 'All translations are in sync.'
    )
  }
}

/**
 * F9: runs the same checks on the base branch. Returns undefined when the base
 * cannot be read, so every issue is treated as new instead of failing the run.
 */
async function analyzeBase(
  octokit: Octokit,
  context: RunContext,
  config: Config
): Promise<Issue[] | undefined> {
  const pr = context.pullRequest
  if (!pr) return undefined
  try {
    const source = await baseFileSource(
      octokit,
      context.repo,
      pr.baseSha,
      config.files
    )
    const project = await loadProject(source, {
      patterns: config.files,
      baseLocale: config['base-locale']
    })
    return analyze(project, { format: config.format })
  } catch (error) {
    core.warning(
      `Could not read the locale files of the base branch, so every issue is treated as new. ${error instanceof Error ? error.message : ''}`
    )
    return undefined
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
    if (touchesLocales(changed, config.files)) return false
    // A previous run left a comment, e.g. before a fix reverted the locale
    // changes. Run again so the comment does not show stale issues.
    return !(
      config.comment && (await findComment(octokit, context.repo, pr.number))
    )
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
  core.startGroup(
    `Locale Guard: ${issues.length} ${issues.length === 1 ? 'issue' : 'issues'}`
  )
  for (const issue of issues) {
    core.info(
      `${issue.severity} ${issue.locale} ${issue.file}${issue.line ? `:${issue.line}` : ''} ${issue.message.replace(/`/g, '')}`
    )
  }
  core.endGroup()
}
