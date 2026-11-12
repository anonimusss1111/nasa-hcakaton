import { describe, expect, it } from 'vitest'
import {
  createAscentState,
  createCircularEarthOrbit,
  createEarthMoonState,
  applyProgradeBurn,
  captureIntoLunarOrbit,
  classifyLandingOutcome,
  descentAutopilotThrottle,
  earthMoonDistanceM,
  EARTH_MOON_DISTANCE_M,
  earthOrbitElements,
  EARTH_RADIUS_M,
  EARTH_MU_M3PS2,
  hornSlopeDegrees,
  integrateVacuumBurnDeltaVMps,
  rocketEquationDeltaVMps,
  stepAscent,
  stepConstantGravity,
  stepTwoBody,
  stepEarthMoon,
  stepLunarDescent,
  targetAscentFlightPathAngleRad,
} from '../src/sim/physics'

describe('mission physics', () => {
  it('numerically reproduces the Tsiolkovsky rocket equation in vacuum', () => {
    const initialMassKg = 120_000
    const propellantKg = 80_000
    const finalMassKg = initialMassKg - propellantKg
    const numericalDeltaVMps = integrateVacuumBurnDeltaVMps(initialMassKg, propellantKg, 800, 350, 1 / 1200)
    const analyticDeltaVMps = rocketEquationDeltaVMps(initialMassKg, finalMassKg, 350)

    expect(numericalDeltaVMps).toBeCloseTo(analyticDeltaVMps, 1)
  })

  it('integrates a guided ascent into a stable 185 km orbit', () => {
    const state = createAscentState()
    let previousStage = state.stageIndex
    const stageTimes: number[] = []
    const snapshots: Array<{ timeS: number; altitudeKm: number; speedKmps: number; flightPathAngleDeg: number; stage: number }> = []
    let nextSnapshotS = 60
    for (let elapsed = 0; elapsed < 900 && !state.insertionComplete; elapsed += 1 / 60) {
      stepAscent(state, 1 / 60)
      if (state.stageIndex > previousStage) {
        stageTimes.push(state.elapsedSeconds)
        previousStage = state.stageIndex
      }
      if (state.elapsedSeconds >= nextSnapshotS) {
        const radiusM = Math.hypot(state.downrangeM, state.positionYM)
        const radialSpeedMps = state.downrangeVelocityMps * state.downrangeM / radiusM + state.verticalVelocityMps * state.positionYM / radiusM
        const speedMps = Math.hypot(state.downrangeVelocityMps, state.verticalVelocityMps)
        snapshots.push({
          timeS: state.elapsedSeconds,
          altitudeKm: state.altitudeM / 1_000,
          speedKmps: speedMps / 1_000,
          flightPathAngleDeg: Math.asin(radialSpeedMps / speedMps) * 180 / Math.PI,
          stage: state.stageIndex,
        })
        nextSnapshotS += 60
      }
    }

    expect(state.stageIndex).toBeGreaterThanOrEqual(2)
    expect(state.maxDynamicPressurePa).toBeGreaterThan(0)
    expect(stageTimes.length).toBeGreaterThanOrEqual(2)
    expect(state.stageDebris[0].stageIndex).toBe(0)
    expect(state.stageDebris[1].stageIndex).toBe(1)
    expect(state.stageDebris[0].downrangeM).not.toBe(0)
    expect(state.stageDebris[1].downrangeM).not.toBe(0)
    const orbit = earthOrbitElements({
      xM: state.downrangeM,
      yM: state.positionYM,
      vxMps: state.downrangeVelocityMps,
      vyMps: state.verticalVelocityMps,
    })
    expect(state.insertionComplete, JSON.stringify({
      altitudeM: state.altitudeM,
      speedMps: Math.hypot(state.downrangeVelocityMps, state.verticalVelocityMps),
      perigeeAltitudeM: orbit.perigeeAltitudeM,
      apogeeAltitudeM: orbit.apogeeAltitudeM,
      throttle: state.throttle,
      stageIndex: state.stageIndex,
    })).toBe(true)
    expect(Math.abs(orbit.perigeeAltitudeM - 185_000) / 185_000).toBeLessThan(0.02)
    expect(Math.abs(orbit.apogeeAltitudeM - 185_000) / 185_000).toBeLessThan(0.02)
    expect(Math.hypot(state.downrangeVelocityMps, state.verticalVelocityMps)).toBeCloseTo(7_800, -2)
  })

  it('uses altitude feedback to pitch from vertical to horizontal', () => {
    expect(targetAscentFlightPathAngleRad(0)).toBeCloseTo(Math.PI / 2)
    expect(targetAscentFlightPathAngleRad(50_000)).toBeLessThan(Math.PI / 4)
    expect(targetAscentFlightPathAngleRad(185_000)).toBe(0)
  })

  it('keeps a 185-km circular orbit within one percent for one revolution', () => {
    const state = createCircularEarthOrbit(185_000)
    const initialRadiusM = Math.hypot(state.xM, state.yM)
    const initialSpeedMps = Math.hypot(state.vxMps, state.vyMps)
    const periodSeconds = 2 * Math.PI * Math.sqrt(initialRadiusM ** 3 / EARTH_MU_M3PS2)
    expect(initialSpeedMps).toBeGreaterThan(7_700)
    expect(initialSpeedMps).toBeLessThan(7_900)

    for (let elapsed = 0; elapsed < periodSeconds; elapsed += 1 / 120) stepTwoBody(state, 1 / 120)
    const finalRadiusM = Math.hypot(state.xM, state.yM)
    expect(Math.abs(finalRadiusM - initialRadiusM) / initialRadiusM).toBeLessThan(0.01)
  })

  it('conserves orbital energy to better than 0.1 percent per revolution', () => {
    const state = createCircularEarthOrbit(185_000)
    const radiusM = Math.hypot(state.xM, state.yM)
    const initialEnergy = 0.5 * (state.vxMps ** 2 + state.vyMps ** 2) - EARTH_MU_M3PS2 / radiusM
    const periodSeconds = 2 * Math.PI * Math.sqrt(radiusM ** 3 / EARTH_MU_M3PS2)

    for (let elapsed = 0; elapsed < periodSeconds; elapsed += 1 / 120) stepTwoBody(state, 1 / 120)
    const finalRadiusM = Math.hypot(state.xM, state.yM)
    const finalEnergy = 0.5 * (state.vxMps ** 2 + state.vyMps ** 2) - EARTH_MU_M3PS2 / finalRadiusM
    expect(Math.abs(finalEnergy - initialEnergy) / Math.abs(initialEnergy)).toBeLessThan(0.001)
  })

  it('integrates a phased translunar transfer and lunar-orbit insertion', () => {
    const radiusM = EARTH_RADIUS_M + 185_000
    const state = createEarthMoonState({
      xM: radiusM,
      yM: 0,
      vxMps: 0,
      vyMps: Math.sqrt(EARTH_MU_M3PS2 / radiusM),
    }, 114.5 * Math.PI / 180)
    applyProgradeBurn(state, 3_135)
    let closestDistanceM = EARTH_MOON_DISTANCE_M
    let captureDeltaVMps = 0

    for (let elapsed = 0; elapsed < 5 * 24 * 60 * 60; elapsed += 30) {
      stepEarthMoon(state, 30)
      const distance = earthMoonDistanceM(state)
      closestDistanceM = Math.min(closestDistanceM, distance)
      if (distance <= 3_000_000) {
        captureDeltaVMps = captureIntoLunarOrbit(state)
        break
      }
    }

    expect(closestDistanceM).toBeLessThan(3_000_000)
    expect(captureDeltaVMps).toBeGreaterThan(0)
    expect(captureDeltaVMps).toBeLessThan(2_500)
  })

  it('compresses the powered demo transfer into its twelve-second slot', () => {
    const radiusM = EARTH_RADIUS_M + 185_000
    const state = createEarthMoonState({
      xM: radiusM,
      yM: 0,
      vxMps: 0,
      vyMps: Math.sqrt(EARTH_MU_M3PS2 / radiusM),
    }, 115 * Math.PI / 180)
    const semiMajorAxisM = (radiusM + EARTH_MOON_DISTANCE_M) / 2
    const transferSpeed = Math.sqrt(EARTH_MU_M3PS2 * (2 / radiusM - 1 / semiMajorAxisM))
    applyProgradeBurn(state, transferSpeed - Math.hypot(state.vxMps, state.vyMps))
    let captured = false
    for (let elapsed = 0; elapsed < 12 && !captured; elapsed += 1 / 60) {
      let remaining = Math.min((1 / 60) * 3.6 * 10_000, 900)
      while (remaining > 0) {
        const step = Math.min(remaining, 30)
        stepEarthMoon(state, step)
        remaining -= step
        if (earthMoonDistanceM(state) <= 3_000_000) {
          captureIntoLunarOrbit(state)
          captured = true
          break
        }
      }
    }

    expect(captured).toBe(true)
    expect(state.elapsedSeconds).toBeLessThanOrEqual(5 * 24 * 60 * 60)
  })

  it('carries the guided ascent state through TLI to the Moon', () => {
    const ascent = createAscentState()
    for (let elapsed = 0; elapsed < 900 && !ascent.insertionComplete; elapsed += 1 / 60) {
      stepAscent(ascent, 1 / 60)
    }
    expect(ascent.insertionComplete).toBe(true)
    const angle = Math.atan2(ascent.positionYM, ascent.downrangeM)
    const direction = ascent.downrangeM * ascent.verticalVelocityMps
      - ascent.positionYM * ascent.downrangeVelocityMps >= 0 ? 1 : -1
    const transit = createEarthMoonState({
      xM: ascent.downrangeM,
      yM: ascent.positionYM,
      vxMps: ascent.downrangeVelocityMps,
      vyMps: ascent.verticalVelocityMps,
    }, angle + direction * 115 * Math.PI / 180)
    const radiusM = Math.hypot(transit.xM, transit.yM)
    const currentSpeed = Math.hypot(transit.vxMps, transit.vyMps)
    const transferSemiMajorAxisM = (radiusM + EARTH_MOON_DISTANCE_M) / 2
    const transferSpeed = Math.sqrt(EARTH_MU_M3PS2 * (2 / radiusM - 1 / transferSemiMajorAxisM))
    applyProgradeBurn(transit, transferSpeed - currentSpeed)

    let closestDistanceM = EARTH_MOON_DISTANCE_M
    let captureDeltaVMps = 0
    for (let elapsed = 0; elapsed < 5 * 24 * 60 * 60; elapsed += 30) {
      stepEarthMoon(transit, 30)
      const distanceM = earthMoonDistanceM(transit)
      closestDistanceM = Math.min(closestDistanceM, distanceM)
      if (distanceM <= 3_000_000) {
        captureDeltaVMps = captureIntoLunarOrbit(transit)
        break
      }
    }
    expect(closestDistanceM).toBeLessThan(3_000_000)
    expect(captureDeltaVMps).toBeGreaterThan(0)
  })

  it('matches lunar free-fall time from 100 m', () => {
    const state = { altitudeM: 100, velocityMps: 0 }
    let elapsed = 0
    while (state.altitudeM > 0) {
      stepConstantGravity(state, 1 / 120, 1.62)
      elapsed += 1 / 120
    }
    expect(elapsed).toBeCloseTo(Math.sqrt(2 * 100 / 1.62), 1)
  })

  it('uses lunar gravity and fuel-limited descent thrust', () => {
    const descent = { altitudeM: 100, verticalSpeedMps: 0, fuelPercent: 100 }
    stepLunarDescent(descent, 0, 1)
    expect(descent.verticalSpeedMps).toBeCloseTo(-1.62, 2)
    const throttle = descentAutopilotThrottle(100, -8)
    expect(throttle).toBeGreaterThan(0)
    stepLunarDescent(descent, 1, 1)
    expect(descent.verticalSpeedMps).toBeGreaterThan(-1.62)
    expect(descent.fuelPercent).toBeCloseTo(97.4, 1)
  })

  it('grades landing by impact speed, attitude, slope, and difficulty', () => {
    expect(classifyLandingOutcome(0.5, 2, 1, true, 'normal', 3.2)).toBe('perfect')
    expect(classifyLandingOutcome(2.2, 7, 5, true, 'normal', 3.2)).toBe('hard')
    expect(classifyLandingOutcome(2.5, 7, 5, true, 'hard', 3.2)).toBe('crash')
    expect(classifyLandingOutcome(0.5, 2, 1, false, 'easy', 3.2)).toBe('crash')
  })

  it('estimates the slope of a tilted DEM plane with the Horn kernel', () => {
    const elevations = [-0.1, 0, 0.1, -0.1, 0, 0.1, -0.1, 0, 0.1]
    expect(hornSlopeDegrees(elevations, 1)).toBeCloseTo(Math.atan(0.1) * 180 / Math.PI, 3)
  })
})