import type { CheckId } from '../types.js'
import { brokenLinkedMessages } from './broken-linked-messages.js'
import type { Check } from './context.js'
import { emptyValues } from './empty-values.js'
import { extraKeys } from './extra-keys.js'
import { invalidSyntax } from './invalid-syntax.js'
import { missingKeys } from './missing-keys.js'
import { placeholderMismatch } from './placeholder-mismatch.js'

export const checks: Partial<Record<CheckId, Check>> = {
  'missing-keys': missingKeys,
  'extra-keys': extraKeys,
  'empty-values': emptyValues,
  'invalid-syntax': invalidSyntax,
  'placeholder-mismatch': placeholderMismatch,
  'broken-linked-messages': brokenLinkedMessages
}
