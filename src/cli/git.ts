import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import picomatch from 'picomatch'
import { type FileSource, listFileSource } from '../core/loaders/index.js'
import { toGlob } from '../core/loaders/pattern.js'

const exec = promisify(execFile)

// A big repo lists tens of thousands of files
const MAX_BUFFER = 512 * 1024 * 1024

export type Commit =
  { ok: true; sha: string } | { ok: false; reason: 'no-git' | 'not-found' }

export async function resolveCommit(cwd: string, ref: string): Promise<Commit> {
  try {
    await git(cwd, ['rev-parse', '--is-inside-work-tree'])
  } catch {
    return { ok: false, reason: 'no-git' }
  }
  try {
    const { stdout } = await git(cwd, [
      'rev-parse',
      '--verify',
      '--quiet',
      '--end-of-options',
      `${ref}^{commit}`
    ])
    return { ok: true, sha: stdout.trim() }
  } catch {
    return { ok: false, reason: 'not-found' }
  }
}

// Files of a commit, with paths relative to cwd as in the working tree
export async function commitFileSource(
  cwd: string,
  sha: string,
  patterns: string[]
): Promise<FileSource> {
  const { stdout } = await git(cwd, ['ls-tree', '-r', '-z', sha])
  const blobs = new Map<string, string>()
  for (const [info, path] of entries(stdout)) {
    // <mode> <type> <object>
    const [, type, object] = info.split(' ')
    if (type === 'blob' && object) blobs.set(path, object)
  }
  return blobSource(cwd, blobs, patterns)
}

// What the next commit holds: a pre-commit hook checks this, not unstaged edits
export async function stagedFileSource(
  cwd: string,
  patterns: string[]
): Promise<FileSource> {
  const { stdout } = await git(cwd, ['ls-files', '--stage', '-z'])
  const blobs = new Map<string, string>()
  for (const [info, path] of entries(stdout)) {
    // <mode> <object> <stage>, where a merge conflict has stages 1 to 3
    const [, object, stage] = info.split(' ')
    if (stage === '0' && object) blobs.set(path, object)
  }
  return blobSource(cwd, blobs, patterns)
}

// `<info>\t<path>` records, separated by NUL
function* entries(output: string): Generator<[string, string]> {
  for (const record of output.split('\0')) {
    const tab = record.indexOf('\t')
    if (tab >= 0) yield [record.slice(0, tab), record.slice(tab + 1)]
  }
}

async function blobSource(
  cwd: string,
  all: Map<string, string>,
  patterns: string[]
): Promise<FileSource> {
  const isMatch = picomatch(patterns.map(toGlob))
  const blobs = new Map([...all].filter(([path]) => isMatch(path)))
  const texts = await readBlobs(cwd, [...new Set(blobs.values())])
  return listFileSource([...blobs.keys()], async (path) => {
    const text = texts.get(blobs.get(path) ?? '')
    if (text === undefined) throw new Error(`File not found: ${path}`)
    return text
  })
}

// One process for every file, as one per file is slow on Windows
function readBlobs(
  cwd: string,
  objects: string[]
): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['cat-file', '--batch'], { cwd })
    const chunks: Buffer[] = []
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    child.on('error', reject)
    // A failed git closes stdin early; its exit code reports it
    child.stdin.on('error', () => undefined)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`git cat-file failed: ${stderr.trim()}`))
        return
      }
      resolve(parseBatch(Buffer.concat(chunks)))
    })
    child.stdin.end(objects.map((object) => `${object}\n`).join(''))
  })
}

// <object> blob <size>\n<content>\n, or <object> missing\n
function parseBatch(output: Buffer): Map<string, string> {
  const texts = new Map<string, string>()
  let at = 0
  while (at < output.length) {
    const end = output.indexOf(10, at)
    if (end < 0) break
    const [object = '', type, size] = output
      .toString('utf8', at, end)
      .split(' ')
    at = end + 1
    if (type === 'missing' || size === undefined) continue
    texts.set(object, output.toString('utf8', at, at + Number(size)))
    at += Number(size) + 1
  }
  return texts
}

function git(cwd: string, args: string[]) {
  return exec('git', args, { cwd, maxBuffer: MAX_BUFFER })
}
