export type LandingSite = {
  id: string
  name: string
  latitudeDeg: number
  longitudeDeg: number
  slopeDegrees: number
  safety: number
  science: number
  sunlight: number
  comms: number
  difficultyModifier: number
  safeZoneRadiusM: number
  boulderDensity: number
  lightingAngleRad: number
  scoreMultiplier: number
  reasonUz: string
  reasonEn: string
  // NASA-style additional metrics
  hazardIndex: number        // 0-100, higher = more hazardous
  illuminationHours: number  // continuous sunlight hours
  earthVisibility: number    // % of time Earth is visible
}

export const LANDING_SITES: readonly LandingSite[] = [
  {
    id: 'shackleton',
    name: 'Shackleton chuqurligi chetida',
    latitudeDeg: -89.9,
    longitudeDeg: 0,
    slopeDegrees: 16,
    safety: 42,
    science: 98,
    sunlight: 54,
    comms: 67,
    difficultyModifier: 1.35,
    safeZoneRadiusM: 55,
    boulderDensity: 0.78,
    lightingAngleRad: 0.22,
    scoreMultiplier: 1.25,
    reasonUz: 'Doimiy soyadagi kraterlarda suv muzi aniqlangan; resurslar muhim, ammo notekis relyef qo‘nishni qiyinlashtiradi.',
    reasonEn: 'Water ice has been detected in permanently shadowed craters nearby; the resource is valuable, but rough terrain complicates landing.',
    hazardIndex: 78,
    illuminationHours: 18,
    earthVisibility: 65,
  },
  {
    id: 'tranquillitatis',
    name: 'Tinchlik dengizi',
    latitudeDeg: 8.5,
    longitudeDeg: 31.4,
    slopeDegrees: 3.5,
    safety: 96,
    science: 72,
    sunlight: 78,
    comms: 90,
    difficultyModifier: 0.72,
    safeZoneRadiusM: 140,
    boulderDensity: 0.24,
    lightingAngleRad: 0.62,
    scoreMultiplier: 0.92,
    reasonUz: 'Nisbatan tekis bazalt tekisligi; Apollo 11 shu hududga qo‘ngan. Keng xavfsiz zona yangi ekipaj uchun qulay.',
    reasonEn: 'A comparatively level basalt plain; Apollo 11 landed in this region. A broad safe zone makes it suitable for a first landing.',
    hazardIndex: 18,
    illuminationHours: 14,
    earthVisibility: 92,
  },
  {
    id: 'malapert',
    name: 'Malapert tog‘i',
    latitudeDeg: -85.9,
    longitudeDeg: 0,
    slopeDegrees: 8,
    safety: 84,
    science: 80,
    sunlight: 96,
    comms: 96,
    difficultyModifier: 0.92,
    safeZoneRadiusM: 105,
    boulderDensity: 0.38,
    lightingAngleRad: 0.34,
    scoreMultiplier: 1.08,
    reasonUz: 'Baland qirralarda uzoq Quyosh yoritishi va Yer bilan ko‘rish liniyasi ehtimoli yuqori; qutbiy relyef baribir tekshiruv talab qiladi.',
    reasonEn: 'Elevated ridges can offer long sunlight periods and line-of-sight to Earth; polar terrain still requires careful reconnaissance.',
    hazardIndex: 32,
    illuminationHours: 22,
    earthVisibility: 95,
  },
  {
    id: 'aristarchus',
    name: 'Aristarx platosi',
    latitudeDeg: 23.7,
    longitudeDeg: -47.4,
    slopeDegrees: 11,
    safety: 70,
    science: 92,
    sunlight: 83,
    comms: 82,
    difficultyModifier: 1.08,
    safeZoneRadiusM: 88,
    boulderDensity: 0.55,
    lightingAngleRad: 0.7,
    scoreMultiplier: 1.16,
    reasonUz: 'Vulqon jinslari va yorqin materiallar geologik jihatdan qiziq; qiyalik va toshlar tekis dengizga qaraganda ko‘proq xavf tug‘diradi.',
    reasonEn: 'Volcanic rocks and bright materials are geologically interesting; slopes and rocks pose more risk than a mare plain.',
    hazardIndex: 48,
    illuminationHours: 16,
    earthVisibility: 85,
  },
]

/** NASA-style multi-criteria landing site score */
export function landingSiteScore(site: LandingSite): number {
  // Weighted criteria based on typical lunar landing site selection
  const safetyWeight = 0.40
  const scienceWeight = 0.20
  const sunlightWeight = 0.15
  const commsWeight = 0.15
  const hazardPenalty = (site.hazardIndex / 100) * 0.10

  const raw = 
    site.safety * safetyWeight +
    site.science * scienceWeight +
    site.sunlight * sunlightWeight +
    site.comms * commsWeight

  return Math.round(Math.max(0, Math.min(100, raw * (1 - hazardPenalty) * site.scoreMultiplier)))
}

export function recommendedLandingSite(): LandingSite {
  let best = LANDING_SITES[0]!
  for (let index = 1; index < LANDING_SITES.length; index += 1) {
    const site = LANDING_SITES[index]!
    if (landingSiteScore(site) > landingSiteScore(best)) best = site
  }
  return best
}

export function landingSiteById(id: string | null | undefined): LandingSite {
  return LANDING_SITES.find(site => site.id === id) ?? recommendedLandingSite()
}
