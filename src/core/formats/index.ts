import type { Format } from '../types.js'
import { describeIcuMessage } from './icu.js'
import type { DescribeOptions, MessageInfo } from './message.js'
import { describePlainMessage } from './plain.js'
import { describeVueMessage } from './vue-i18n.js'

export type { DescribeOptions, MessageInfo, PluralInfo } from './message.js'

const describers: Record<
  Format,
  (source: string, options: DescribeOptions) => MessageInfo
> = {
  'vue-i18n': describeVueMessage,
  'next-intl': describeIcuMessage,
  json: describePlainMessage
}

// Parses each distinct message once
export function createDescriber(
  format: Format,
  options: DescribeOptions = {}
): (source: string) => MessageInfo {
  const describe = describers[format]
  const cache = new Map<string, MessageInfo>()
  return (source) => {
    let info = cache.get(source)
    if (!info) {
      info = describe(source, options)
      cache.set(source, info)
    }
    return info
  }
}
