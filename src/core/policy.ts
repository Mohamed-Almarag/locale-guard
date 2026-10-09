import type { Issue } from './types.js'

export type FailOn = 'error' | 'warning' | 'never'

export interface PolicyOptions {
  failOn: FailOn
  /** Also fail on issues that existed before the pull request. */
  failOnExisting: boolean
}

export interface Verdict {
  failed: boolean
  /** Issues that caused the failure. */
  blocking: Issue[]
}

/** F13: decides whether the check fails. */
export function decide(issues: Issue[], options: PolicyOptions): Verdict {
  if (options.failOn === 'never') return { failed: false, blocking: [] }

  const blocking = issues.filter(
    (issue) =>
      (issue.isNew || options.failOnExisting) &&
      (options.failOn === 'warning' || issue.severity === 'error')
  )
  return { failed: blocking.length > 0, blocking }
}
