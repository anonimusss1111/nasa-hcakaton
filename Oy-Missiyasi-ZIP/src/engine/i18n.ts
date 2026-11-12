import en from '../i18n/en.json'
import zh from '../i18n/zh-CN.json'
import uz from '../i18n/uz.json'
import type { Locale } from './save'

export type GameLocale = Locale | 'uz'
export type Dictionary = Record<string, string>
const DICTIONARIES: Record<GameLocale, Dictionary> = { en, 'zh-CN': zh, uz }

/** Map a browser locale list to a supported locale: any zh* → Simplified Chinese, else English. */
export function detectLocale(languages: readonly string[] | undefined): Locale {
  const first = (languages ?? []).find(Boolean) ?? ''
  return first.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

/** A saved player choice always wins over browser detection. */
export function resolveLocale(saved: Locale | '', languages: readonly string[] | undefined): Locale {
  return saved === 'en' || saved === 'zh-CN' ? saved : detectLocale(languages)
}

export class I18n {
  locale: GameLocale
  private listeners = new Set<(locale: GameLocale) => void>()

  constructor(locale: GameLocale) {
    this.locale = locale
    document.documentElement.lang = locale
  }

  /** Look up `key`, replacing `{name}` placeholders. Missing keys render the key so gaps are visible. */
  t(key: string, vars: Record<string, string | number> = {}): string {
    const text = DICTIONARIES[this.locale][key] ?? DICTIONARIES.en[key] ?? key
    return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`))
  }

  set(locale: GameLocale): void {
    if (locale === this.locale) return
    this.locale = locale
    document.documentElement.lang = locale
    for (const fn of this.listeners) fn(locale)
  }

  onChange(fn: (locale: GameLocale) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}

export const DICTIONARY_KEYS = { en: Object.keys(en), zh: Object.keys(zh), uz: Object.keys(uz) }
