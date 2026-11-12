import { describe, expect, it } from 'vitest'
import { DEMO_DURATION_SECONDS, DEMO_MAX_DURATION_SECONDS, DEMO_PHASES, DemoDirector } from '../src/game/demo/director'

describe('60-second demo director', () => {
  it('covers the complete timeline without gaps or overlaps', () => {
    expect(DEMO_PHASES[0]?.start).toBe(0)
    for (let index = 1; index < DEMO_PHASES.length; index += 1) {
      expect(DEMO_PHASES[index]?.start).toBe(DEMO_PHASES[index - 1]?.end)
    }
    expect(DEMO_PHASES.at(-1)?.end).toBe(DEMO_DURATION_SECONDS)
  })

  it('advances deterministically, supports pause and skip, and caps at 60 seconds', () => {
    const director = new DemoDirector()
    director.start()
    director.update(7.5)
    expect(director.phase).toBe('countdown')
    director.paused = true
    director.update(20)
    expect(director.elapsedSeconds).toBe(7.5)
    director.paused = false
    director.skipPhase()
    expect(director.phase).toBe('ascent')
    director.update(100)
    expect(director.elapsedSeconds).toBe(DEMO_DURATION_SECONDS)
    expect(director.active).toBe(false)
  })

  it('ignores invalid and non-positive frame durations', () => {
    const director = new DemoDirector()
    director.start()
    director.update(Number.NaN)
    director.update(-1)
    expect(director.elapsedSeconds).toBe(0)
  })

  it('accepts a site choice during navigation and recommends one after eight seconds', () => {
    const director = new DemoDirector()
    director.start()
    director.update(34)
    expect(director.phase).toBe('navigator')
    expect(director.selectSite('tranquillitatis')).toBe(true)
    expect(director.selectedSiteId).toBe('tranquillitatis')
    director.start()
    director.update(42)
    expect(director.selectedSiteId).toBe(director.recommendedSiteId)
  })

  it('allows only a five-second landing fail-safe extension', () => {
    const director = new DemoDirector()
    director.start()
    director.update(58)
    director.waitForLanding()
    director.update(4)
    expect(director.elapsedSeconds).toBe(62)
    expect(director.active).toBe(true)
    director.update(10)
    expect(director.elapsedSeconds).toBe(DEMO_MAX_DURATION_SECONDS)
    expect(director.active).toBe(false)
    director.landingComplete()
    expect(director.elapsedSeconds).toBe(DEMO_MAX_DURATION_SECONDS)
    expect(DEMO_DURATION_SECONDS).toBe(60)
  })
})
