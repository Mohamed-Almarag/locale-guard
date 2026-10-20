import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { analyze } from '../core/analyze.js'
import { markNew } from '../core/baseline.js'
import { CONFIG_FILE, type Config, parseConfig } from '../core/config.js'
import { loadProject, localFileSource } from '../core/loaders/index.js'
import { decide } from '../core/policy.js'
import {
  analyzeOptions,
  loadConfigFile,
  loadOptions
} from '../core/settings.js'
import type { Issue, Project } from '../core/types.js'
import { renderReport } from '../reporters/markdown.js'
import { type Style, renderTerminal } from '../reporters/terminal.js'
import { HELP, readArgs } from './args.js'
import { commitFileSource, resolveCommit, stagedFileSource } from './git.js'

export interface CliIO {
  cwd: string
  version: string
  out: (text: string) => void
  err: (text: string) => void
  style: Style
}

// Settings or usage problems, as ESLint does
const INVALID = 2

export async function runCli(argv: string[], io: CliIO): Promise<number> {
  try {
    return await check(argv, io)
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error))
    return INVALID
  }
}

async function check(argv: string[], io: CliIO): Promise<number> {
  let args
  try {
    args = readArgs(argv)
  } catch (error) {
    io.err(
      `${error instanceof Error ? error.message : String(error)}\nRun locale-guard-cli --help to see the options.`
    )
    return INVALID
  }
  if (args.help) {
    io.out(HELP)
    return 0
  }
  if (args.version) {
    io.out(io.version)
    return 0
  }
  if (args.all && args.base) {
    io.err('--all checks every issue, so it cannot be used with --base.')
    return INVALID
  }

  const configPath = args.config ?? CONFIG_FILE
  const file = await loadConfigFile(io.cwd, configPath)
  if (typeof file === 'string') {
    io.err(file)
    return INVALID
  }
  if (!file && args.config) {
    io.err(`Settings file "${args.config}" was not found.`)
    return INVALID
  }
  if (!file && !args.settings.files) {
    io.err(
      [
        `No ${CONFIG_FILE} was found. Add one next to package.json with your locale files:`,
        '',
        '  files: locales/{locale}.json',
        '',
        'or name them in the command:',
        '',
        '  npx locale-guard-cli --files "locales/{locale}.json"'
      ].join('\n')
    )
    return INVALID
  }

  const parsed = parseConfig(args.settings, file)
  if (!parsed.ok) {
    io.err(
      ['Locale Guard settings are not valid:', ...parsed.errors].join('\n')
    )
    return INVALID
  }
  const config = parsed.config

  if (args.staged) {
    const head = await resolveCommit(io.cwd, 'HEAD')
    if (!head.ok && head.reason === 'no-git') {
      io.err(
        '--staged reads the files staged in git, but this folder is not in a git repository.'
      )
      return INVALID
    }
  }
  const project = await loadProject(
    args.staged
      ? await stagedFileSource(io.cwd, patternsOf(config))
      : localFileSource(io.cwd),
    loadOptions(config)
  )
  const notes: string[] = []
  if (project.skipped.length > 0) {
    notes.push(
      `Skipped files whose name is not a locale code: ${project.skipped.join(', ')}. Narrow "files" if one of them is a real locale.`
    )
  }
  const problem = missingBase(project, config)
  if (problem) {
    io.err(problem)
    return INVALID
  }

  const head = analyze(project, analyzeOptions(config))
  let issues = head
  let hasBaseline = false
  const ref = args.base ?? 'HEAD'
  if (!args.all) {
    const base = await analyzeBase(io.cwd, ref, config)
    if (base.status === 'not-found' && args.base) {
      io.err(
        `--base "${args.base}" is not a branch, tag or commit in this repository.`
      )
      return INVALID
    }
    if (base.status === 'ok') {
      issues = markNew(head, base.issues)
      hasBaseline = true
    } else notes.push(base.note)
  }

  const compared =
    ref === 'HEAD' ? 'since the last commit' : `compared with ${args.base}`
  const verdict = decide(issues, {
    failOn: config['fail-on'],
    failOnExisting: config['fail-on-existing']
  })

  if (args.output) {
    const path = resolve(io.cwd, args.output)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(
      path,
      renderReport({
        issues,
        project,
        hasBaseline,
        link: fileLinker(io.cwd, dirname(path)),
        compared: {
          label: `New ${compared}`,
          clean: `No new translation issues ${compared}.`
        }
      })
    )
  }

  for (const note of notes) io.out(io.style('dim', note))
  if (notes.length > 0) io.out('')
  io.out(
    renderTerminal({
      issues,
      hasBaseline,
      compared,
      listExisting: config['fail-on-existing'],
      style: io.style
    })
  )
  if (args.output) io.out(io.style('dim', `Report written to ${args.output}`))

  const fresh = issues.filter((issue) => issue.isNew).length
  if (!verdict.failed && fresh > 0 && config['fail-on'] !== 'never') {
    io.out(
      io.style(
        'dim',
        `None of them fail the run (fail-on: ${config['fail-on']}).`
      )
    )
  }
  return verdict.failed ? 1 : 0
}

function missingBase(project: Project, config: Config): string | undefined {
  const baseLocale = config['base-locale']
  if (project.locales.has(baseLocale)) return undefined
  if (config['base-file']) {
    return `Base file "${config['base-file']}" was not found. Check "base-file".`
  }
  const found = [...project.locales.keys()]
  return found.length
    ? `Base locale "${baseLocale}" was not found. Found: ${found.join(', ')}. Check "base-locale" and "files".`
    : `No locale files match ${config.files.map((p) => `"${p}"`).join(', ')}. Check "files".`
}

type BaseResult =
  | { status: 'ok'; issues: Issue[] }
  | { status: 'not-found' | 'skipped'; note: string }

async function analyzeBase(
  cwd: string,
  ref: string,
  config: Config
): Promise<BaseResult> {
  const commit = await resolveCommit(cwd, ref)
  if (!commit.ok) {
    return {
      status: commit.reason === 'no-git' ? 'skipped' : 'not-found',
      note:
        commit.reason === 'no-git'
          ? 'This folder is not in a git repository, so every issue is checked.'
          : 'There is no commit yet, so every issue is checked.'
    }
  }
  try {
    const source = await commitFileSource(cwd, commit.sha, patternsOf(config))
    const project = await loadProject(source, loadOptions(config))
    return { status: 'ok', issues: analyze(project, analyzeOptions(config)) }
  } catch (error) {
    return {
      status: 'skipped',
      note: `Could not read the locale files of ${ref}, so every issue is checked. ${error instanceof Error ? error.message : ''}`
    }
  }
}

function patternsOf(config: Config): string[] {
  return config['base-file']
    ? [...config.files, config['base-file']]
    : config.files
}

// Relative to the report, so the links work where it is opened
function fileLinker(cwd: string, reportDir: string) {
  return (file: string, line?: number) => {
    const path = relative(reportDir, resolve(cwd, file))
      .split(/[\\/]/)
      .map(encodeURIComponent)
      .join('/')
    return line ? `${path}#L${line}` : path
  }
}
