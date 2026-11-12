import { describe, expect, it } from 'vitest'
import { stepLunarDescent, type DescentState } from '../src/sim/descent'
import { updateAutoLandingGuidance } from '../src/sim/auto-guidance'

function state(): DescentState {
  return {
    altitudeM: 100,
    verticalSpeedMps: 0,
    xM: 0,
    zM: 0,
    horizontalVelocityXMps: 0,
    horizontalVelocityZMps: 0,
    pitchRad: 0,
    rollRad: 0,
    pitchRateRadS: 0,
    rollRateRadS: 0,
    fuelPercent: 100,
    throttle: 0,
    slopeDegrees: 2,
    safeZoneRadiusM: 100,
    landed: false,
    outcome: null,
  }
}

describe('demo lunar descent integrator', () => {
  it('uses lunar gravity and a bounded throttle to control vertical motion', () => {
    const descent = state()
    stepLunarDescent(descent, 1, { throttle: 0, lateralX: 0, lateralZ: 0 })
    expect(descent.verticalSpeedMps).toBeCloseTo(-1.62, 1)
    const fuel = descent.fuelPercent
    stepLunarDescent(descent, 1, { throttle: 4, lateralX: 0, lateralZ: 0 })
    expect(descent.throttle).toBe(1)
    expect(descent.fuelPercent).toBeLessThan(fuel)
    expect(descent.verticalSpeedMps).toBeGreaterThan(-1.62)
  })

  it('returns deterministic landing grades and stops after touchdown', () => {
    const descent = state()
    descent.altitudeM = 0.005
    descent.verticalSpeedMps = -0.5
    stepLunarDescent(descent, 1 / 60, { throttle: 0, lateralX: 0, lateralZ: 0 })
    expect(descent.landed).toBe(true)
    expect(descent.outcome).toBe('perfect')
    const finalAltitude = descent.altitudeM
    stepLunarDescent(descent, 1, { throttle: 1, lateralX: 1, lateralZ: 1 })
    expect(descent.altitudeM).toBe(finalAltitude)
  })

  it('grades steep or fast touchdown as a crash', () => {
    const descent = state()
    descent.altitudeM = 0.01
    descent.verticalSpeedMps = -12
    descent.slopeDegrees = 18
    stepLunarDescent(descent, 1 / 60, { throttle: 0, lateralX: 0, lateralZ: 0 })
    expect(descent.outcome).toBe('crash')
  })

  it('auto-lands safely from varied lateral start offsets', () => {
    let seed = 0x60de
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0x1_0000_0000
    }
    for (let run = 0; run < 100; run += 1) {
      const descent = state()
      descent.altitudeM = 100
      descent.verticalSpeedMps = -14
      descent.xM = (random() * 2 - 1) * 70
      descent.zM = (random() * 2 - 1) * 70
      descent.horizontalVelocityXMps = (random() * 2 - 1) * 4
      descent.horizontalVelocityZMps = (random() * 2 - 1) * 4
      descent.slopeDegrees = 16
      descent.safeZoneRadiusM = 55 / 1.35
      const controls = { throttle: 0, lateralX: 0, lateralZ: 0 }
      for (let elapsed = 0; elapsed < 14 && !descent.landed; elapsed += 1 / 60) {
        updateAutoLandingGuidance(descent, controls)
        stepLunarDescent(descent, 1 / 60, controls)
      }

      expect(descent.landed, `auto-landing case ${run} did not reach the surface`).toBe(true)
      expect(['perfect', 'safe'], `case ${run}: outcome=${descent.outcome}, offset=${Math.hypot(descent.xM, descent.zM)}, speed=${descent.verticalSpeedMps}, hspeed=${Math.hypot(descent.horizontalVelocityXMps, descent.horizontalVelocityZMps)}`).toContain(descent.outcome)
      expect(Math.hypot(descent.xM, descent.zM)).toBeLessThanOrEqual(descent.safeZoneRadiusM)
      expect(descent.fuelPercent).toBeGreaterThan(70)
    }
  })
})
