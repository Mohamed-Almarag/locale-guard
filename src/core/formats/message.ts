export interface PluralInfo {
  argument: string
  ordinal: boolean
  // As written: `one`, `other`, `=0`
  options: string[]
}

export interface MessageInfo {
  // As written (`{name}`, `<link>`, `@:common.save`), sorted and unique
  placeholders: string[]
  // Keys of vue-i18n linked messages
  linkedKeys: string[]
  plurals: PluralInfo[]
  // Without placeholders or syntax
  text: string
  // The longest branch of a plural or select: `ticket | tickets` is one word
  longestText?: string
  error?: string
}

// Letters with marks, so Hindi or vowelled Arabic stays whole; "E-mail" is one word
export const WORD = /[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*/gu

export function wordCount(text: string, pattern = WORD): number {
  return text.match(pattern)?.length ?? 0
}

export function mostWords(texts: string[]): string {
  return texts.reduce(
    (best, text) => (wordCount(text) > wordCount(best) ? text : best),
    ''
  )
}

export function finalize(
  info: Omit<MessageInfo, 'placeholders'> & { placeholders: Iterable<string> }
): MessageInfo {
  return {
    ...info,
    placeholders: [...new Set(info.placeholders)].sort()
  }
}
