import { afterEach, describe, expect, it } from 'vitest'
import { CONFIG, DEFAULT_CONFIG } from '../src/game/config'
import { tuning } from '../src/game/tuning'

const defaults = Object.fromEntries(tuning.controls.map(control => [control.id, control.default]))
afterEach(() => {
  tuning.apply(defaults)
  tuning.activate('mission')
  tuning.activate('landing')
})

describe('Oy Missiyasi Tweak', () => {
  it('exposes the live lunar-simulation parameters instead of inherited platformer controls', () => {
    expect(tuning.controls.map(control => control.id)).toEqual([
      'mission.lunarGravity', 'mission.thrustAcceleration', 'mission.landingBurstImpulse',
      'mission.safeLandingSpeed', 'mission.safeLandingRadius', 'mission.roverSpeed',
      'mission.interactionRadius', 'mission.oxygenDrain', 'mission.cameraFollow',
    ])
    expect(tuning.controls.find(control => control.id === 'mission.roverSpeed')?.applyMode).toBe('NEXT_ACTION')
    expect(tuning.controls.find(control => control.id === 'mission.thrustAcceleration')?.applyMode).toBe('NEXT_ACTION')
    expect(tuning.controls.find(control => control.id === 'mission.cameraFollow')?.integrity).toBe('COSMETIC')
    for (const control of tuning.controls) expect(control.default).toBe(CONFIG.mission[control.id.split('.')[1] as keyof typeof CONFIG.mission])
  })

  it('validates the entire patch atomically and keeps source defaults immutable', () => {
    const before = tuning.read()
    for (const patch of [{ 'mission.roverSpeed': 5, 'mission.safeLandingSpeed': 99 }, { 'mission.roverSpeed': 9 },
      { 'mission.roverSpeed': 4.3 }, { 'mission.roverSpeed': '8' }, { 'mission.cameraFollow': Infinity }, { unknown: 4 }]) {
      expect(() => tuning.apply(patch)).toThrow()
      expect(tuning.read()).toEqual(before)
    }
    tuning.apply({ 'mission.roverSpeed': 5 })
    expect(CONFIG.mission.roverSpeed).toBe(DEFAULT_CONFIG.mission.roverSpeed)
    expect(DEFAULT_CONFIG.mission.roverSpeed).toBe(4.2)
    const applied = tuning.read(); tuning.apply({ 'mission.roverSpeed': 5 }); expect(tuning.read()).toEqual(applied)
  })

  it('applies assembly/landing parameters only at their mission boundary but camera tuning live', () => {
    tuning.apply({ 'mission.roverSpeed': 5, 'mission.thrustAcceleration': 6.2, 'mission.cameraFollow': 3.4 })
    expect(CONFIG.mission.cameraFollow).toBe(3.4)
    expect(CONFIG.mission.roverSpeed).toBe(DEFAULT_CONFIG.mission.roverSpeed)
    expect(CONFIG.mission.thrustAcceleration).toBe(DEFAULT_CONFIG.mission.thrustAcceleration)
    tuning.activate('mission')
    expect(CONFIG.mission.roverSpeed).toBe(5)
    expect(CONFIG.mission.thrustAcceleration).toBe(6.2)
    tuning.apply({ 'mission.thrustAcceleration': 7.1 })
    expect(CONFIG.mission.thrustAcceleration).toBe(6.2)
    tuning.activate('landing')
    expect(CONFIG.mission.thrustAcceleration).toBe(7.1)
  })

  it('keeps cosmetic changes ranked, then latches gameplay tuning until a clean new mission', () => {
    tuning.activate('mission')
    tuning.apply({ 'mission.cameraFollow': 3.4 })
    expect(tuning.unranked).toBe(false)
    tuning.apply({ 'mission.roverSpeed': 5 })
    expect(tuning.unranked).toBe(false)
    tuning.activate('mission')
    expect(tuning.unranked).toBe(true)
    tuning.apply(defaults)
    expect(tuning.unranked).toBe(true)
    tuning.activate('landing')
    expect(tuning.unranked).toBe(true)
    tuning.activate('mission')
    expect(tuning.unranked).toBe(false)
  })
})
