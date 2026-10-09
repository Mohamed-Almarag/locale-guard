import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import picomatch from 'picomatch'
import { glob } from 'tinyglobby'
import type { Issue, Locale, LocaleFile, Project } from '../types.js'
import { parseJson } from './json.js'
import type { ParseResult } from './parsed.js'
import { matchPattern, toGlob } from './pattern.js'
import { parseYaml } from './yaml.js'

/** Where locale files come from: the checked-out repo, or the base branch through the API. */
export interface FileSource {
  /** Returns repo-relative paths with forward slashes. */
  glob(patterns: string[]): Promise<string[]>
  read(path: string): Promise<string>
}

export function localFileSource(root: string): FileSource {
  return {
    glob: (patterns) =>
      glob(patterns, {
        cwd: root,
        onlyFiles: true,
        expandDirectories: false,
        ignore: ['**/node_modules/**']
      }),
    read: (path) => readFile(join(root, path), 'utf8')
  }
}

/** A source built from a known list of paths, e.g. a git tree or an in-memory map in tests. */
export function listFileSource(
  paths: string[],
  read: (path: string) => Promise<string>
): FileSource {
  return {
    glob: async (patterns) => {
      const isMatch = picomatch(patterns)
      return paths.filter(
        (path) => isMatch(path) && !path.includes('node_modules/')
      )
    },
    read
  }
}

export function memoryFileSource(files: Record<string, string>): FileSource {
  return listFileSource(Object.keys(files), async (path) => {
    const text = files[path]
    if (text === undefined) throw new Error(`File not found: ${path}`)
    return text
  })
}

export interface LoadOptions {
  patterns: string[]
  baseLocale: string
  ignoreLocales?: string[]
}

export async function loadProject(
  source: FileSource,
  options: LoadOptions
): Promise<Project> {
  const ignored = new Set(options.ignoreLocales ?? [])
  const found = new Map<string, LocaleFile[]>()

  for (const pattern of options.patterns) {
    const paths = await source.glob([toGlob(pattern)])
    for (const path of paths.sort()) {
      const match = matchPattern(pattern, path)
      if (!match || ignored.has(match.locale)) continue
      const files = found.get(match.locale) ?? []
      if (!files.some((file) => file.path === path)) {
        files.push({ path, namespace: match.namespace })
      }
      found.set(match.locale, files)
    }
  }

  const parseErrors: Issue[] = []
  const locales = new Map<string, Locale>()

  await Promise.all(
    [...found].map(async ([code, files]) => {
      const locale: Locale = {
        code,
        files,
        entries: new Map(),
        nodes: new Map(),
        brokenNamespaces: new Set()
      }

      const results = await Promise.all(
        files.map(async (file) => ({
          file,
          result: parse(file.path, await source.read(file.path))
        }))
      )

      for (const { file, result } of results) {
        if (!result.ok) {
          locale.brokenNamespaces.add(file.namespace)
          parseErrors.push({
            check: 'parse-error',
            severity: 'error',
            locale: code,
            file: file.path,
            key: '',
            line: result.line,
            column: result.column,
            message: result.message,
            isNew: true
          })
          continue
        }

        const prefix = file.namespace
        if (prefix) {
          locale.nodes.set(prefix, { file: file.path, line: 1, column: 1 })
        }
        for (const node of result.nodes) {
          const key = prefix ? `${prefix}.${node.key}` : node.key
          locale.nodes.set(key, {
            file: file.path,
            line: node.line,
            column: node.column
          })
        }
        for (const entry of result.entries) {
          const key = prefix ? `${prefix}.${entry.key}` : entry.key
          locale.entries.set(key, {
            key,
            fileKey: entry.key,
            value: entry.value,
            file: file.path,
            line: entry.line,
            column: entry.column
          })
        }
      }

      locales.set(code, locale)
    })
  )

  return {
    baseLocale: options.baseLocale,
    locales: new Map([...locales].sort(([a], [b]) => a.localeCompare(b))),
    parseErrors
  }
}

function parse(path: string, raw: string): ParseResult {
  const text = raw.replace(/^\uFEFF/, '')
  return /\.ya?ml$/i.test(path) ? parseYaml(text) : parseJson(text)
}
