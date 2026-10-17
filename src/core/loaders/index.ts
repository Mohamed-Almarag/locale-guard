import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import picomatch from 'picomatch'
import { glob } from 'tinyglobby'
import { isLocaleCode } from '../locale-code.js'
import type { Issue, Locale, LocaleFile, Project } from '../types.js'
import { parseJson } from './json.js'
import { type ParseResult, unwrapLocaleRoot } from './parsed.js'
import { matchPattern, toGlob } from './pattern.js'
import { parseYaml } from './yaml.js'

// The checked-out repo, or the base branch through the API
export interface FileSource {
  // Repo-relative paths with forward slashes
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

// From a known list of paths, e.g. a git tree or an in-memory map in tests
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
  // Read as the base locale; its name has no locale code
  baseFile?: string
  ignoreLocales?: string[]
}

export async function loadProject(
  source: FileSource,
  options: LoadOptions
): Promise<Project> {
  const ignored = new Set(options.ignoreLocales ?? [])
  const found = new Map<string, LocaleFile[]>()
  const skipped: string[] = []

  for (const pattern of options.patterns) {
    const paths = await source.glob([toGlob(pattern)])
    for (const path of paths.sort()) {
      const match = matchPattern(pattern, path)
      if (!match || ignored.has(match.locale)) continue
      // e.g. locales/vee-validate-ur.json or themes.json next to the locale files
      if (!isLocaleCode(match.locale)) {
        skipped.push(path)
        continue
      }
      const files = found.get(match.locale) ?? []
      if (!files.some((file) => file.path === path)) {
        files.push({ path, namespace: match.namespace })
      }
      found.set(match.locale, files)
    }
  }

  if (options.baseFile) {
    const path = options.baseFile.replace(/\\/g, '/').replace(/^\.\//, '')
    const [exists] = await source.glob([path])
    const files = found.get(options.baseLocale) ?? []
    if (exists && !files.some((file) => file.path === exists)) {
      files.push({ path: exists, namespace: '' })
      found.set(options.baseLocale, files)
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

      for (const { file, result: parsed } of results) {
        if (!parsed.ok) {
          locale.brokenNamespaces.add(file.namespace)
          parseErrors.push({
            check: 'parse-error',
            severity: 'error',
            locale: code,
            file: file.path,
            key: '',
            line: parsed.line,
            column: parsed.column,
            message: parsed.message,
            isNew: true
          })
          continue
        }

        const result = unwrapLocaleRoot(parsed, [code, options.baseLocale])
        // Rails merges every file of a locale into one tree, so a file name
        // like devise.en.yml is not a namespace
        if (result.root) {
          file.root = result.root
          file.namespace = ''
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
            filePath: entry.path,
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

  // Rails files share one tree, so a broken file can hold any key of its locale
  const rails = [...locales.values()].some((locale) =>
    locale.files.some((file) => file.root)
  )
  if (rails) {
    for (const locale of locales.values()) {
      if (locale.brokenNamespaces.size) locale.brokenNamespaces.add('')
    }
  }

  return {
    baseLocale: options.baseLocale,
    locales: new Map([...locales].sort(([a], [b]) => a.localeCompare(b))),
    parseErrors,
    // devise.en.yml fails `{locale}.yml` but loads through `*.{locale}.yml`
    skipped: skipped.filter(
      (path) =>
        ![...found.values()].some((files) =>
          files.some((file) => file.path === path)
        )
    )
  }
}

function parse(path: string, raw: string): ParseResult {
  const text = raw.replace(/^\uFEFF/, '')
  return /\.ya?ml$/i.test(path) ? parseYaml(text) : parseJson(text)
}
