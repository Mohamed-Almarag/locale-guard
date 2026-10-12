import type { Issue } from './types.js'

// File and line are left out, so moving a key does not make an old issue new
export function fingerprint(issue: Issue): string {
  return [issue.check, issue.locale, issue.key, issue.message].join('\u0000')
}

export function markNew(head: Issue[], base: Issue[]): Issue[] {
  const existing = new Set(base.map(fingerprint))
  return head.map((issue) => ({
    ...issue,
    isNew: !existing.has(fingerprint(issue))
  }))
}
