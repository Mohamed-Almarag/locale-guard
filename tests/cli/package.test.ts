import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) =>
  JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>

describe('cli/package.json', () => {
  it('has the version of the Action', () => {
    expect(read('cli/package.json').version).toBe(read('package.json').version)
  })

  it('publishes the bundle only, without dependencies', () => {
    const cli = read('cli/package.json')
    expect(cli.files).toEqual(['dist'])
    expect(cli.bin).toEqual({ 'locale-guard-cli': 'dist/cli.js' })
    expect(cli.dependencies).toBeUndefined()
  })
})
