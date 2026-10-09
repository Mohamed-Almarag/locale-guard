import type { CheckId } from '../types.js'
import type { Check } from './context.js'
import { emptyValues } from './empty-values.js'
import { extraKeys } from './extra-keys.js'
import { missingKeys } from './missing-keys.js'

export const checks: Partial<Record<CheckId, Check>> = {
  'missing-keys': missingKeys,
  'extra-keys': extraKeys,
  'empty-values': emptyValues
}
