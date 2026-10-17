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

// A 2 or 3 letter language, as every real locale has: Intl alone accepts
// `themes` as a 6 letter language
export function isLocaleCode(code: string): boolean {
  return Boolean(intlLocale(code)) && /^[a-z]{2,3}$/i.test(languageOf(code))
}

// The code wherever it stands alone in the path: `locales/ar/x.json`,
// `devise.ar.yml`, `main-ar.json`
export function replaceLocale(path: string, from: string, to: string): string {
  const code = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return path.replace(
    new RegExp(`(^|[/._-])${code}(?=$|[/._-])`, 'g'),
    (_, before: string) => `${before}${to}`
  )
}
