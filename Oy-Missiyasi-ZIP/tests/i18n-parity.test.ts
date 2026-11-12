import { describe, expect, it } from 'vitest'
import en from '../src/i18n/en.json'
import uz from '../src/i18n/uz.json'

// Regression: en.json lacked 102 keys that the mission UI uses, so English players saw raw keys
// such as "transit.kicker". Every key the Uzbek dictionary defines must exist in English too.
describe('i18n key parity', () => {
  it('English dictionary covers every key the Uzbek dictionary defines', () => {
    const missing = Object.keys(uz).filter(key => !(key in en))
    expect(missing).toEqual([])
  })
})
