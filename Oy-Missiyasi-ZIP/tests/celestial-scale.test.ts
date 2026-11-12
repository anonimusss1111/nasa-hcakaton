import { describe, expect, it } from 'vitest'
import {
  EARTH_DIAMETER_KM,
  EARTH_MOON_DISTANCE_KM,
  EARTH_MOON_DISTANCE_WORLD_UNITS,
  EARTH_RADIUS_WORLD_UNITS,
  KILOMETERS_TO_WORLD_UNITS,
  MOON_DIAMETER_KM,
  MOON_RADIUS_WORLD_UNITS,
  SOLAR_PLANETS,
  lunarTerrainHeight,
} from '../src/game/mission'

describe('scaled Earth–Moon route', () => {
  it('uses the same world scale for Earth, Moon and their mean separation', () => {
    const earthDiameterWorldUnits = EARTH_RADIUS_WORLD_UNITS * 2
    const moonDiameterWorldUnits = MOON_RADIUS_WORLD_UNITS * 2

    expect(EARTH_RADIUS_WORLD_UNITS).toBeCloseTo((EARTH_DIAMETER_KM / 2) * KILOMETERS_TO_WORLD_UNITS, 8)
    expect(moonDiameterWorldUnits / earthDiameterWorldUnits).toBeCloseTo(MOON_DIAMETER_KM / EARTH_DIAMETER_KM, 8)
    expect(moonDiameterWorldUnits / earthDiameterWorldUnits).toBeCloseTo(3_474.8 / 12_742, 8)
    expect(EARTH_MOON_DISTANCE_WORLD_UNITS / earthDiameterWorldUnits).toBeCloseTo(EARTH_MOON_DISTANCE_KM / EARTH_DIAMETER_KM, 8)
  })
})

describe('solar system overview', () => {
  it('includes the eight planets in order with increasing orbital distances', () => {
    expect(SOLAR_PLANETS.map(planet => planet.name)).toEqual([
      'Merkuriy', 'Venera', 'Yer', 'Mars', 'Yupiter', 'Saturn', 'Uran', 'Neptun',
    ])
    expect(SOLAR_PLANETS).toHaveLength(8)
    expect(SOLAR_PLANETS.map(planet => planet.orbitAU)).toEqual([...SOLAR_PLANETS.map(planet => planet.orbitAU)].sort((a, b) => a - b))
    expect(SOLAR_PLANETS[2]?.diameterKm).toBe(EARTH_DIAMETER_KM)
  })
})

describe('shared lunar terrain', () => {
  it('returns stable crater and slope heights for the mesh and rover suspension', () => {
    const samples = [[0, 0], [-39, -24], [17, 8], [36, 18]] as const
    for (const [x, z] of samples) {
      const first = lunarTerrainHeight(x, z)
      expect(Number.isFinite(first)).toBe(true)
      expect(lunarTerrainHeight(x, z)).toBe(first)
    }
    expect(lunarTerrainHeight(36, 18)).toBeLessThan(lunarTerrainHeight(37, 18))
    expect(lunarTerrainHeight(0, 0)).not.toBe(lunarTerrainHeight(17, 8))
  })
})
