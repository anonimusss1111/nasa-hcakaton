import { describe, expect, it } from 'vitest'
import { QUALITY_PRESETS } from '../src/engine/renderer'

describe('quality presets', () => {
  it('reserves shadow maps for high quality', () => {
    expect(QUALITY_PRESETS.low.shadows).toBe(false)
    expect(QUALITY_PRESETS.medium.shadows).toBe(false)
    expect(QUALITY_PRESETS.high.shadows).toBe(true)
  })
})
