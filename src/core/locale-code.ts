// `ar` for `ar-EG` or `ar_EG`
export function languageOf(code: string): string {
  return code.split(/[-_]/)[0]?.toLowerCase() ?? code
}

// `pt_BR` becomes `pt-BR`; undefined when Intl rejects it
export function intlLocale(code: string): string | undefined {
  try {
    return Intl.getCanonicalLocales(code.replace(/_/g, '-'))[0]
  } catch {
    return undefined
  }
}
