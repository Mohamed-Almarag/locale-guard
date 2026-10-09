import type { Issue } from './types.js'

/**
 * Identifies "the same issue" on two branches. The file path and line are left
 * out on purpose: moving a key or adding lines above it must not turn an old
 * issue into a new one.
 */
export function fingerprint(issue: Issue): string {
  return [issue.check, issue.locale, issue.key, issue.message].join('\u0000')
}

/**
 * F9: marks each issue of the pull request as new, or as existing when the
 * same issue is already on the base branch.
 */
export function markNew(head: Issue[], base: Issue[]): Issue[] {
  const existing = new Set(base.map(fingerprint))
  return head.map((issue) => ({
    ...issue,
    isNew: !existing.has(fingerprint(issue))
  }))
}
