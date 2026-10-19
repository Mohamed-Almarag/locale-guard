import {
  type MessageFormatElement,
  TYPE,
  parse
} from '@formatjs/icu-messageformat-parser'
import {
  type DescribeOptions,
  type MessageInfo,
  type PluralInfo,
  finalize,
  mostWords
} from './message.js'

// Markup in the text when tags are read as text, as intl-messageformat's ignoreTag does
const MARKUP = /<\/?[^<>]*>/g

export function describeIcuMessage(
  source: string,
  { ignoreTags = false }: DescribeOptions = {}
): MessageInfo {
  let elements: MessageFormatElement[]
  try {
    // plural-forms reports a missing `other` with a clearer message
    elements = parse(source, {
      requiresOtherClause: false,
      ignoreTag: ignoreTags
    })
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
  const clean = (value: string) =>
    (ignoreTags ? value.replace(MARKUP, ' ') : value)
      .replace(/\s+/g, ' ')
      .trim()
  return finalize({
    placeholders,
    linkedKeys: [],
    plurals,
    text: clean(text),
    longestText: hasBranches(elements)
      ? clean(longestRendering(elements))
      : undefined
  })
}

function hasBranches(nodes: MessageFormatElement[]): boolean {
  return nodes.some(
    (node) =>
      node.type === TYPE.plural ||
      node.type === TYPE.select ||
      (node.type === TYPE.tag && hasBranches(node.children))
  )
}

// Takes the branch with the most words at each plural or select
function longestRendering(nodes: MessageFormatElement[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case TYPE.literal:
          return node.value
        case TYPE.plural:
        case TYPE.select:
          return mostWords(
            Object.values(node.options).map((option) =>
              longestRendering(option.value)
            )
          )
        case TYPE.tag:
          return longestRendering(node.children)
        default:
          return ' '
      }
    })
    .join(' ')
}

function humanize(code: string): string {
  return code.toLowerCase().replace(/_/g, ' ')
}
