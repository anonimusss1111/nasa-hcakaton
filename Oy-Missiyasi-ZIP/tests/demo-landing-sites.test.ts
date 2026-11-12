import { describe, expect, it } from 'vitest'
import { LANDING_SITES, landingSiteScore, recommendedLandingSite } from '../src/game/demo/landing-sites'

describe('demo landing sites', () => {
  it('provides four distinct, bounded site profiles', () => {
    expect(LANDING_SITES).toHaveLength(4)
    expect(new Set(LANDING_SITES.map(site => site.id)).size).toBe(4)
    for (const site of LANDING_SITES) {
      expect(site.latitudeDeg).toBeGreaterThanOrEqual(-90)
      expect(site.latitudeDeg).toBeLessThanOrEqual(90)
      expect(site.longitudeDeg).toBeGreaterThanOrEqual(-180)
      expect(site.longitudeDeg).toBeLessThanOrEqual(180)
      expect(landingSiteScore(site)).toBeGreaterThanOrEqual(0)
      expect(landingSiteScore(site)).toBeLessThanOrEqual(100)
      expect(site.safeZoneRadiusM).toBeGreaterThan(0)
      expect(site.reasonUz.length).toBeGreaterThan(20)
    }
  })

  it('recommends the highest weighted score', () => {
    const recommended = recommendedLandingSite()
    expect(landingSiteScore(recommended)).toBe(Math.max(...LANDING_SITES.map(landingSiteScore)))
  })
})
