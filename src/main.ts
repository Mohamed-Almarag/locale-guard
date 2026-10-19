import * as core from '@actions/core'
import * as github from '@actions/github'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type AnalyzeOptions, analyze } from './core/analyze.js'
import { markNew } from './core/baseline.js'
import {
  CONFIG_FILE,
  type Config,
  type ConfigFile,
  parseConfig,
  readConfigFile
} from './core/config.js'
import {
  type LoadOptions,
  loadProject,
  localFileSource
} from './core/loaders/index.js'
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

// GitHub rejects comments over 65,536 characters
const COMMENT_LIMIT = 65_000

const INPUTS = [
  'format',
  'base-locale',
  'base-file',
  'files',
  'fail-on',
  'fail-on-existing',
  'check-when',
  'comment',
  'annotations',
  'ignore-keys',
  'ignore-locales',
  'ignore-values',
  'disable-checks',
  'ignore-tags'
] as const

export async function run(): Promise<void> {
  try {
    const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd()
    const configPath = core.getInput('config-file') || CONFIG_FILE
    const file = await loadConfigFile(workspace, configPath)
    if (typeof file === 'string') {
      core.setFailed(file)
      return
    }

    const parsed = parseConfig(
      Object.fromEntries(INPUTS.map((name) => [name, core.getInput(name)])),
      file
    )
    if (!parsed.ok) {
      core.setFailed(
        ['Locale Guard settings are not valid:', ...parsed.errors].join('\n')
      )
      return
    }
    await check(parsed.config, workspace, configPath)
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}

async function check(
  config: Config,
  workspace: string,
  configPath: string
): Promise<void> {
  const context = readRunContext()
  const token = core.getInput('github-token')
  const octokit = token ? github.getOctokit(token) : undefined
  const pr = context.pullRequest

  // Leave early when no locale file changed, unless check-when is always
  const always = config['check-when'] === 'always'
  if (
    !always &&
    pr &&
    octokit &&
    (await skipPullRequest(octokit, context, config, configPath))
  ) {
    core.info('No locale files changed in this pull request. Nothing to check.')
    await writeSummary(
      '## 🌐 Locale Guard\n\nNo locale files changed in this pull request.\n'
    )
    return
  }

  const baseLocale = config['base-locale']
  const project = await loadProject(
    localFileSource(workspace),
    loadOptions(config)
  )
  if (project.skipped.length > 0) {
    core.info(
      `Skipped files whose name is not a locale code: ${project.skipped.join(', ')}. Narrow "files" if one of them is a real locale.`
    )
  }

  if (!project.locales.has(baseLocale)) {
    const found = [...project.locales.keys()]
    if (config['base-file']) {
      core.setFailed(
        `Base file "${config['base-file']}" was not found. Check "base-file".`
      )
      return
    }
    core.setFailed(
      found.length
        ? `Base locale "${baseLocale}" was not found. Found: ${found.join(', ')}. Check "base-locale" and "files".`
        : `No locale files match ${config.files.map((p) => `"${p}"`).join(', ')}. Check "files".`
    )
    return
  }

  const headIssues = analyze(project, analyzeOptions(config))
  const baseIssues =
    pr && octokit ? await analyzeBase(octokit, context, config) : undefined
  const issues = baseIssues ? markNew(headIssues, baseIssues) : headIssues
  const hasBaseline = baseIssues !== undefined
  logIssues(issues)

  const link = lineLinker(context, pr?.headSha ?? context.sha)
  const report = { issues, project, hasBaseline, link }

  await writeSummary(renderReport({ ...report, maxLength: SUMMARY_LIMIT }))
  if (config.annotations) {
    // Old issues are not this PR's doing, so they are not annotated
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
        summaryUrl: context.runUrl,
        // check-when: always lists old issues open
        existing: always ? 'open' : 'counts'
      }),
      // A new comment for new issues, or for any issue with check-when: always
      always ? issues.length > 0 : issues.some((issue) => issue.isNew)
    )
  }

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

// Undefined when the base cannot be read, so every issue counts as new
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
      config['base-file']
        ? [...config.files, config['base-file']]
        : config.files
    )
    const project = await loadProject(source, loadOptions(config))
    return analyze(project, analyzeOptions(config))
  } catch (error) {
    core.warning(
      `Could not read the locale files of the base branch, so every issue is treated as new. ${error instanceof Error ? error.message : ''}`
    )
    return undefined
  }
}

function loadOptions(config: Config): LoadOptions {
  return {
    patterns: config.files,
    baseLocale: config['base-locale'],
    baseFile: config['base-file'],
    ignoreLocales: config['ignore-locales']
  }
}

function analyzeOptions(config: Config): AnalyzeOptions {
  return {
    format: config.format,
    disabledChecks: config['disable-checks'],
    ignoreKeys: config['ignore-keys'],
    ignoreValues: config['ignore-values'],
    ignoreTags: config['ignore-tags']
  }
}

// Undefined when there is none, a message when it is broken
async function loadConfigFile(
  workspace: string,
  path: string
): Promise<ConfigFile | string | undefined> {
  let text: string
  try {
    text = await readFile(join(workspace, path), 'utf8')
  } catch {
    return undefined
  }
  core.info(`Using settings from ${path}`)
  return readConfigFile(path, text)
}

async function skipPullRequest(
  octokit: Octokit,
  context: RunContext,
  config: Config,
  configPath: string
): Promise<boolean> {
  const pr = context.pullRequest
  if (!pr) return false
  try {
    const changed = await listChangedFiles(octokit, context.repo, pr.number)
    const extra = [
      configPath,
      ...(config['base-file'] ? [config['base-file']] : [])
    ]
    if (touchesLocales(changed, config.files, extra)) return false
    // A previous comment may show stale issues, so run again
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
  createIfMissing: boolean
): Promise<void> {
  const pr = context.pullRequest
  if (!pr) return

  // A fork's token is read-only
  if (pr.isFork) {
    core.info(
      'This pull request comes from a fork, and GitHub gives forks a read-only token, so Locale Guard cannot comment. The results are in the job summary and the annotations.'
    )
    return
  }

  const result = await upsertComment(octokit, context.repo, pr.number, body, {
    createIfMissing
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

// Existing issues get one count line: there can be 100,000 of them
function logIssues(issues: Issue[]): void {
  const fresh = issues.filter((issue) => issue.isNew)
  const existing = issues.length - fresh.length
  if (fresh.length > 0) {
    core.startGroup(
      `Locale Guard: ${fresh.length} new ${fresh.length === 1 ? 'issue' : 'issues'}`
    )
    for (const issue of fresh) {
      core.info(
        `${issue.severity} ${issue.locale} ${issue.file}${issue.line ? `:${issue.line}` : ''} ${[issue.message, issue.hint].filter(Boolean).join('. ').replace(/`/g, '')}`
      )
    }
    core.endGroup()
  }
  if (existing > 0) {
    core.info(
      `Locale Guard: ${existing} existing ${existing === 1 ? 'issue' : 'issues'} from the base branch, listed in the job summary.`
    )
  }
}
