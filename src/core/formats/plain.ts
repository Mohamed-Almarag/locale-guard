import { type MessageInfo, finalize } from './message.js'

// `{{name}}` (i18next, spaces allowed) and `{name}` (most other libraries).
// Any script, so a translated name like `{الاسم}` shows as unexpected
const PLACEHOLDER =
  /\{\{\s*([\p{L}\p{M}\p{N}_.-]+)\s*\}\}|\{([\p{L}\p{M}\p{N}_.-]+)\}/gu

// Plain JSON has no grammar, so placeholders are found with a pattern
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
