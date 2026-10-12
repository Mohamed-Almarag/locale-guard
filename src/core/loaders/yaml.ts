import {
  type Document,
  LineCounter,
  isAlias,
  isMap,
  isScalar,
  isSeq,
  parseDocument
} from 'yaml'
import {
  type ParsedEntry,
  type ParsedNode,
  type ParseResult,
  joinKey,
  scalarToString
} from './parsed.js'

export function parseYaml(text: string): ParseResult {
  const lineCounter = new LineCounter()
  const doc = parseDocument(text, { lineCounter, prettyErrors: false })

  const first = doc.errors[0]
  if (first) {
    const { line, col } = lineCounter.linePos(first.pos[0])
    return {
      ok: false,
      message: `Invalid YAML: ${first.message.split('\n')[0]}`,
      line,
      column: col
    }
  }

  const entries: ParsedEntry[] = []
  const nodes: ParsedNode[] = []
  const position = (offset: number) => {
    const { line, col } = lineCounter.linePos(offset)
    return { line, column: col }
  }

  const walk = (node: unknown, prefix: string, path: string[]): void => {
    const resolved = isAlias(node) ? node.resolve(doc as Document) : node

    if (isMap(resolved)) {
      for (const pair of resolved.items) {
        const keyNode = pair.key
        const name = scalarToString(isScalar(keyNode) ? keyNode.value : keyNode)
        const offset = isScalar(keyNode) ? (keyNode.range?.[0] ?? 0) : 0
        visit(
          joinKey(prefix, name),
          [...path, name],
          pair.value,
          position(offset)
        )
      }
    } else if (isSeq(resolved)) {
      resolved.items.forEach((item, index) => {
        const offset =
          isScalar(item) || isMap(item) || isSeq(item)
            ? (item.range?.[0] ?? 0)
            : 0
        visit(
          joinKey(prefix, String(index)),
          [...path, String(index)],
          item,
          position(offset)
        )
      })
    }
  }

  const visit = (
    key: string,
    path: string[],
    value: unknown,
    at: { line: number; column: number }
  ): void => {
    nodes.push({ key, ...at })
    const resolved = isAlias(value) ? value.resolve(doc as Document) : value
    if (isMap(resolved) || isSeq(resolved)) {
      walk(resolved, key, path)
    } else {
      entries.push({
        key,
        path,
        value: scalarToString(isScalar(resolved) ? resolved.value : resolved),
        ...at
      })
    }
  }

  // An empty file, or one with only `---` or comments: a locale with no keys yet
  const contents = doc.contents
  if (contents === null || (isScalar(contents) && contents.value === null)) {
    return { ok: true, entries, nodes }
  }
  if (!isMap(doc.contents)) {
    return {
      ok: false,
      message: 'Expected a map of keys at the top level',
      line: 1,
      column: 1
    }
  }

  walk(doc.contents, '', [])
  return { ok: true, entries, nodes }
}
