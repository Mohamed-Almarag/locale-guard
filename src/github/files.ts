import picomatch from 'picomatch'
import { toGlob } from '../core/loaders/pattern.js'
import type { Octokit, RepoRef } from './context.js'

/** Every file the pull request touches, including the old name of renamed files. */
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

/** F15: whether any changed file is a locale file or the config file. */
export function touchesLocales(
  changed: string[],
  patterns: string[],
  extraFiles: string[] = []
): boolean {
  const isLocale = picomatch(patterns.map(toGlob))
  return changed.some((file) => isLocale(file) || extraFiles.includes(file))
}
