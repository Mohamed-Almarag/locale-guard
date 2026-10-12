import {
  type Node as JsonNode,
  type ParseError,
  parseTree,
  printParseErrorCode
} from 'jsonc-parser'
import {
  LineIndex,
  type ParsedEntry,
  type ParsedNode,
  type ParseResult,
  joinKey,
  scalarToString
} from './parsed.js'

// Comments and trailing commas are errors: apps load these files as strict JSON
export function parseJson(text: string): ParseResult {
  const lines = new LineIndex(text)
  const errors: ParseError[] = []
  const root = parseTree(text, errors, {
    disallowComments: true,
    allowTrailingComma: false,
    allowEmptyContent: false
  })

  const first = errors[0]
  if (first) {
    return {
      ok: false,
      message: describe(printParseErrorCode(first.error)),
      ...lines.position(first.offset)
    }
  }
  if (!root || root.type !== 'object') {
    return {
      ok: false,
      message: 'Expected an object at the top level',
      ...lines.position(root?.offset ?? 0)
    }
  }

  const entries: ParsedEntry[] = []
  const nodes: ParsedNode[] = []

  const walk = (node: JsonNode, prefix: string, path: string[]): void => {
    const children =
      node.type === 'object'
        ? (node.children ?? []).flatMap((property) => {
            const [keyNode, valueNode] = property.children ?? []
            return keyNode && valueNode
              ? [
                  {
                    key: String(keyNode.value),
                    offset: keyNode.offset,
                    value: valueNode
                  }
                ]
              : []
          })
        : (node.children ?? []).map((value, index) => ({
            key: String(index),
            offset: value.offset,
            value
          }))

    for (const child of children) {
      const key = joinKey(prefix, child.key)
      const childPath = [...path, child.key]
      const position = lines.position(child.offset)
      nodes.push({ key, ...position })
      if (child.value.type === 'object' || child.value.type === 'array') {
        walk(child.value, key, childPath)
      } else {
        entries.push({
          key,
          path: childPath,
          value: scalarToString(child.value.value),
          ...position
        })
      }
    }
  }

  walk(root, '', [])
  return { ok: true, entries, nodes }
}

function describe(code: string): string {
  const messages: Record<string, string> = {
    InvalidSymbol: 'Invalid character',
    InvalidNumberFormat: 'Invalid number',
    PropertyNameExpected: 'Expected a key in double quotes',
    ValueExpected: 'Expected a value',
    ColonExpected: 'Expected ":" after the key',
    CommaExpected: 'Expected "," between entries',
    CloseBraceExpected: 'Expected "}"',
    CloseBracketExpected: 'Expected "]"',
    EndOfFileExpected: 'Unexpected content after the end of the JSON',
    InvalidCommentToken: 'Comments are not allowed in JSON',
    UnexpectedEndOfComment: 'Unclosed comment',
    UnexpectedEndOfString: 'Unclosed string',
    UnexpectedEndOfNumber: 'Unfinished number',
    InvalidUnicode: 'Invalid unicode escape',
    InvalidEscapeCharacter: 'Invalid escape character',
    InvalidCharacter: 'Invalid character in string'
  }
  return `Invalid JSON: ${messages[code] ?? code}`
}
