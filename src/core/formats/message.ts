/** An ICU `plural` or `selectordinal` argument. */
export interface PluralInfo {
  argument: string
  ordinal: boolean
  /** Option keys as written, e.g. `one`, `other`, `=0`. */
  options: string[]
}

/** What a check needs to know about one translated message, in any format. */
export interface MessageInfo {
  /** Placeholders as the user writes them: `{name}`, `{0}`, `<link>`, `@:common.save`. Sorted, unique. */
  placeholders: string[]
  /** Keys referenced with vue-i18n linked messages (`@:common.save`). */
  linkedKeys: string[]
  plurals: PluralInfo[]
  /** The literal text only, without placeholders or syntax. */
  text: string
  /**
   * For a message with plural or select branches: the text a user sees at most
   * in one rendering. `ticket | tickets` is one word, not two.
   */
  longestText?: string
  /** Set when the message cannot be parsed. */
  error?: string
}

/** Letters plus combining marks, so Hindi or vowelled Arabic words stay whole; "E-mail" is one word. */
export const WORD = /[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*/gu

export function wordCount(text: string, pattern = WORD): number {
  return text.match(pattern)?.length ?? 0
}

/** The text with the most words, e.g. the longest plural branch. */
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
