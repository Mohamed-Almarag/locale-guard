import {
  type MessageFormatElement,
  TYPE,
  parse
} from '@formatjs/icu-messageformat-parser'
import { type MessageInfo, type PluralInfo, finalize } from './message.js'

/**
 * Reads an ICU message (next-intl) with the FormatJS parser:
 *   arguments `{amount}`, `{amount, number}`, `{count, plural, ...}`,
 *   `{gender, select, ...}`, and rich text tags `<b>...</b>`.
 */
export function describeIcuMessage(source: string): MessageInfo {
  let elements: MessageFormatElement[]
  try {
    // `other` is required by ICU, but the plural-forms check reports it with a
    // clearer message, so the parser must not fail on it.
    elements = parse(source, { requiresOtherClause: false })
  } catch (error) {
    const location = (error as { location?: { start?: { column?: number } } })
      .location
    const code = error instanceof Error ? error.message : String(error)
    const column = location?.start?.column
    return {
      placeholders: [],
      linkedKeys: [],
      plurals: [],
      text: '',
      error: `Invalid ICU message: ${humanize(code)}${column ? ` (column ${column})` : ''}`
    }
  }

  const placeholders: string[] = []
  const plurals: PluralInfo[] = []
  let text = ''

  const walk = (nodes: MessageFormatElement[]): void => {
    for (const node of nodes) {
      switch (node.type) {
        case TYPE.literal:
          text += node.value
          break
        case TYPE.argument:
        case TYPE.number:
        case TYPE.date:
        case TYPE.time:
          placeholders.push(`{${node.value}}`)
          break
        case TYPE.select:
          placeholders.push(`{${node.value}}`)
          for (const option of Object.values(node.options)) walk(option.value)
          break
        case TYPE.plural:
          placeholders.push(`{${node.value}}`)
          plurals.push({
            argument: node.value,
            ordinal: node.pluralType === 'ordinal',
            options: Object.keys(node.options)
          })
          for (const option of Object.values(node.options)) walk(option.value)
          break
        case TYPE.tag:
          placeholders.push(`<${node.value}>`)
          walk(node.children)
          break
        case TYPE.pound:
          break
      }
      text += ' '
    }
  }

  walk(elements)
  return finalize({
    placeholders,
    linkedKeys: [],
    plurals,
    text: text.replace(/\s+/g, ' ').trim()
  })
}

function humanize(code: string): string {
  return code.toLowerCase().replace(/_/g, ' ')
}
