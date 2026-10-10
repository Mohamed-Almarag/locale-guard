import { parse as parseYamlText } from 'yaml'
import { z } from 'zod'
import { validatePattern } from './loaders/pattern.js'
import type { Format } from './types.js'

export const CONFIG_FILE = '.localeguard.yml'

const CHECK_IDS = [
  'parse-error',
  'missing-keys',
  'extra-keys',
  'empty-values',
  'invalid-syntax',
  'placeholder-mismatch',
  'broken-linked-messages',
  'untranslated',
  'plural-forms'
] as const

/**
 * The `format` setting names the library that reads the messages. Libraries
 * that share a message syntax share a format: react-intl writes ICU messages
 * just like next-intl, and react-i18next writes plain JSON.
 */
export const FORMATS = {
  'vue-i18n': 'vue-i18n',
  '@nuxtjs/i18n': 'vue-i18n',
  icu: 'next-intl',
  'next-intl': 'next-intl',
  'use-intl': 'next-intl',
  'react-intl': 'next-intl',
  formatjs: 'next-intl',
  json: 'json',
  i18next: 'json',
  'react-i18next': 'json',
  'next-i18next': 'json',
  'i18next-vue': 'json'
} as const satisfies Record<string, Format>

/**
 * A framework can use more than one library, and each writes messages its own
 * way, so a framework name is answered with the libraries to choose from.
 */
const FRAMEWORKS: Record<string, string> = {
  nuxt: '@nuxtjs/i18n',
  vue: 'vue-i18n or i18next-vue',
  next: 'next-intl or next-i18next',
  nextjs: 'next-intl or next-i18next',
  react: 'react-intl or react-i18next'
}

const list = z
  .union([z.array(z.string()), z.string()])
  .transform((value) =>
    (Array.isArray(value) ? value : value.split(/[\n,]/))
      .map((item) => item.trim())
      .filter(Boolean)
  )

const flag = z.union([z.boolean(), z.stringbool()])

export const configSchema = z.strictObject({
  format: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.enum(Object.keys(FORMATS) as (keyof typeof FORMATS)[]))
    .default('json')
    .transform((name) => FORMATS[name]),
  'base-locale': z.string().trim().min(1).default('en'),
  files: list
    .refine(
      (patterns) => patterns.length > 0,
      'at least one pattern is required'
    )
    .superRefine((patterns, ctx) => {
      for (const pattern of patterns) {
        const problem = validatePattern(pattern)
        if (problem) ctx.addIssue({ code: 'custom', message: problem })
      }
    }),
  'fail-on': z.enum(['error', 'warning', 'never']).default('error'),
  'fail-on-existing': flag.default(false),
  comment: flag.default(true),
  annotations: flag.default(true),
  'ignore-keys': list.default([]),
  'ignore-locales': list.default([]),
  'ignore-values': list.default([]),
  'disable-checks': list.pipe(z.array(z.enum(CHECK_IDS))).default([])
})

export type Config = z.output<typeof configSchema>

export type ConfigResult =
  { ok: true; config: Config } | { ok: false; errors: string[] }

export interface ConfigFile {
  path: string
  values: Record<string, unknown>
}

/**
 * Validates the settings and fills in defaults. Settings come from the
 * optional config file and from action inputs; an input that was set wins.
 */
export function parseConfig(
  inputs: Record<string, unknown>,
  file?: ConfigFile
): ConfigResult {
  const fromInputs = Object.fromEntries(
    Object.entries(inputs).filter(
      ([, value]) => value !== undefined && value !== ''
    )
  )
  const merged = { ...file?.values, ...fromInputs }
  const result = configSchema.safeParse(merged)
  if (result.success) return { ok: true, config: result.data }

  const where = (name: string) =>
    name in fromInputs || !file ? `"${name}"` : `"${name}" in ${file.path}`

  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      if (issue.code === 'unrecognized_keys') {
        return issue.keys
          .map((key) => `Unknown setting ${where(key)}`)
          .join('\n')
      }
      const name = String(issue.path[0] ?? 'config')
      if (!(name in merged)) {
        return `Invalid ${where(name)}: this setting is required`
      }
      const value = merged[name as keyof typeof merged]
      const framework =
        name === 'format' && typeof value === 'string'
          ? FRAMEWORKS[value.trim().toLowerCase()]
          : undefined
      if (framework) {
        return `Invalid ${where(name)}: "${value}" is a framework, so name the translation library it uses: ${framework}`
      }
      return `Invalid ${where(name)}: ${describe(issue)} (got ${JSON.stringify(merged[name as keyof typeof merged])})`
    })
  }
}

/** Reads `.localeguard.yml`. Returns an error message when it is not a YAML map. */
export function readConfigFile(
  path: string,
  text: string
): ConfigFile | string {
  try {
    const values: unknown = parseYamlText(text)
    if (values === null || values === undefined) return { path, values: {} }
    if (typeof values !== 'object' || Array.isArray(values)) {
      return `${path} must contain settings as "name: value" lines`
    }
    return { path, values: values as Record<string, unknown> }
  } catch (error) {
    return `${path} is not valid YAML: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`
  }
}

function describe(issue: z.core.$ZodIssue): string {
  if (issue.code === 'invalid_value') {
    return `expected one of ${issue.values.join(', ')}`
  }
  if (issue.code === 'invalid_union') return 'expected true or false'
  return issue.message
}
