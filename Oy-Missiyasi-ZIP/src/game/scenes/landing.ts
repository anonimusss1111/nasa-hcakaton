import * as THREE from 'three'
import type { Input } from '../../engine/input'
import { CONFIG } from '../config'
import {
  classifyLandingOutcome,
  descentAutopilotThrottle,
  stepLunarDescent,
  type LandingDifficulty,
  type LunarDescentState,
} from '../../sim/physics'
import type { MissionScene } from './mission-scenes'

export type LandingSceneContext = {
  get stageTimer(): number
  set stageTimer(value: number)
  get autopilotEnabled(): boolean
  get burnHeldByUi(): boolean
  get landingX(): number
  set landingX(value: number)
  get landingZ(): number
  set landingZ(value: number)
  get pitchRad(): number
  set pitchRad(value: number)
  get rollRad(): number
  set rollRad(value: number)
  get difficulty(): LandingDifficulty
  altitude: number
  verticalSpeed: number
  fuel: number
  getSlopeDegrees(): number
  landSuccessful(outcome: 'perfect' | 'hard'): void
  setStatus(message: string): void
  setStage(stage: 'landingFailed'): void
}

export class LandingMissionScene implements MissionScene<Input> {
  readonly id = 'landing'
  private readonly descentState: LunarDescentState = { altitudeM: 0, verticalSpeedMps: 0, fuelPercent: 100 }

  constructor(private readonly context: LandingSceneContext) {}

  enter(): void {}

  update(dt: number, input: Input): void {
    const context = this.context
    context.stageTimer += dt
    const manualSteering = Math.hypot(input.move.x, input.move.y) > 0.08
    const steering = manualSteering || !context.autopilotEnabled ? input.move : {
      x: THREE.MathUtils.clamp(-context.landingX / 5, -1, 1),
      y: THREE.MathUtils.clamp(context.landingZ / 5, -1, 1),
    }
    const attitudeFactor = 1 - Math.exp(-dt * 4)
    context.pitchRad += (steering.y * 12 * Math.PI / 180 - context.pitchRad) * attitudeFactor
    context.rollRad += (-steering.x * 12 * Math.PI / 180 - context.rollRad) * attitudeFactor
    context.landingX = THREE.MathUtils.clamp(context.landingX + steering.x * 3.1 * dt, -14, 14)
    context.landingZ = THREE.MathUtils.clamp(context.landingZ - steering.y * 3.1 * dt, -14, 14)
    const manualThrust = context.burnHeldByUi || input.held('jump')
    let thrust = manualThrust ? 1 : 0
    if (context.autopilotEnabled && !manualThrust) {
      thrust = descentAutopilotThrottle(
        context.altitude, context.verticalSpeed, CONFIG.mission.lunarGravity, CONFIG.mission.thrustAcceleration,
      )
    }
    this.descentState.altitudeM = context.altitude
    this.descentState.verticalSpeedMps = context.verticalSpeed
    this.descentState.fuelPercent = context.fuel
    stepLunarDescent(this.descentState, thrust, dt, CONFIG.mission.thrustAcceleration, CONFIG.mission.lunarGravity)
    context.altitude = this.descentState.altitudeM
    context.verticalSpeed = this.descentState.verticalSpeedMps
    context.fuel = this.descentState.fuelPercent
    context.verticalSpeed = Math.min(3.3, context.verticalSpeed)
    if (context.altitude > 72) {
      context.altitude = 72
      context.verticalSpeed = Math.min(0, context.verticalSpeed)
    }
    if (context.altitude <= 0) {
      context.altitude = 0
      const impactSpeed = Math.abs(context.verticalSpeed)
      const tiltDegrees = Math.hypot(context.pitchRad, context.rollRad) * 180 / Math.PI
      const slopeDegrees = context.getSlopeDegrees()
      const withinLandingZone = Math.hypot(context.landingX, context.landingZ) <= CONFIG.mission.safeLandingRadius
      const outcome = classifyLandingOutcome(
        impactSpeed, tiltDegrees, slopeDegrees, withinLandingZone, context.difficulty, CONFIG.mission.safeLandingSpeed,
      )
      if (outcome !== 'crash') {
        context.landSuccessful(outcome)
      } else {
        context.setStatus(`Qo‘nish xavfli: tezlik ${impactSpeed.toFixed(1)} m/s, qiyalik ${slopeDegrees.toFixed(1)}°.`)
        context.setStage('landingFailed')
      }
    }
    if (context.stageTimer > 55) context.setStage('landingFailed')
  }

  exit(): void {}
}
