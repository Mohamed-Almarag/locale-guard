import picomatch from 'picomatch'
import { type FileSource, listFileSource } from '../core/loaders/index.js'
import { toGlob } from '../core/loaders/pattern.js'
import type { Octokit, RepoRef } from './context.js'

// Kept low to avoid GitHub's secondary rate limits
const CONCURRENCY = 8

// Through the API, so users need no `fetch-depth: 0` in actions/checkout
export async function baseFileSource(
  octokit: Octokit,
  repo: RepoRef,
  sha: string,
  patterns: string[]
): Promise<FileSource> {
  const blobs = new Map<string, string>()

  for (const dir of rootDirs(patterns)) {
    const treeSha = await resolveTree(octokit, repo, sha, dir)
    if (!treeSha) continue

    const { data } = await octokit.rest.git.getTree({
      ...repo,
      tree_sha: treeSha,
      recursive: 'true'
    })
    if (data.truncated) {
      throw new Error(
        `The base branch has too many files under "${dir || '/'}" to list them through the API.`
      )
    }
    for (const entry of data.tree) {
      if (entry.type === 'blob' && entry.path && entry.sha) {
        blobs.set(dir ? `${dir}/${entry.path}` : entry.path, entry.sha)
      }
    }
  }

  const limit = limiter(CONCURRENCY)
  return listFileSource([...blobs.keys()], (path) =>
    limit(async () => {
      const { data } = await octokit.rest.git.getBlob({
        ...repo,
        file_sha: blobs.get(path) as string
      })
      return Buffer.from(
        data.content,
        data.encoding === 'base64' ? 'base64' : 'utf8'
      ).toString('utf8')
    })
  )
}

// Fixed leading folders, without folders nested in another one
export function rootDirs(patterns: string[]): string[] {
  const dirs = patterns.map((pattern) => {
    const segments = toGlob(pattern).split('/')
    const fixed: string[] = []
    for (const segment of segments.slice(0, -1)) {
      if (/[*?[{]/.test(segment)) break
      fixed.push(segment)
    }
    return fixed.join('/')
  })
  const unique = [...new Set(dirs)].sort()
  return unique.filter(
    (dir) =>
      !unique.some(
        (other) =>
          other !== dir && (other === '' || dir.startsWith(`${other}/`))
      )
  )
}

async function resolveTree(
  octokit: Octokit,
  repo: RepoRef,
  sha: string,
  dir: string
): Promise<string | undefined> {
  let treeSha = sha
  for (const segment of dir ? dir.split('/') : []) {
    const { data } = await octokit.rest.git.getTree({
      ...repo,
      tree_sha: treeSha
    })
    const entry = data.tree.find(
      (item) => item.path === segment && item.type === 'tree'
    )
    if (!entry?.sha) return undefined
    treeSha = entry.sha
  }
  return treeSha
}

function limiter(max: number) {
  let active = 0
  const queue: (() => void)[] = []
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => queue.push(resolve))
    active++
    try {
      return await task()
    } finally {
      active--
      queue.shift()?.()
    }
  }
}

// Renamed files count with their old name too
export async function listChangedFiles(
  octokit: Octokit,
  repo: RepoRef,
  pullNumber: number
): Promise<string[]> {
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    ...repo,
    pull_number: pullNumber,
    per_page: 100
  })
  return files.flatMap((file) =>
    file.previous_filename
      ? [file.filename, file.previous_filename]
      : [file.filename]
  )
}

// The config file counts too
export function touchesLocales(
  changed: string[],
  patterns: string[],
  extraFiles: string[] = []
): boolean {
  const isLocale = picomatch(patterns.map(toGlob))
  return changed.some((file) => isLocale(file) || extraFiles.includes(file))
}
