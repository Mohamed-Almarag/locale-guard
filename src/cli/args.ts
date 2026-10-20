import { type ParseArgsOptionsConfig, parseArgs } from 'node:util'

const LISTS = [
  'files',
  'ignore-keys',
  'ignore-locales',
  'ignore-values',
  'disable-checks'
] as const
const FLAGS = ['fail-on-existing', 'ignore-tags', 'keys-as-text'] as const
const VALUES = ['format', 'base-locale', 'base-file', 'fail-on'] as const

const OPTIONS: ParseArgsOptionsConfig = {
  base: { type: 'string' },
  all: { type: 'boolean' },
  staged: { type: 'boolean' },
  output: { type: 'string' },
  config: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  ...Object.fromEntries(
    LISTS.map((name) => [name, { type: 'string', multiple: true }])
  ),
  ...Object.fromEntries(FLAGS.map((name) => [name, { type: 'boolean' }])),
  ...Object.fromEntries(VALUES.map((name) => [name, { type: 'string' }]))
}

export interface CliArgs {
  // As Action inputs: lists one item per line, flags "true" or "false"
  settings: Record<string, string>
  base?: string
  all: boolean
  staged: boolean
  output?: string
  config?: string
  help: boolean
  version: boolean
}

// Throws on an unknown option or a missing value
export function readArgs(argv: string[]): CliArgs {
  const { values } = parseArgs({
    args: argv,
    options: OPTIONS,
    allowNegative: true,
    strict: true
  })
  const text = (name: string) => {
    const value = values[name]
    return typeof value === 'string' ? value : undefined
  }

  const settings: Record<string, string> = {}
  for (const name of LISTS) {
    const value = values[name]
    if (Array.isArray(value)) settings[name] = value.join('\n')
  }
  for (const name of FLAGS) {
    const value = values[name]
    if (typeof value === 'boolean') settings[name] = String(value)
  }
  for (const name of VALUES) {
    const value = text(name)
    if (value !== undefined) settings[name] = value
  }

  return {
    settings,
    base: text('base'),
    all: values.all === true,
    staged: values.staged === true,
    output: text('output'),
    config: text('config'),
    help: values.help === true,
    version: values.version === true
  }
}

export const HELP = `Usage: locale-guard-cli [options]

Checks translation files for missing keys, broken placeholders and
untranslated text. Settings come from .localeguard.yml, and options win
over it.

By default, only issues added since the last commit fail the run, as in a
pull request. In a pre-commit hook, add --staged. Before a push, use
--base with the branch the pull request goes to.

Compare:
  --base <ref>              Compare with a branch, tag or commit (default: HEAD)
  --all                     Check every issue, without comparing
  --staged                  Check the staged files, as the commit will hold
                            them, instead of the files on disk

Output:
  --output <file>           Also write the report as Markdown, as in the
                            pull request comment

Settings (same as the Action inputs):
  --config <file>           Settings file (default: .localeguard.yml)
  --files <pattern>         Locale files, e.g. "locales/{locale}.json"
  --format <library>        vue-i18n, next-intl, i18next, json, ...
  --base-locale <code>      Locale the others are compared with (default: en)
  --base-file <file>        Base file whose name has no locale code
  --fail-on <level>         error, warning or never (default: error)
  --fail-on-existing        Fail on issues that already existed too
  --ignore-keys <glob>      Keys to skip, e.g. "legacy.*"
  --ignore-locales <code>   Locales to skip
  --ignore-values <value>   Values that may stay the same, e.g. brand names
  --disable-checks <id>     Checks to turn off, e.g. untranslated
  --ignore-tags             ICU only: read tags as plain text
  --keys-as-text            An empty base value means the key is the text

  Options that take a list can be repeated. Flags take a --no- form,
  e.g. --no-ignore-tags.

  -h, --help                Show this help
  -v, --version             Show the version

Exit codes: 0 passed, 1 issues failed the run, 2 the settings or the
command are not valid.

Docs: https://github.com/Mohamed-Almarag/locale-guard`
