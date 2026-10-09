import {
  type CompileError,
  type MessageNode,
  type ResourceNode,
  createParser
} from '@intlify/message-compiler'
import { type MessageInfo, type PluralInfo, finalize } from './message.js'

// Mirrors NodeTypes from @intlify/message-compiler. It is a `const enum`, which
// cannot be imported under `isolatedModules`.
const PLURAL = 1
const TEXT = 3
const NAMED = 4
const LIST = 5
const LINKED = 6
const LINKED_KEY = 7
const LITERAL = 9

/**
 * Reads a vue-i18n message with the official compiler:
 *   named `{name}`, list `{0}`, linked `@:common.save` / `@.lower:common.save`,
 *   literal `{'@'}`, and plural branches separated by `|`.
 */
export function describeVueMessage(source: string): MessageInfo {
  const errors: CompileError[] = []
  let ast: ResourceNode
  try {
    ast = createParser({
      location: true,
      onError: (error) => errors.push(error)
    }).parse(source)
  } catch (error) {
    return failed(error instanceof Error ? error.message : String(error))
  }

  const first = errors[0]
  if (first) {
    const column = first.location?.start.column
    return failed(
      `Invalid vue-i18n message: ${first.message}${column ? ` (column ${column})` : ''}`
    )
  }

  const placeholders: string[] = []
  const linkedKeys: string[] = []
  const plurals: PluralInfo[] = []
  let text = ''

  const messages: MessageNode[] =
    ast.body.type === PLURAL
      ? (ast.body as { cases: MessageNode[] }).cases
      : [ast.body as MessageNode]
  if (ast.body.type === PLURAL) {
    plurals.push({ kind: 'vue', branches: messages.length })
  }

  for (const message of messages) {
    for (const item of message.items) {
      switch (item.type as number) {
        case TEXT:
        case LITERAL:
          text += (item as { value?: string }).value ?? ''
          break
        case NAMED:
          placeholders.push(`{${(item as { key: string }).key}}`)
          break
        case LIST:
          placeholders.push(`{${(item as { index: number }).index}}`)
          break
        case LINKED: {
          const key = (item as { key: { type: number } }).key
          if (key.type === LINKED_KEY) {
            const value = (key as unknown as { value: string }).value
            linkedKeys.push(value)
            placeholders.push(`@:${value}`)
          } else if (key.type === NAMED) {
            placeholders.push(`@:{${(key as unknown as { key: string }).key}}`)
          } else if (key.type === LIST) {
            placeholders.push(
              `@:{${(key as unknown as { index: number }).index}}`
            )
          }
          break
        }
      }
    }
    text += ' '
  }

  return finalize({ placeholders, linkedKeys, plurals, text: text.trim() })
}

function failed(error: string): MessageInfo {
  return { placeholders: [], linkedKeys: [], plurals: [], text: '', error }
}
