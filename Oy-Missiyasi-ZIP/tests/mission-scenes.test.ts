import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { LaunchScene, MissionSceneMachine } from '../src/game/scenes/mission-scenes'
import { LaunchMissionScene, launchThrottleAtSeconds } from '../src/game/scenes/launch'
import { createAtmosphereStrata } from '../src/game/atmosphere-strata'
import { createAscentState, stepAscent } from '../src/sim/physics'

describe('mission scene machine', () => {
  it('runs enter, update, and exit exactly once per transition', () => {
    const calls: string[] = []
    const machine = new MissionSceneMachine<null>()
    machine.register(new LaunchScene({
      enter: () => calls.push('enter'),
      update: () => calls.push('update'),
      exit: () => calls.push('exit'),
    }))
    machine.register({ id: 'title', enter() {}, update() {}, exit() {} })

    machine.transition('launch')
    machine.transition('launch')
    machine.update(1 / 60, null)
    machine.transition('title')
    expect(calls).toEqual(['enter', 'update', 'exit'])
  })

  it('ramps launch thrust gradually after ignition while keeping real-time ascent', () => {
    expect(launchThrottleAtSeconds(0)).toBe(0)
    expect(launchThrottleAtSeconds(1.5)).toBe(0)
    expect(launchThrottleAtSeconds(2.6)).toBeGreaterThan(0)
    expect(launchThrottleAtSeconds(2.6)).toBeLessThan(1)
    expect(launchThrottleAtSeconds(3.7)).toBe(1)
  })

  it('lifts the rocket upward during the first seconds of the launch ramp', () => {
    const ascent = createAscentState()
    const dt = 1 / 60
    for (let elapsed = dt; elapsed <= 7; elapsed += dt) {
      stepAscent(ascent, dt, launchThrottleAtSeconds(elapsed))
      if (elapsed < 2) {
        expect(ascent.altitudeM).toBe(0)
        expect(ascent.verticalVelocityMps).toBe(0)
      }
    }

    expect(ascent.altitudeM).toBeGreaterThan(0)
    expect(ascent.verticalVelocityMps).toBeGreaterThan(0)
  })

  it('reaches the 185 km insertion window within the demo ascent slot', () => {
    const ascent = createAscentState()
    const dt = 1 / 60
    for (let elapsed = dt; elapsed <= 14 && !ascent.insertionComplete; elapsed += dt) {
      stepAscent(ascent, dt * 75, launchThrottleAtSeconds(elapsed))
    }

    expect(ascent.insertionComplete, `altitude=${ascent.altitudeM}, speed=${Math.hypot(ascent.downrangeVelocityMps, ascent.verticalVelocityMps)}, stage=${ascent.stageIndex}, fuel=${ascent.propellantKg}`).toBe(true)
    expect(ascent.altitudeM).toBeGreaterThan(120_000)
    expect(ascent.altitudeM).toBeLessThan(250_000)
  })

  it('triggers booster separation at altitude >= 30 km', () => {
    let boosterSeparated = false
    const ascent = createAscentState()
    ascent.positionYM = 6_371_000 + 31_000
    ascent.altitudeM = 31_000

    const rocket = new THREE.Group()
    const scene = new LaunchMissionScene({
      ascent,
      rocket,
      stageTimer: 10,
      maxQAnnounced: true,
      timeScale: 1,
      demoMode: false,
      sampleTelemetry: () => {},
      separateStage: () => {},
      separateBoosters: () => { boosterSeparated = true },
      setStatus: () => {},
      setStage: () => {},
    })

    scene.enter()
    scene.update(0.1)
    expect(boosterSeparated).toBe(true)
  })

  it('transitions cleanly to transit stage at >= 165 km without freezing throttle', () => {
    let nextStage = ''
    const ascent = createAscentState()
    ascent.positionYM = 6_371_000 + 166_000
    ascent.altitudeM = 166_000

    const rocket = new THREE.Group()
    const scene = new LaunchMissionScene({
      ascent,
      rocket,
      stageTimer: 30,
      maxQAnnounced: true,
      timeScale: 1,
      demoMode: false,
      sampleTelemetry: () => {},
      separateStage: () => {},
      separateBoosters: () => {},
      setStatus: () => {},
      setStage: stage => { nextStage = stage },
    })

    scene.enter()
    // Advance dwell timer by 0.9s (dwell threshold is 0.8s)
    scene.update(0.5)
    expect(ascent.throttle).toBeGreaterThanOrEqual(0.8) // Active cruising thrust
    scene.update(0.5)
    expect(nextStage).toBe('transit')
  })

  it('renders ozone layer breakthrough during stratospheric ascent and clears in space', () => {
    const strata = createAtmosphereStrata()
    const camPos = new THREE.Vector3(0, 35_000, 0)

    // Active and radiant during ozone layer breakthrough (14 km to 32 km)
    strata.update(camPos, 24.0, 1500, 0.016, 1.0)
    expect(strata.group.visible).toBe(true)
    expect(strata.rocketAttachmentGroup.visible).toBe(true)

    // Completely vanishes after ozone breakthrough in deep space (> 32 km)
    strata.update(camPos, 35.0, 2000, 0.016, 2.0)
    expect(strata.group.visible).toBe(false)
    expect(strata.rocketAttachmentGroup.visible).toBe(false)
  })
})