import { LANDING_SITES, recommendedLandingSite } from './landing-sites'

export type DemoPhase = 'countdown' | 'ascent' | 'transit' | 'navigator' | 'descent' | 'results'

export type DemoPhaseInfo = {
  id: DemoPhase
  start: number
  end: number
}

export const DEMO_DURATION_SECONDS = 60
export const DEMO_MAX_DURATION_SECONDS = 65

export const DEMO_PHASES: readonly DemoPhaseInfo[] = [
  { id: 'countdown', start: 0, end: 8 },
  { id: 'ascent', start: 8, end: 22 },
  { id: 'transit', start: 22, end: 34 },
  { id: 'navigator', start: 34, end: 44 },
  { id: 'descent', start: 44, end: 58 },
  { id: 'results', start: 58, end: 60 },
]

export class DemoDirector {
  elapsedSeconds = 0
  active = false
  paused = false
  selectedSiteId: string | null = null
  readonly recommendedSiteId = recommendedLandingSite().id
  private awaitingLanding = false

  get phase(): DemoPhase {
    const time = this.elapsedSeconds
    for (const phase of DEMO_PHASES) {
      if (time < phase.end) return phase.id
    }
    return 'results'
  }

  get phaseProgress(): number {
    const time = this.elapsedSeconds
    for (const phase of DEMO_PHASES) {
      if (time < phase.end) return (time - phase.start) / (phase.end - phase.start)
    }
    return 1
  }

  start(): void {
    this.elapsedSeconds = 0
    this.paused = false
    this.active = true
    this.selectedSiteId = null
    this.awaitingLanding = false
  }

  update(dt: number): void {
    if (!this.active || this.paused || !Number.isFinite(dt) || dt <= 0) return
    const deadline = this.awaitingLanding ? DEMO_MAX_DURATION_SECONDS : DEMO_DURATION_SECONDS
    this.elapsedSeconds = Math.min(deadline, this.elapsedSeconds + dt)
    if (this.phase === 'navigator' && this.elapsedSeconds >= 42 && this.selectedSiteId === null) {
      this.selectedSiteId = this.recommendedSiteId
    }
    if (this.elapsedSeconds >= deadline) this.active = false
  }

  waitForLanding(): void {
    if (this.active) this.awaitingLanding = true
  }

  landingComplete(): void {
    this.awaitingLanding = false
    if (this.elapsedSeconds >= DEMO_DURATION_SECONDS) this.active = false
  }

  selectSite(siteId: string): boolean {
    if (!this.active || this.phase !== 'navigator' || !LANDING_SITES.some(site => site.id === siteId)) return false
    this.selectedSiteId = siteId
    return true
  }

  skipPhase(): void {
    if (!this.active) return
    const phase = DEMO_PHASES.find(item => this.elapsedSeconds < item.end)
    if (!phase) {
      this.active = false
      return
    }
    this.elapsedSeconds = phase.end
    if (phase.id === 'navigator' && this.selectedSiteId === null) {
      this.selectedSiteId = this.recommendedSiteId
    }
    if (this.elapsedSeconds >= DEMO_DURATION_SECONDS) this.active = false
  }
}
