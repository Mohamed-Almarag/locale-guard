import type { CheckId } from '../types.js'
import { brokenLinkedMessages } from './broken-linked-messages.js'
import type { Check } from './context.js'
import { emptyValues } from './empty-values.js'
import { extraKeys } from './extra-keys.js'
import { invalidSyntax } from './invalid-syntax.js'
import { missingKeys } from './missing-keys.js'
import { placeholderMismatch } from './placeholder-mismatch.js'
import { pluralForms } from './plural-forms.js'
import { untranslated } from './untranslated.js'

export const checks: Record<Exclude<CheckId, 'parse-error'>, Check> = {
  'missing-keys': missingKeys,
  'extra-keys': extraKeys,
  'empty-values': emptyValues,
  'invalid-syntax': invalidSyntax,
  'placeholder-mismatch': placeholderMismatch,
  'broken-linked-messages': brokenLinkedMessages,
  untranslated,
  'plural-forms': pluralForms
}
