export type PluralInfo =
  | {
      kind: 'icu'
      argument: string
      ordinal: boolean
      /** Option keys as written, e.g. `one`, `other`, `=0`. */
      options: string[]
    }
  | { kind: 'vue'; branches: number }

/** What a check needs to know about one translated message, in any format. */
export interface MessageInfo {
  /** Placeholders as the user writes them: `{name}`, `{0}`, `<link>`, `@:common.save`. Sorted, unique. */
  placeholders: string[]
  /** Keys referenced with vue-i18n linked messages (`@:common.save`). */
  linkedKeys: string[]
  plurals: PluralInfo[]
  /** The literal text only, without placeholders or syntax. */
  text: string
  /** Set when the message cannot be parsed. */
  error?: string
}

export function finalize(
  info: Omit<MessageInfo, 'placeholders'> & { placeholders: Iterable<string> }
): MessageInfo {
  return {
    ...info,
    placeholders: [...new Set(info.placeholders)].sort()
  }
}
