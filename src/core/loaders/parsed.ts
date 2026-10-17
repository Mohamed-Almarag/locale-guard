import type { Position } from '../types.js'

export interface ParsedEntry extends Position {
  key: string
  // A flat `"cart.title"` stays one segment
  path: string[]
  value: string
}

export interface ParsedNode extends Position {
  key: string
}

export type ParseResult =
  | { ok: true; entries: ParsedEntry[]; nodes: ParsedNode[] }
  | { ok: false; message: string; line: number; column: number }

// Character offsets to 1-based line and column
export class LineIndex {
  private readonly starts: number[] = [0]

  constructor(text: string) {
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') this.starts.push(i + 1)
    }
  }

  position(offset: number): Position {
    let low = 0
    let high = this.starts.length - 1
    while (low < high) {
      const mid = (low + high + 1) >> 1
      if ((this.starts[mid] as number) <= offset) low = mid
      else high = mid - 1
    }
    return { line: low + 1, column: offset - (this.starts[low] as number) + 1 }
  }
}

export function joinKey(parent: string, key: string): string {
  return parent ? `${parent}.${key}` : key
}

export function scalarToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

export type ParsedFile = Extract<ParseResult, { ok: true }>

// Rails wraps a file in its locale: `en:` in en.yml. Unwrapped only when that
// is the file's single top key, it holds keys, and it is the file's locale or
// the base locale, since some projects wrap every file in `en`
export function unwrapLocaleRoot(
  parsed: ParsedFile,
  locales: string[]
): ParsedFile & { root?: string } {
  const normal = (code: string) => code.toLowerCase().replace(/_/g, '-')
  const codes = locales.map(normal)
  const root = parsed.nodes.find((node) =>
    codes.includes(normal(node.key))
  )?.key
  if (!root) return parsed

  // `bs:` and nothing else: a locale with no keys yet
  const [only] = parsed.entries
  if (
    parsed.nodes.length === 1 &&
    parsed.entries.length === 1 &&
    only?.path.length === 1 &&
    only.value === ''
  ) {
    return { ok: true, root, entries: [], nodes: [] }
  }

  const inside = (key: string) => key.startsWith(`${root}.`)
  const wrapped =
    parsed.nodes.every((node) => node.key === root || inside(node.key)) &&
    parsed.entries.every(
      (entry) => entry.path[0] === root && entry.path.length > 1
    )
  if (!wrapped) return parsed

  const strip = (key: string) => key.slice(root.length + 1)
  return {
    ok: true,
    root,
    entries: parsed.entries.map((entry) => ({
      ...entry,
      key: strip(entry.key),
      path: entry.path.slice(1)
    })),
    nodes: parsed.nodes
      .filter((node) => node.key !== root)
      .map((node) => ({ ...node, key: strip(node.key) }))
  }
}
