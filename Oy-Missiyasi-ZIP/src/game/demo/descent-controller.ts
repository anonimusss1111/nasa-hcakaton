import type { Input } from '../../engine/input'
import { stepLunarDescent, type DescentControls, type DescentState } from '../../sim/descent'
import { updateAutoLandingGuidance } from '../../sim/auto-guidance'
import type { LandingSite } from './landing-sites'

export class DemoDescentController {
  readonly state: DescentState = {
    altitudeM: 100,
    verticalSpeedMps: -14,
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
    slopeDegrees: 0,
    safeZoneRadiusM: 100,
    landed: false,
    outcome: null,
  }

  autopilot = false
  private readonly controls: DescentControls = { throttle: 0, lateralX: 0, lateralZ: 0 }

  start(site: LandingSite): void {
    this.autopilot = false
    this.state.altitudeM = 100
    this.state.verticalSpeedMps = -14
    this.state.xM = 0
    this.state.zM = 0
    this.state.horizontalVelocityXMps = 0
    this.state.horizontalVelocityZMps = 0
    this.state.pitchRad = 0
    this.state.rollRad = 0
    this.state.pitchRateRadS = 0
    this.state.rollRateRadS = 0
    this.state.fuelPercent = 100
    this.state.throttle = 0
    this.state.slopeDegrees = site.slopeDegrees
    this.state.safeZoneRadiusM = site.safeZoneRadiusM / site.difficultyModifier
    this.state.landed = false
    this.state.outcome = null
  }

  setAutopilot(enabled: boolean): void {
    this.autopilot = enabled
  }

  forceCrash(): void {
    this.state.altitudeM = 0
    this.state.landed = true
    this.state.outcome = 'crash'
    this.state.throttle = 0
  }

  step(dt: number, input: Input, manualThrottleHeld: boolean): void {
    if (this.autopilot) {
      updateAutoLandingGuidance(this.state, this.controls)
    } else {
      this.controls.throttle = manualThrottleHeld ? 1 : 0
      this.controls.lateralX = input.move.x
      this.controls.lateralZ = input.move.y
    }
    stepLunarDescent(this.state, dt, this.controls)
  }
}
