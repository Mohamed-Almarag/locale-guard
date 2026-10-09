import { z } from 'zod'
import { validatePattern } from './loaders/pattern.js'

const list = z
  .union([z.array(z.string()), z.string()])
  .transform((value) =>
    (Array.isArray(value) ? value : value.split(/[\n,]/))
      .map((item) => item.trim())
      .filter(Boolean)
  )

const flag = z.union([z.boolean(), z.stringbool()])

export const configSchema = z.object({
  format: z.enum(['vue-i18n', 'next-intl', 'json']).default('json'),
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
  comment: flag.default(true),
  annotations: flag.default(true)
})

export type Config = z.output<typeof configSchema>

export type ConfigResult =
  { ok: true; config: Config } | { ok: false; errors: string[] }

/** Validates raw settings (action inputs) and fills in defaults. */
export function parseConfig(raw: Record<string, unknown>): ConfigResult {
  const defined = Object.fromEntries(
    Object.entries(raw).filter(
      ([, value]) => value !== undefined && value !== ''
    )
  )
  const result = configSchema.safeParse(defined)
  if (result.success) return { ok: true, config: result.data }

  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const name = String(issue.path[0] ?? 'config')
      if (!(name in defined)) {
        return `Invalid "${name}": this setting is required`
      }
      return `Invalid "${name}": ${describe(issue)} (got ${JSON.stringify(defined[name])})`
    })
  }
}

function describe(issue: z.core.$ZodIssue): string {
  if (issue.code === 'invalid_value') {
    return `expected one of ${issue.values.join(', ')}`
  }
  if (issue.code === 'invalid_union') return 'expected true or false'
  return issue.message
}
