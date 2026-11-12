export type MissionSceneHooks<Input> = {
  enter?: () => void
  update: (dt: number, input: Input) => void
  exit?: () => void
}

export interface MissionScene<Input> {
  readonly id: string
  enter(): void
  update(dt: number, input: Input): void
  exit(): void
}

abstract class CallbackScene<Input> implements MissionScene<Input> {
  abstract readonly id: string

  constructor(private readonly hooks: MissionSceneHooks<Input>) {}

  enter(): void { this.hooks.enter?.() }
  update(dt: number, input: Input): void { this.hooks.update(dt, input) }
  exit(): void { this.hooks.exit?.() }
}

export class LaunchScene<Input> extends CallbackScene<Input> { readonly id = 'launch' }
export class TransitScene<Input> extends CallbackScene<Input> { readonly id = 'transit' }
export class LandingScene<Input> extends CallbackScene<Input> { readonly id = 'landing' }
export class SurfaceScene<Input> extends CallbackScene<Input> { readonly id = 'surface' }

export class MissionSceneMachine<Input> {
  private readonly scenes = new Map<string, MissionScene<Input>>()
  private active?: MissionScene<Input>

  register(scene: MissionScene<Input>): void {
    this.scenes.set(scene.id, scene)
  }

  get activeId(): string | undefined { return this.active?.id }

  transition(id: string): void {
    if (this.active?.id === id) return
    const next = this.scenes.get(id)
    if (!next) throw new Error(`Unknown mission scene: ${id}`)
    this.active?.exit()
    this.active = next
    this.active.enter()
  }

  update(dt: number, input: Input): void {
    this.active?.update(dt, input)
  }
}