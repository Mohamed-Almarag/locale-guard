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
