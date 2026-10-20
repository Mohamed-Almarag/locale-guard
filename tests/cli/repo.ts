import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach } from 'vitest'

const folders: string[] = []

afterEach(() => {
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true })
  }
})

// A temporary folder, outside any git repository
export function folder(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'locale-guard-cli-'))
  folders.push(root)
  write(root, files)
  return root
}

export function write(root: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
}

export function git(root: string, ...args: string[]): string {
  return execFileSync(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'core.autocrlf=false',
      ...args
    ],
    { cwd: root, encoding: 'utf8' }
  )
}

// A repository with the files in its first commit
export function repo(files: Record<string, string>): string {
  const root = folder(files)
  git(root, 'init', '-q', '-b', 'main')
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'base')
  return root
}
