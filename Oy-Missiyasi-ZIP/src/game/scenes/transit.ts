import type { Input } from '../../engine/input'
import type { MissionScene } from './mission-scenes'

export type TransitSceneContext = {
  get autopilotEnabled(): boolean
  get burnProgress(): number
  set burnProgress(value: number)
  advanceTransit(dt: number, input: Input): void
}

export class TransitMissionScene implements MissionScene<Input> {
  readonly id = 'transit'

  constructor(private readonly context: TransitSceneContext) {}

  enter(): void {
    this.context.burnProgress = 100
  }

  update(dt: number, input: Input): void {
    const context = this.context
    context.burnProgress = 100
    context.advanceTransit(dt, input)
  }

  exit(): void {}
}
