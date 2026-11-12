import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '../src/i18n/en.json'
import zh from '../src/i18n/zh-CN.json'
import uz from '../src/i18n/uz.json'
import { detectLocale, I18n, resolveLocale } from '../src/engine/i18n'

afterEach(() => vi.unstubAllGlobals())

describe('i18n', () => {
  it('detects Chinese browsers and defaults to English', () => {
    expect(detectLocale(['zh-CN', 'en'])).toBe('zh-CN')
    expect(detectLocale(['zh-TW'])).toBe('zh-CN')
    expect(detectLocale(['ZH'])).toBe('zh-CN')
    expect(detectLocale(['en-US', 'zh-CN'])).toBe('en')
    expect(detectLocale([])).toBe('en')
    expect(detectLocale(undefined)).toBe('en')
  })

  it('lets a saved choice win over detection', () => {
    expect(resolveLocale('en', ['zh-CN'])).toBe('en')
    expect(resolveLocale('zh-CN', ['en-US'])).toBe('zh-CN')
    expect(resolveLocale('', ['zh-CN'])).toBe('zh-CN')
  })

  it('has the same keys and placeholders in every language', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()
    for (const [key, value] of Object.entries(en)) expect(vars((zh as Record<string, string>)[key]), key).toEqual(vars(value))
    expect(Object.keys(uz).length).toBeGreaterThan(100)
    expect(uz['game.title']).toContain('OY')
  })

  it('provides the Uzbek catalogue directly instead of switching with browser locale', () => {
    vi.stubGlobal('document', { documentElement: { lang: 'en' } })
    const pinned = new I18n('uz')
    expect(pinned.t('game.title')).toBe((uz as Record<string, string>)['game.title'])
    expect(document.documentElement.lang).toBe('uz')
  })
})
