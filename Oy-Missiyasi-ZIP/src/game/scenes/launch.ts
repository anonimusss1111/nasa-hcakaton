import * as THREE from 'three'
import type { Input } from '../../engine/input'
import { AscentEvent, stepAscent, type AscentState } from '../../sim/physics'
import type { MissionScene } from './mission-scenes'

const BASE_TIME_SCALE = 3.6
const ENGINE_IGNITION_DELAY_SECONDS = 1.5
const ENGINE_RAMP_SECONDS = 2.2

export function launchThrottleAtSeconds(elapsedSeconds: number): number {
  const progress = THREE.MathUtils.clamp(
    (elapsedSeconds - ENGINE_IGNITION_DELAY_SECONDS) / ENGINE_RAMP_SECONDS,
    0,
    1,
  )
  return progress * progress * (3 - 2 * progress)
}

export type LaunchSceneContext = {
  ascent: AscentState
  rocket: THREE.Group
  get stageTimer(): number
  set stageTimer(value: number)
  get maxQAnnounced(): boolean
  set maxQAnnounced(value: boolean)
  get timeScale(): number
  get demoMode(): boolean
  sampleTelemetry(): void
  separateStage(index: number): void
  separateBoosters?(): void
  jettisonFairing?(): void
  setStatus(message: string): void
  setStage(stage: 'transit'): void
}

export class LaunchMissionScene implements MissionScene<Input> {
  readonly id = 'launch'

  private troposphereAnnounced = false
  private ozoneAnnounced = false
  private mesosphereAnnounced = false
  private karmanAnnounced = false
  private fairingJettisoned = false
  private insertionAnnounced = false
  private orbitDwellSeconds = 0

  constructor(private readonly context: LaunchSceneContext) {}

  enter(): void {
    this.troposphereAnnounced = false
    this.ozoneAnnounced = false
    this.mesosphereAnnounced = false
    this.karmanAnnounced = false
    this.fairingJettisoned = false
    this.insertionAnnounced = false
    this.orbitDwellSeconds = 0
  }

  update(dt: number): void {
    const context = this.context
    context.stageTimer += dt
    const previousStage = context.ascent.stageIndex
    const throttle = launchThrottleAtSeconds(context.stageTimer)
    const effectiveScale = (context.stageTimer < 4.5 ? 1.8 : BASE_TIME_SCALE) * context.timeScale
    const events = stepAscent(context.ascent, dt * effectiveScale, throttle)
    context.sampleTelemetry()

    context.rocket.position.set(
      context.ascent.downrangeM,
      context.ascent.positionYM - 6_371_000 + 1.6,
      0,
    )

    // Smoothly clamp pitch so the rocket always points prograde forward, never upside down
    const safePitch = Math.min(Math.PI / 2, Math.max(0, context.ascent.pitchRad))
    context.rocket.rotation.z = -safePitch
    // Smoothly align rocket yaw and roll to flight azimuth so engine nozzles and fins face correctly
    context.rocket.rotation.y = THREE.MathUtils.lerp(context.rocket.rotation.y, 0, 1 - Math.exp(-dt * 4.0))
    context.rocket.rotation.x = THREE.MathUtils.lerp(context.rocket.rotation.x, 0, 1 - Math.exp(-dt * 4.0))

    const altitudeKm = context.ascent.altitudeM / 1_000

    if (events & AscentEvent.Liftoff) {
      context.setStatus('Uchirish moslamalari bo‘shatildi. Ko‘tarilish boshlandi.')
    }

    if (!context.maxQAnnounced && context.ascent.maxDynamicPressurePa > 10_000
      && context.ascent.dynamicPressurePa < context.ascent.maxDynamicPressurePa) {
      context.maxQAnnounced = true
      context.setStatus(context.demoMode
        ? `MAX-Q: ${(context.ascent.maxDynamicPressurePa / 1_000).toFixed(0)} kPa.`
        : `Maksimal dinamik bosim: ${(context.ascent.maxDynamicPressurePa / 1_000).toFixed(0)} kPa. Kondensatsiya konusi shakllandi.`)
    }

    // ── Atmospheric Strata Real-time Announcements ──
    if (!this.troposphereAnnounced && altitudeKm >= 12) {
      this.troposphereAnnounced = true
      context.setStatus('TROPOSFERA ORTDA QOLDI (12 km): Stratosferaga kirildi.')
    }

    if (!this.ozoneAnnounced && altitudeKm >= 24) {
      this.ozoneAnnounced = true
      context.setStatus('⚡ OZON QATLAMI (25 km): Ozonosfera qatlami yorib o‘tildi! Gipertovush nominal.')
    }

    if (!this.mesosphereAnnounced && altitudeKm >= 50) {
      this.mesosphereAnnounced = true
      context.setStatus('MEZOSFERA (50 km): Atmosfera siyraklashdi, dvigatel vakuum rejimida.')
    }

    if (!this.karmanAnnounced && altitudeKm >= 100) {
      this.karmanAnnounced = true
      context.setStatus('KARMAN CHIZIG‘I (100 km): Rasmiy Koinot chegarasidan o‘tildi!')
    }

    if (!this.fairingJettisoned && altitudeKm >= 105) {
      this.fairingJettisoned = true
      context.jettisonFairing?.()
      context.setStatus('⚡ FEYRING AJRATILDI (105 km): Aerodinamik bosh qoplama ajraldi! Oy ekspeditsiya moduli ochiq koinotda.')
    }

    if (context.ascent.stageIndex > previousStage) {
      if (previousStage < 2) context.separateStage(previousStage)
      context.setStatus(context.demoMode
        ? `BO‘LINISH — ${context.ascent.stageIndex}-bosqich ajratildi.`
        : `Bosqich ${context.ascent.stageIndex} ajratildi; keyingi dvigatel ishga tushdi.`)
    }

    // ── Physical Booster Separation after penetrating Ozone Layer (~30-32 km) ──
    if (altitudeKm >= 30) {
      context.separateBoosters?.()
    }

    if (context.demoMode && events & AscentEvent.Burnout) {
      context.setStatus('MECO — asosiy dvigatellar o‘chirildi.')
    }

    // ── Orbital Insertion & Fast Seamless Transition to Moon Transit ──
    const isInserted = context.ascent.insertionComplete || altitudeKm >= 165
    if (isInserted) {
      context.separateBoosters?.()
      if (!context.ascent.insertionComplete) {
        context.ascent.insertionComplete = true
        context.ascent.throttle = 0.8 // Active orbital cruising thrust (no dead engine!)
        context.ascent.pitchRad = Math.PI / 2
      }
      if (!this.insertionAnnounced) {
        this.insertionAnnounced = true
        context.setStatus('Yer orbitasiga chiqildi (180 km / 28 000 km/soat). Barcha quyi pog‘onalar ajratildi. Trans-Oy (TLI) parvozi boshlanmoqda...')
      }
      this.orbitDwellSeconds += dt
      if (this.orbitDwellSeconds >= 0.8) {
        context.setStage('transit')
      }
    }
  }

  exit(): void {}
}
