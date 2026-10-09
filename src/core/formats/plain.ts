import { type MessageInfo, finalize } from './message.js'

// `{{name}}` (i18next, spaces allowed) and `{name}` (most other libraries).
const PLACEHOLDER = /\{\{\s*([\w.-]+)\s*\}\}|\{([\w.-]+)\}/g

/** Plain JSON messages have no grammar, so placeholders are found with a pattern. */
export function describePlainMessage(source: string): MessageInfo {
  const placeholders: string[] = []
  for (const match of source.matchAll(PLACEHOLDER)) {
    placeholders.push(match[1] ? `{{${match[1]}}}` : `{${match[2]}}`)
  }
  return finalize({
    placeholders,
    linkedKeys: [],
    plurals: [],
    text: source.replace(PLACEHOLDER, ' ').replace(/\s+/g, ' ').trim()
  })
}
