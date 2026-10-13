// Characters that take no space on screen, including direction marks
const INVISIBLE = /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/

// What a reader cannot see in a key: an invisible character, or a space at its start or end
export function invisibleNote(key: string): string | undefined {
  if (INVISIBLE.test(key)) return 'with an invisible character'
  if (/\s$/.test(key)) return 'with a space at the end'
  if (/^\s/.test(key)) return 'with a space at the start'
  return undefined
}

// A key in backticks, followed by a note when part of it cannot be seen
export function showKey(key: string): string {
  const note = invisibleNote(key)
  return note ? `\`${key}\` (${note})` : `\`${key}\``
}
