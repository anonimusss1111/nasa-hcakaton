import * as THREE from 'three'
import type { Input } from '../../engine/input'
import { CONFIG } from '../config'
import type { MissionScene } from './mission-scenes'

export type SurfaceSceneContext = {
  roverSpeed: number
  roverHeading: number
  roverX: number
  roverZ: number
  oxygen: number
  steeringWheels: THREE.Group[]
  isRollingOut?: boolean
  interact(): void
}

export class SurfaceMissionScene implements MissionScene<Input> {
  readonly id = 'surface'

  constructor(private readonly context: SurfaceSceneContext) {}

  enter(): void {}

  update(dt: number, input: Input): void {
    const context = this.context

    // Pause player driving controls during cinematic rollout sequence from lander
    if (context.isRollingOut) {
      return
    }

    const steering = input.move
    const targetSpeed = steering.y * CONFIG.mission.roverSpeed
    // Softer acceleration / braking for more realistic mass feel
    const acceleration = steering.y === 0 ? 1.8 : 1.35
    context.roverSpeed = THREE.MathUtils.damp(context.roverSpeed, targetSpeed, acceleration, dt)

    // Smooth Ackerman front steering with slight lag
    const steeringAngle = steering.x * 0.48
    if (Math.abs(context.roverSpeed) > 0.02) {
      context.roverHeading += Math.tan(steeringAngle) * (context.roverSpeed / 3.2) * dt
      context.roverX = THREE.MathUtils.clamp(context.roverX + Math.sin(context.roverHeading) * context.roverSpeed * dt, -52, 52)
      context.roverZ = THREE.MathUtils.clamp(context.roverZ + Math.cos(context.roverHeading) * context.roverSpeed * dt, -52, 52)
    }
    if (Math.abs(context.roverSpeed) < 0.018) context.roverSpeed = 0

    // Articulated steering knuckles: turn front wheels left/right like a real steering rack
    for (const wheel of context.steeringWheels) {
      wheel.rotation.y = THREE.MathUtils.damp(wheel.rotation.y, steeringAngle, 14, dt)
    }

    context.oxygen = Math.max(0, context.oxygen - dt * CONFIG.mission.oxygenDrain)
    if (input.consume('interact')) context.interact()
  }

  exit(): void {}
}
