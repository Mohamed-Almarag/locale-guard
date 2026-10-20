import { describe, expect, it } from 'vitest'
import type { Issue } from '../../src/core/types.js'
import { renderTerminal } from '../../src/reporters/terminal.js'

function issue(fields: Partial<Issue>): Issue {
  return {
    check: 'missing-keys',
    severity: 'error',
    locale: 'ar',
    file: 'locales/ar.json',
    key: 'a',
    message: 'Missing key `a`',
    isNew: true,
    ...fields
  }
}

function render(issues: Issue[], hasBaseline = true, listExisting = false) {
  return renderTerminal({
    issues,
    hasBaseline,
    compared: 'since the last commit',
    listExisting,
    style: (format, text) => `<${String(format)}>${text}`
  })
}

describe('renderTerminal', () => {
  it('groups issues by file, sorted by line, with styles', () => {
    const output = render([
      issue({ line: 12, column: 5, message: 'Missing key `b`' }),
      issue({ line: 3, column: 5 }),
      issue({
        file: 'locales/fr.json',
        severity: 'warning',
        check: 'empty-values',
        message: 'Empty value for `c`',
        hint: 'Translate it'
      })
    ])
    expect(output.split('\n')).toEqual([
      '<underline>locales/ar.json',
      '  <dim>3:5   <red>error    Missing key <bold>a  <dim>missing-keys',
      '  <dim>12:5  <red>error    Missing key <bold>b  <dim>missing-keys',
      '',
      '<underline>locales/fr.json',
      '  <dim>  <yellow>warning  Empty value for <bold>c. Translate it  <dim>empty-values',
      '',
      '<red>✖ 3 new issues (2 errors, 1 warning) since the last commit'
    ])
  })

  it('counts existing issues without listing them', () => {
    const output = render([issue({ isNew: false })])
    expect(output).toBe(
      '<green>✔ No new translation issues since the last commit.\n<dim>  1 existing issue is not shown. --all lists every issue.'
    )
  })

  it('lists existing issues when asked', () => {
    const output = render([issue({ isNew: false })], true, true)
    expect(output).toContain('<bold>Existing issues')
    expect(output).toContain('Missing key <bold>a')
  })

  it('lists 150,000 issues', () => {
    const many = Array.from({ length: 150_000 }, (_, i) =>
      issue({ key: `k${i}`, line: i + 1 })
    )
    expect(render(many, false).split('\n')).toHaveLength(150_003)
  })

  it('leaves out the comparison without a baseline', () => {
    expect(render([issue({ severity: 'warning' })], false)).toContain(
      '<yellow>✖ 1 issue (1 warning)'
    )
    expect(render([], false)).toBe('<green>✔ All translations are in sync.')
  })
})
