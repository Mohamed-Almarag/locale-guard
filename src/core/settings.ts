import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AnalyzeOptions } from './analyze.js'
import { type Config, type ConfigFile, readConfigFile } from './config.js'
import type { LoadOptions } from './loaders/index.js'

// Set by the Action inputs or the CLI options, over the config file
export const SETTINGS = [
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
  'ignore-tags',
  'keys-as-text'
] as const

export function loadOptions(config: Config): LoadOptions {
  return {
    patterns: config.files,
    baseLocale: config['base-locale'],
    baseFile: config['base-file'],
    ignoreLocales: config['ignore-locales']
  }
}

export function analyzeOptions(config: Config): AnalyzeOptions {
  return {
    format: config.format,
    disabledChecks: config['disable-checks'],
    ignoreKeys: config['ignore-keys'],
    ignoreValues: config['ignore-values'],
    ignoreTags: config['ignore-tags'],
    keysAsText: config['keys-as-text']
  }
}

// Undefined when there is none, a message when it is broken
export async function loadConfigFile(
  root: string,
  path: string
): Promise<ConfigFile | string | undefined> {
  let text: string
  try {
    text = await readFile(join(root, path), 'utf8')
  } catch {
    return undefined
  }
  return readConfigFile(path, text)
}
