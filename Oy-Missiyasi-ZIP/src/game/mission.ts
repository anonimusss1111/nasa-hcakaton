import * as THREE from 'three'
import type { Assets } from '../engine/assets'
import type { Input } from '../engine/input'
import type { Renderer } from '../engine/renderer'
import { CONFIG } from './config'
import { tuning } from './tuning'
import { createLaunchEnvironment, type LaunchEnvironment } from './launch-environment'
import { createLaunchTower, type LaunchTower } from './launch-tower'
import { createTroposphereCloudSystem, type TroposphereCloudSystem } from './troposphere-clouds'
import { createAtmosphereStrata, type AtmosphereStrataController } from './atmosphere-strata'
import { createRocketExhaustSystem, type RocketExhaustSystem } from './rocket-exhaust'
import { createSunCosmos, type SunCosmosController } from './sun-cosmos'
import { createSpaceSun, type SpaceSunController } from './space-sun'
import { speakRobotic } from '../engine/audio'
import { createEarth, createMoon, CELESTIAL_CONFIG, type EarthBody, type MoonBody } from './celestial-bodies'
import {
  applyProgradeBurn,
  ASCENT_STAGES,
  captureIntoLunarOrbit,
  createAscentState,
  createEarthMoonState,
  EARTH_MOON_DISTANCE_M,
  EARTH_RADIUS_M,
  hornSlopeDegrees,
  stepEarthMoon,
  type AscentState,
  type EarthMoonState,
  type LandingDifficulty,
} from '../sim/physics'
import { MissionSceneMachine } from './scenes/mission-scenes'
import { LandingMissionScene } from './scenes/landing'
import { LaunchMissionScene } from './scenes/launch'
import { SurfaceMissionScene } from './scenes/surface'
import { TransitMissionScene } from './scenes/transit'
import type { LandingSite } from './demo/landing-sites'
import type { DescentOutcome, DescentState } from '../sim/descent'

export type MissionStage = 'title' | 'countdown' | 'launch' | 'transit' | 'landing' | 'landingFailed' | 'surface' | 'complete'
export type LaunchCameraView = 'chase' | 'engine' | 'cabin'
export type TransitCameraView = 'craft' | 'overview'

const ROCKET_COMPONENTS = ['engine', 'tank', 'upper', 'lander', 'capsule'] as const

export const RESEARCH_OBJECTIVES = [
  { id: 'sample', title: 'Oy toshidan namuna olish', detail: 'Qadimiy bazalt bo‘lagini yig‘ib, geologik tarkibini qayd eting.', position: new THREE.Vector3(17, 0, 8), reward: 420 },
  { id: 'seismic', title: 'Seismometr o‘rnatish', detail: 'Oy silkinishlarini qayd etuvchi asbobni tekis maydonga joylashtiring.', position: new THREE.Vector3(-16, 0, -8), reward: 620 },
  { id: 'crater', title: 'Krater chetini skanerlash', detail: 'Radar bilan kraterning qatlamli qirrasini o‘lchab, xaritaga tushiring.', position: new THREE.Vector3(7, 0, -27), reward: 800 },
] as const

const mat = (color: string, roughness = 0.74, metalness = 0.08) => new THREE.MeshStandardMaterial({ color, roughness, metalness })
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export const EARTH_DIAMETER_KM = 12_742
export const MOON_DIAMETER_KM = 3_474.8
export const EARTH_MOON_DISTANCE_KM = 384_400
export const SOLAR_PLANETS = [
  { name: 'Merkuriy', diameterKm: 4_879, orbitAU: 0.39, color: '#b7a795', radius: 1.5, orbitRadius: 12, orbitSpeed: 0.42, spinSpeed: 0.16 },
  { name: 'Venera', diameterKm: 12_104, orbitAU: 0.72, color: '#e8bd7d', radius: 2.2, orbitRadius: 19, orbitSpeed: 0.31, spinSpeed: -0.08 },
  { name: 'Yer', diameterKm: EARTH_DIAMETER_KM, orbitAU: 1, color: '#5d9de1', radius: 2.4, orbitRadius: 27, orbitSpeed: 0.24, spinSpeed: 0.34 },
  { name: 'Mars', diameterKm: 6_779, orbitAU: 1.52, color: '#d87551', radius: 1.8, orbitRadius: 37, orbitSpeed: 0.19, spinSpeed: 0.28 },
  { name: 'Yupiter', diameterKm: 139_820, orbitAU: 5.2, color: '#d6a77d', radius: 6.2, orbitRadius: 49, orbitSpeed: 0.13, spinSpeed: 0.5 },
  { name: 'Saturn', diameterKm: 116_460, orbitAU: 9.58, color: '#e5cc91', radius: 5.2, orbitRadius: 63, orbitSpeed: 0.1, spinSpeed: 0.44 },
  { name: 'Uran', diameterKm: 50_724, orbitAU: 19.2, color: '#83d7dc', radius: 3.8, orbitRadius: 79, orbitSpeed: 0.078, spinSpeed: -0.24 },
  { name: 'Neptun', diameterKm: 49_244, orbitAU: 30.05, color: '#527bd6', radius: 3.7, orbitRadius: 95, orbitSpeed: 0.062, spinSpeed: 0.27 },
] as const

type LunarCrater = { x: number; z: number; r: number; d: number }
type RandomSource = () => number

function seededRandom(seed: number): RandomSource {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function makeLunarCraters(random: RandomSource): LunarCrater[] {
  const craters: LunarCrater[] = [
    { x: -39, z: -24, r: 20, d: 2.2 }, { x: 36, z: 18, r: 25, d: 2.8 }, { x: 3, z: 39, r: 15, d: 1.4 },
    { x: -58, z: 42, r: 13, d: 1.1 }, { x: 59, z: -47, r: 18, d: 1.7 }, { x: -15, z: -53, r: 10, d: 1.3 },
    { x: 46, z: -15, r: 9, d: 1 }, { x: -55, z: -51, r: 11, d: 1.5 },
  ]
  for (let i = 0; i < 48; i += 1) {
    const x = random() * 128 - 64
    const z = random() * 128 - 64
    if (Math.hypot(x, z) < 11 || RESEARCH_OBJECTIVES.some(point => Math.hypot(x - point.position.x, z - point.position.z) < 5)) continue
    craters.push({ x, z, r: 2.2 + random() * 5.2, d: 0.32 + random() * 0.65 })
  }
  return craters
}

const LUNAR_CRATERS = makeLunarCraters(seededRandom(0x4c554e41))

export function lunarTerrainHeight(x: number, z: number): number {
  let height = Math.sin(x * 0.13) * Math.cos(z * 0.11) * 0.24
    + Math.sin((x + z) * 0.31) * 0.09
    + Math.sin(x * 0.71 + z * 0.37) * Math.cos(z * 0.63 - x * 0.22) * 0.045
  for (const crater of LUNAR_CRATERS) {
    const distance = Math.hypot(x - crater.x, z - crater.z)
    height += -crater.d * Math.exp(-((distance / (crater.r * 0.3)) ** 2))
      + crater.d * 0.22 * Math.exp(-(((distance - crater.r) / (crater.r * 0.15)) ** 2))
  }
  return height
}

/** Real Astronomical Scaling: 1 world unit = 1,000 km. Exact NASA ratio: Moon radius = 0.2727x Earth radius */
export const KILOMETERS_TO_WORLD_UNITS = 0.001
export const EARTH_RADIUS_WORLD_UNITS = CELESTIAL_CONFIG.EARTH_RADIUS
export const MOON_RADIUS_WORLD_UNITS = CELESTIAL_CONFIG.MOON_RADIUS
export const EARTH_MOON_DISTANCE_WORLD_UNITS = CELESTIAL_CONFIG.EARTH_MOON_DISTANCE

const EARTH_CENTER = V3(-EARTH_MOON_DISTANCE_WORLD_UNITS / 2, 4, -54)
const MOON_CENTER = V3(EARTH_MOON_DISTANCE_WORLD_UNITS / 2, 4, -54)
const ROUTE_CENTER = V3(0, 4, -54)
const TRANSIT_SCENE_SCALE = 1
const TRANSIT_OVERVIEW_POSITION = V3(0, 160, 220)
const TRANSIT_OVERVIEW_LOOK = V3(0, 4, -40)
const TRANSIT_DURATION_SECONDS = 5 * 24 * 60 * 60
const TRANSIT_TIME_WARP_OPTIONS = [1_000, 4_000, 16_000, 32_000, 64_000] as const
const EARTH_GRAVITATIONAL_PARAMETER = 3.986004418e14
const EARTH_MOON_MEAN_MOTION = Math.sqrt(EARTH_GRAVITATIONAL_PARAMETER / EARTH_MOON_DISTANCE_M ** 3)
const LAUNCH_SITE_LATITUDE_RAD = 28.5 * Math.PI / 180
const LAUNCH_TERRAIN_CLEARANCE_M = 0.25
const NOZZLE_OFFSETS: readonly [number, number, number][] = [
  [0, 0.12, 0], [1.05, 0.12, 0], [-1.05, 0.12, 0],
  [0, 0.12, 0.82], [0, 0.12, -0.82],
]

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, position: THREE.Vector3, parent: THREE.Group, cast = true): THREE.Mesh {
  const item = new THREE.Mesh(geometry, material)
  item.position.copy(position)
  item.castShadow = cast
  item.receiveShadow = true
  parent.add(item)
  return item
}

function box(parent: THREE.Group, size: [number, number, number], position: [number, number, number], material: THREE.Material): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(...size), material, V3(...position), parent)
}

function addStars(parent: THREE.Group, _count: number, spread: number, seed: number): void {
  let x = seed >>> 0
  const random = () => {
    x = (x * 1664525 + 1013904223) >>> 0
    return x / 4294967296
  }

  // 1. Authentic Deep Space Starfield (9,000 pinpoint stars matching NASA & reference Image 2)
  const starColors = [
    new THREE.Color('#ffffff'), // Diamond white pinpoint (majority)
    new THREE.Color('#f0f4ff'), // Pure stellar white
    new THREE.Color('#d8e6ff'), // Subtle icy blue-white
    new THREE.Color('#fff9f2'), // Subtle warm white
  ]

  const starCount = 9000
  const points = new Float32Array(starCount * 3)
  const colors = new Float32Array(starCount * 3)

  for (let i = 0; i < starCount; i += 1) {
    const theta = random() * Math.PI * 2
    const z = random() * 2 - 1
    const dist = spread * (0.65 + random() * 0.35)
    const radius = Math.sqrt(1 - z * z) * dist
    points[i * 3] = Math.cos(theta) * radius
    points[i * 3 + 1] = z * dist
    points[i * 3 + 2] = Math.sin(theta) * radius

    const col = starColors[Math.floor(random() * starColors.length)]!
    // Realistic star magnitude distribution: mostly tiny faint pinpoints, few bright navigation stars
    const isBright = random() > 0.96
    const brightness = isBright ? 0.95 + random() * 0.05 : 0.25 + random() * 0.45
    colors[i * 3] = col.r * brightness
    colors[i * 3 + 1] = col.g * brightness
    colors[i * 3 + 2] = col.b * brightness
  }

  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(points, 3))
  starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const starMat = new THREE.PointsMaterial({
    vertexColors: true,
    size: 0.42,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  parent.add(new THREE.Points(starGeo, starMat))

  // 2. Realistic Subtle Cosmic Dust & Distant Stellar Haze (Monochromatic subtle blue-white)
  const mwCount = 2500
  const mwPoints = new Float32Array(mwCount * 3)
  const mwColors = new Float32Array(mwCount * 3)
  const mwBaseColor = new THREE.Color('#7899be')

  const mwTiltX = 0.45
  const mwTiltZ = 0.32

  for (let i = 0; i < mwCount; i++) {
    const theta = random() * Math.PI * 2
    const spreadY = (random() + random() + random() - 1.5) * spread * 0.12
    const r = spread * (0.75 + random() * 0.25)

    const px = Math.cos(theta) * r
    const py = spreadY
    const pz = Math.sin(theta) * r

    const y1 = py * Math.cos(mwTiltX) - pz * Math.sin(mwTiltX)
    const z1 = py * Math.sin(mwTiltX) + pz * Math.cos(mwTiltX)
    const x2 = px * Math.cos(mwTiltZ) + y1 * Math.sin(mwTiltZ)
    const y2 = -px * Math.sin(mwTiltZ) + y1 * Math.cos(mwTiltZ)

    mwPoints[i * 3] = x2
    mwPoints[i * 3 + 1] = y2
    mwPoints[i * 3 + 2] = z1

    const alpha = 0.08 + random() * 0.18 // Very faint, subtle cosmic background haze
    mwColors[i * 3] = mwBaseColor.r * alpha
    mwColors[i * 3 + 1] = mwBaseColor.g * alpha
    mwColors[i * 3 + 2] = mwBaseColor.b * alpha
  }

  const mwGeo = new THREE.BufferGeometry()
  mwGeo.setAttribute('position', new THREE.BufferAttribute(mwPoints, 3))
  mwGeo.setAttribute('color', new THREE.BufferAttribute(mwColors, 3))

  const mwMat = new THREE.PointsMaterial({
    vertexColors: true,
    size: 0.85,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  parent.add(new THREE.Points(mwGeo, mwMat))
}

export interface TransitCraftAssembly {
  group: THREE.Group
  craftBody: THREE.Group
  carrierStage: THREE.Group
  fairingLeft: THREE.Group
  fairingRight: THREE.Group
  lemModule: THREE.Group
  solarWings: THREE.Group[]
  rcsPlumes: {
    pitchPos: THREE.Mesh[]
    pitchNeg: THREE.Mesh[]
    yawLeft: THREE.Mesh[]
    yawRight: THREE.Mesh[]
    retro: THREE.Mesh[]
  }
  updateExtraction: (elapsedSeconds: number) => void
  updateLemUndock: (prog: number) => void
  setRcs: (pitch: number, yaw: number, retro: boolean) => void
}

function createLunarTransitCraft(): TransitCraftAssembly {
  const group = new THREE.Group()
  group.name = 'LunarTransitAssembly'

  const whiteMat = mat('#f0f4f8', 0.3, 0.15)
  const chromeMat = mat('#c5cbd2', 0.2, 0.85)
  const darkHeatShield = mat('#14181c', 0.85, 0.05)
  const goldFoil = mat('#d4af37', 0.35, 0.65)
  const solarPanelMat = new THREE.MeshStandardMaterial({
    color: '#1a365d',
    roughness: 0.25,
    metalness: 0.7,
    emissive: '#0d2242',
    emissiveIntensity: 0.35,
  })
  const engineBellMat = mat('#1f2328', 0.5, 0.5)

  // ── 1. CARRIER ROCKET UPPER STAGE & PAYLOAD ADAPTER ────────────────────────
  const carrierStage = new THREE.Group()
  carrierStage.name = 'CarrierRocketUpperStage'
  // White booster cylinder (matches original core rocket body)
  mesh(new THREE.CylinderGeometry(1.24, 1.24, 4.8, 32), whiteMat, V3(0, -3.4, 0), carrierStage)
  // Dark interstage adapter ring
  mesh(new THREE.CylinderGeometry(1.26, 1.26, 0.45, 32), mat('#1a2128', 0.6, 0.3), V3(0, -1.05, 0), carrierStage)
  // Engine nozzle of the upper booster
  const carrierNozzle = mesh(new THREE.CylinderGeometry(0.24, 0.56, 0.9, 20), engineBellMat, V3(0, -6.0, 0), carrierStage)
  carrierNozzle.rotation.x = Math.PI
  group.add(carrierStage)

  // ── 2. SEPARATING PAYLOAD FAIRING HALF-CLAMSHELLS ──────────────────────────
  const fairingLeft = new THREE.Group()
  fairingLeft.name = 'FairingLeft'
  mesh(new THREE.CylinderGeometry(1.28, 1.28, 3.2, 24, 1, false, 0, Math.PI), whiteMat, V3(0, 1.6, 0), fairingLeft)
  mesh(new THREE.ConeGeometry(1.28, 2.4, 24, 1, false, 0, Math.PI), whiteMat, V3(0, 4.4, 0), fairingLeft)
  group.add(fairingLeft)

  const fairingRight = new THREE.Group()
  fairingRight.name = 'FairingRight'
  mesh(new THREE.CylinderGeometry(1.28, 1.28, 3.2, 24, 1, false, Math.PI, Math.PI), whiteMat, V3(0, 1.6, 0), fairingRight)
  mesh(new THREE.ConeGeometry(1.28, 2.4, 24, 1, false, Math.PI, Math.PI), whiteMat, V3(0, 4.4, 0), fairingRight)
  group.add(fairingRight)

  // ── 3. MAIN LUNAR EXPEDITION SPACECRAFT (Orion / Apollo style) ─────────────
  const craftBody = new THREE.Group()
  craftBody.name = 'LunarSpacecraftCore'
  group.add(craftBody)

  // A. Command Module (Conical Crew Capsule)
  const capsule = mesh(new THREE.ConeGeometry(1.2, 1.8, 32), whiteMat, V3(0, 2.6, 0), craftBody)
  capsule.rotation.y = Math.PI / 4
  mesh(new THREE.CylinderGeometry(1.22, 1.22, 0.28, 32), darkHeatShield, V3(0, 1.62, 0), craftBody)
  mesh(new THREE.CylinderGeometry(0.12, 0.22, 0.7, 16), chromeMat, V3(0, 3.8, 0), craftBody)
  for (const a of [-0.35, 0.35]) {
    const win = mesh(new THREE.CircleGeometry(0.18, 16), mat('#071322', 0.1, 0.95), V3(Math.sin(a) * 0.85, 2.7, Math.cos(a) * 0.85), craftBody)
    win.rotation.y = a
  }

  // B. Service Module (Cylindrical Propulsion Body)
  mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.4, 32), chromeMat, V3(0, 0.3, 0), craftBody)
  for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    box(craftBody, [0.12, 2.1, 0.08], [Math.cos(a) * 1.22, 0.3, Math.sin(a) * 1.22], whiteMat)
  }
  const antennaPole = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8), chromeMat, V3(-1.3, -0.2, 0), craftBody)
  antennaPole.rotation.z = 0.5
  const dish = mesh(new THREE.CylinderGeometry(0.65, 0.1, 0.2, 16, 1, true), goldFoil, V3(-1.7, -0.6, 0), craftBody)
  dish.rotation.z = 0.5

  // C. 4 RCS Cold-Gas Reaction Control Thruster Quads with Active Gas Plumes
  const rcsPlumes = {
    pitchPos: [] as THREE.Mesh[],
    pitchNeg: [] as THREE.Mesh[],
    yawLeft: [] as THREE.Mesh[],
    yawRight: [] as THREE.Mesh[],
    retro: [] as THREE.Mesh[],
  }

  const gasMat = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })

  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4
    const rcsBlock = new THREE.Group()
    rcsBlock.position.set(Math.cos(angle) * 1.24, 0.6, Math.sin(angle) * 1.24)
    rcsBlock.rotation.y = -angle
    mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), darkHeatShield, V3(0, 0, 0), rcsBlock)
    craftBody.add(rcsBlock)

    // Pitch positive (+Y) cold gas nozzle
    const pPos = mesh(new THREE.ConeGeometry(0.09, 0.52, 8), gasMat.clone(), V3(0, 0.32, 0), rcsBlock, false)
    rcsPlumes.pitchPos.push(pPos)

    // Pitch negative (-Y) cold gas nozzle
    const pNeg = mesh(new THREE.ConeGeometry(0.09, 0.52, 8), gasMat.clone(), V3(0, -0.32, 0), rcsBlock, false)
    pNeg.rotation.x = Math.PI
    rcsPlumes.pitchNeg.push(pNeg)

    // Lateral yaw nozzles
    const yL = mesh(new THREE.ConeGeometry(0.09, 0.52, 8), gasMat.clone(), V3(-0.32, 0, 0), rcsBlock, false)
    yL.rotation.z = Math.PI / 2
    rcsPlumes.yawLeft.push(yL)

    const yR = mesh(new THREE.ConeGeometry(0.09, 0.52, 8), gasMat.clone(), V3(0.32, 0, 0), rcsBlock, false)
    yR.rotation.z = -Math.PI / 2
    rcsPlumes.yawRight.push(yR)

    // Retro-braking gas thruster (^) pointing upward/forward
    const retroGas = mesh(new THREE.ConeGeometry(0.14, 0.85, 8), gasMat.clone(), V3(0, 0.45, 0), rcsBlock, false)
    rcsPlumes.retro.push(retroGas)
  }

  // D. Service Propulsion Rocket Engine Bell
  const spsBell = mesh(new THREE.CylinderGeometry(0.25, 0.68, 1.2, 24), engineBellMat, V3(0, -1.5, 0), craftBody)
  spsBell.rotation.x = Math.PI
  mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.25, 16), new THREE.MeshBasicMaterial({ color: '#ff6600' }), V3(0, -1.0, 0), craftBody, false)

  // E. Deployable 4-Wing Solar Arrays (Folded during launch, unfold on extraction)
  const solarWings: THREE.Group[] = []
  for (let w = 0; w < 4; w++) {
    const wingAngle = (w * Math.PI) / 2
    const wingGroup = new THREE.Group()
    wingGroup.position.set(Math.cos(wingAngle) * 1.25, 0.2, Math.sin(wingAngle) * 1.25)
    wingGroup.rotation.y = -wingAngle
    box(wingGroup, [1.4, 0.06, 0.06], [0.7, 0, 0], chromeMat)
    const panel = box(wingGroup, [2.4, 0.04, 0.75], [2.6, 0, 0], solarPanelMat)
    panel.rotation.x = 0.15
    solarWings.push(wingGroup)
    craftBody.add(wingGroup)
  }

  // F. Lunar Excursion Module (LEM) nestled below (Gold foil descent stage with landing legs)
  const lemGroup = new THREE.Group()
  lemGroup.position.set(0, -2.6, 0)
  box(lemGroup, [1.6, 1.0, 1.6], [0, 0, 0], goldFoil)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.5, 6), darkHeatShield, V3(sx * 0.95, -0.6, sz * 0.95), lemGroup)
      leg.rotation.z = sx * -0.3
      leg.rotation.x = sz * 0.3
      box(lemGroup, [0.35, 0.08, 0.35], [sx * 1.25, -1.25, sz * 1.25], goldFoil)
    }
  }
  craftBody.add(lemGroup)

  return {
    group,
    craftBody,
    carrierStage,
    fairingLeft,
    fairingRight,
    lemModule: lemGroup,
    solarWings,
    rcsPlumes,

    updateExtraction(elapsed: number) {
      if (elapsed < 0.6) {
        // Enclosed in fairing, inside the carrier rocket, wings folded alongside
        carrierStage.position.y = -2.2
        carrierStage.visible = true
        fairingLeft.position.set(0, 0, 0)
        fairingLeft.rotation.set(0, 0, 0)
        fairingLeft.visible = true
        fairingRight.position.set(0, 0, 0)
        fairingRight.rotation.set(0, 0, 0)
        fairingRight.visible = true
        craftBody.position.y = 0
        for (const wing of solarWings) {
          wing.rotation.z = -Math.PI / 2
        }
      } else {
        const sep = Math.min(1, (elapsed - 0.6) / 2.0)
        // Fairing petals separate, rotate, and push away outward
        fairingLeft.position.x = -sep * 4.4
        fairingLeft.position.y = -sep * 1.8
        fairingLeft.rotation.z = -sep * 0.85
        fairingLeft.rotation.y = -sep * 0.35

        fairingRight.position.x = sep * 4.4
        fairingRight.position.y = -sep * 1.8
        fairingRight.rotation.z = sep * 0.85
        fairingRight.rotation.y = sep * 0.35

        // Carrier rocket upper stage drops back into space
        carrierStage.position.y = -2.2 - sep * 14.0

        // Lunar craft smoothly glides forward (+Y) out of the rocket adapter
        craftBody.position.y = sep * 2.8

        // Solar panels unfold smoothly from body to 90 degrees deployed
        const wingSep = Math.min(1, Math.max(0, (elapsed - 1.4) / 1.5))
        for (const wing of solarWings) {
          wing.rotation.z = (-Math.PI / 2) * (1 - wingSep)
        }

        if (elapsed >= 3.8) {
          carrierStage.visible = false
          fairingLeft.visible = false
          fairingRight.visible = false
        }
      }
    },

    updateLemUndock(prog: number) {
      lemGroup.position.y = -2.6 - prog * 5.2
      lemGroup.rotation.y += 0.02
    },

    setRcs(pitch: number, yaw: number, retro: boolean) {
      const flicker = 0.85 + Math.random() * 0.15
      for (const m of rcsPlumes.pitchPos) {
        ;(m.material as THREE.MeshBasicMaterial).opacity = pitch > 0.05 ? flicker : 0
      }
      for (const m of rcsPlumes.pitchNeg) {
        ;(m.material as THREE.MeshBasicMaterial).opacity = pitch < -0.05 ? flicker : 0
      }
      for (const m of rcsPlumes.yawRight) {
        ;(m.material as THREE.MeshBasicMaterial).opacity = yaw > 0.05 ? flicker : 0
      }
      for (const m of rcsPlumes.yawLeft) {
        ;(m.material as THREE.MeshBasicMaterial).opacity = yaw < -0.05 ? flicker : 0
      }
      for (const m of rcsPlumes.retro) {
        ;(m.material as THREE.MeshBasicMaterial).opacity = retro ? flicker : 0
      }
    },
  }
}

function addLander(parent: THREE.Group): THREE.Group {
  const group = new THREE.Group()
  parent.add(group)
  const foil = mat('#c4b998', 0.48, 0.32)
  const dark = mat('#2f3a42', 0.7, 0.2)
  const gold = mat('#b68b49', 0.58, 0.3)
  const body = box(group, [2.2, 1.2, 2], [0, 1.6, 0], foil)
  body.castShadow = true
  box(group, [1.4, 0.5, 1.35], [0, 2.48, 0], dark)
  const cap = mesh(new THREE.CylinderGeometry(0.74, 1.05, 1, 8), gold, V3(0, 3.15, 0), group)
  cap.rotation.y = Math.PI / 8
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = mesh(new THREE.CylinderGeometry(0.055, 0.09, 2.15, 6), dark, V3(sx * 1.25, 0.82, sz * 1.1), group)
    leg.rotation.z = sx * -0.28
    leg.rotation.x = sz * 0.23
    const foot = box(group, [0.72, 0.12, 0.55], [sx * 1.55, 0.05, sz * 1.35], gold)
    foot.rotation.y = sz * 0.08
  }
  const nozzle = mesh(new THREE.CylinderGeometry(0.18, 0.55, 0.8, 12), dark, V3(0, 0.4, 0), group)
  nozzle.rotation.x = Math.PI
  const panel = box(group, [2.1, 0.08, 0.72], [2.25, 2, 0], mat('#24466c', 0.35, 0.5))
  panel.rotation.z = -0.08
  const panel2 = box(group, [2.1, 0.08, 0.72], [-2.25, 2, 0], mat('#24466c', 0.35, 0.5))
  panel2.rotation.z = 0.08

  // ── Articulated Lunar Lander Exit Ramp / Door (Task 9) ──
  const rampGroup = new THREE.Group()
  rampGroup.name = 'LanderExitRamp'
  rampGroup.position.set(0, 0.32, 1.02)
  rampGroup.rotation.x = -Math.PI * 0.47 // Closed door vertically flush against the cabin
  const rampPlate = box(rampGroup, [1.5, 0.08, 2.5], [0, 0.04, 1.25], mat('#374151', 0.65, 0.35))
  rampPlate.castShadow = true
  rampPlate.receiveShadow = true
  // Safety railings along ramp
  for (const rx of [-0.74, 0.74]) {
    box(rampGroup, [0.06, 0.32, 2.5], [rx, 0.20, 1.25], mat('#9ca3af', 0.45, 0.6))
  }
  group.add(rampGroup)
  group.userData.ramp = rampGroup

  // ── 3D Aerodynamic Landing Parachutes Cluster (Task 7) ──
  const parachutes = new THREE.Group()
  parachutes.name = 'LandingParachutes'
  parachutes.visible = false

  const chuteMatOrange = new THREE.MeshStandardMaterial({
    color: '#ff5500',
    roughness: 0.75,
    metalness: 0.05,
    side: THREE.DoubleSide,
  })
  const chuteMatWhite = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.75,
    metalness: 0.05,
    side: THREE.DoubleSide,
  })

  const chutePositions: [number, number, number, number][] = [
    [0, 11.2, 0, 2.8],          // Center main chute
    [-3.5, 9.6, -1.2, 2.2],     // Left stabilizer chute
    [3.5, 9.6, -1.2, 2.2],      // Right stabilizer chute
  ]

  const cordMat = new THREE.LineBasicMaterial({ color: '#f3f4f6', opacity: 0.85, transparent: true })

  chutePositions.forEach(([cx, cy, cz, cRadius], i) => {
    const singleChute = new THREE.Group()
    singleChute.position.set(cx, cy, cz)

    // Billowing dome canopy
    const domeMat = i % 2 === 0 ? chuteMatOrange : chuteMatWhite
    const dome = mesh(
      new THREE.SphereGeometry(cRadius, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.48),
      domeMat,
      V3(0, 0, 0),
      singleChute,
      false,
    )
    dome.rotation.x = Math.PI // Open downward like a true parachute

    // 4 Suspension rigging lines connecting canopy edge down to lander roof harness
    const harnessAnchor = V3(-cx, -cy + 3.2, -cz)
    for (let c = 0; c < 4; c++) {
      const angle = (c * Math.PI) / 2
      const rimPoint = V3(Math.cos(angle) * cRadius, 0, Math.sin(angle) * cRadius)
      const cordGeo = new THREE.BufferGeometry().setFromPoints([rimPoint, harnessAnchor])
      singleChute.add(new THREE.Line(cordGeo, cordMat))
    }

    parachutes.add(singleChute)
  })

  group.add(parachutes)
  group.userData.parachutes = parachutes

  return group
}

function makeRocketComponent(parent: THREE.Group, id: string): void {
  const whiteMat = mat('#f0f2f5', 0.28, 0.15)
  const blackHeatShield = mat('#14171a', 0.85, 0.05)
  const chromeMetal = mat('#c2c7cc', 0.35, 0.75)
  const goldFoil = mat('#d4af37', 0.35, 0.65)
  const engineBellMat = mat('#1c2024', 0.5, 0.5)

  if (id === 'engine') {
    // Heavy Rocket Base (Saturn V / Falcon Heavy style S-IC First Stage)
    // Main booster core
    mesh(new THREE.CylinderGeometry(1.35, 1.45, 2.2, 36), whiteMat, V3(0, 1.1, 0), parent)
    mesh(new THREE.CylinderGeometry(1.45, 1.48, 0.4, 36), blackHeatShield, V3(0, 0.2, 0), parent)

    // 5 Powerful Rocket Engine Gimbal Bells (4 peripheral + 1 center)
    const bellPositions = [
      [0, 0],
      [0.72, 0.72],
      [-0.72, 0.72],
      [0.72, -0.72],
      [-0.72, -0.72]
    ]
    for (const [bx, bz] of bellPositions) {
      const bell = mesh(new THREE.CylinderGeometry(0.18, 0.44, 0.85, 20), engineBellMat, V3(bx, 0.42, bz), parent)
      bell.rotation.x = Math.PI
      // Glowing inner engine throat
      const throat = mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.15, 16), new THREE.MeshBasicMaterial({ color: '#ff7700' }), V3(bx, 0.75, bz), parent, false)
      throat.rotation.x = Math.PI
    }

    // 4 High-tech Aerodynamic Grid / Delta Stabilizer Fins
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2
      const finGroup = new THREE.Group()
      finGroup.position.set(Math.cos(angle) * 1.45, 1.0, Math.sin(angle) * 1.45)
      finGroup.rotation.y = -angle
      // Swept fin
      const fin = mesh(new THREE.BoxGeometry(0.08, 1.8, 1.1), chromeMetal, V3(0, 0, 0.5), finGroup)
      fin.rotation.x = -0.35
      parent.add(finGroup)
    }
  }

  if (id === 'tank') {
    // Massive Main Cryogenic Propellant Tank (Liquid Oxygen + RP-1 / Hydrolox)
    mesh(new THREE.CylinderGeometry(1.32, 1.35, 6.8, 36), whiteMat, V3(0, 5.6, 0), parent)
    // Black vertical roll-pattern markings (NASA Apollo style for visual tracking)
    for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      const stripe = mesh(new THREE.BoxGeometry(0.38, 6.82, 0.04), blackHeatShield, V3(Math.cos(angle) * 1.33, 5.6, Math.sin(angle) * 1.33), parent)
      stripe.rotation.y = -angle
    }
    // Structural compression rings
    for (const y of [2.6, 4.4, 6.8, 8.8]) {
      const ring = mesh(new THREE.TorusGeometry(1.34, 0.035, 8, 48), chromeMetal, V3(0, y, 0), parent)
      ring.rotation.x = Math.PI / 2
    }
    // External avionics and fuel feed raceway tunnels
    for (const x of [-1.34, 1.34]) {
      box(parent, [0.12, 6.2, 0.18], [x, 5.6, 0], chromeMetal)
    }
  }

  if (id === 'upper') {
    // Interstage Ring & Second Stage (Orbital Insertion Module)
    // Vacuum second-stage engine bell & chamber at base of stage 1 (y = 8.15..9.15) so stage separation leaves zero gap
    mesh(new THREE.CylinderGeometry(0.46, 0.56, 0.45, 24), engineBellMat, V3(0, 9.02, 0), parent)
    mesh(new THREE.CylinderGeometry(0.34, 0.82, 0.95, 24), engineBellMat, V3(0, 8.65, 0), parent)
    mesh(
      new THREE.CylinderGeometry(0.24, 0.36, 0.14, 20),
      new THREE.MeshBasicMaterial({ color: '#ff9922' }),
      V3(0, 8.22, 0),
      parent,
      false,
    )
    // Vented interstage truss ring
    mesh(new THREE.CylinderGeometry(1.15, 1.32, 1.2, 32), blackHeatShield, V3(0, 9.6, 0), parent)
    // Second stage cryogenic body
    mesh(new THREE.CylinderGeometry(1.12, 1.15, 3.8, 32), whiteMat, V3(0, 12.1, 0), parent)
    // RCS Thruster quads (Reaction Control System for auto-pilot maneuvering)
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4
      const rcs = mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), chromeMetal, V3(Math.cos(angle) * 1.14, 13.5, Math.sin(angle) * 1.14), parent)
      rcs.rotation.y = -angle
    }
  }

  if (id === 'lander') {
    // Upper stage service propulsion nozzle at base (y = 13.45..14.1) so stage 1 separation leaves zero gap
    mesh(new THREE.CylinderGeometry(0.28, 0.62, 0.72, 20), engineBellMat, V3(0, 13.78, 0), parent)
    mesh(
      new THREE.CylinderGeometry(0.18, 0.28, 0.12, 16),
      new THREE.MeshBasicMaterial({ color: '#ff9922' }),
      V3(0, 13.46, 0),
      parent,
      false,
    )
    // Lunar Excursion Module (Apollo Lunar Module) inside protective adapter
    mesh(new THREE.CylinderGeometry(0.95, 1.12, 2.8, 32), whiteMat, V3(0, 15.4, 0), parent)
    // Inspection window cutaway / Gold foil inside
    mesh(new THREE.CylinderGeometry(0.85, 0.94, 2.2, 16), goldFoil, V3(0, 15.3, 0), parent)
  }

  if (id === 'capsule') {
    // Orion / Apollo Crew Command Module & Launch Abort System (LAS)
    // Conical aerodynamic Crew Module
    const cone = mesh(new THREE.ConeGeometry(0.95, 1.7, 32), whiteMat, V3(0, 17.65, 0), parent)
    cone.rotation.y = Math.PI / 4
    // Heat shield base
    mesh(new THREE.CylinderGeometry(0.96, 0.96, 0.25, 32), blackHeatShield, V3(0, 16.85, 0), parent)
    // Crew capsule dark tinted observation windows
    for (const a of [-0.35, 0.35]) {
      const win = mesh(new THREE.CircleGeometry(0.16, 16), mat('#0d1b2a', 0.1, 0.9), V3(Math.sin(a) * 0.72, 17.5, Math.cos(a) * 0.72), parent)
      win.rotation.y = a
    }
    // Launch Abort Tower (Tower escape rocket at the very top of Saturn V / Artemis SLS)
    mesh(new THREE.CylinderGeometry(0.08, 0.28, 2.2, 8), chromeMetal, V3(0, 19.5, 0), parent)
    mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.2, 12), mat('#e56d39', 0.4, 0.3), V3(0, 20.8, 0), parent)
    mesh(new THREE.ConeGeometry(0.18, 0.7, 12), chromeMetal, V3(0, 21.75, 0), parent)
  }
}

export class MoonMission {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 500_000_000)
  stage: MissionStage = 'title'
  paused = false
  burnProgress = 0
  autopilotEnabled = false
  difficulty: LandingDifficulty = 'normal'
  landingOutcome: 'perfect' | 'safe' | 'hard' | 'crash' | null = null
  altitude = 0
  verticalSpeed = 0
  landingPitchRad = 0
  landingRollRad = 0
  fuel = 100
  oxygen = 100
  readonly ascentTelemetry = {
    capacity: 120,
    altitudeKm: new Float32Array(120),
    velocityKmps: new Float32Array(120),
    accelerationG: new Float32Array(120),
    count: 0,
    next: 0,
  }
  readonly researched = new Set<string>()
  statusMessage = ''
  private demoMode = false
  private demoLandingSite: LandingSite | null = null

  get transferElapsed(): number { return this.stage === 'transit' ? this.transit?.elapsedSeconds ?? 0 : 0 }
  get transferProgress(): number { return this.stage === 'transit' ? THREE.MathUtils.clamp(this.transferElapsed / TRANSIT_DURATION_SECONDS, 0, 1) : 0 }
  get transferDistanceKm(): number {
    if (this.stage !== 'transit') return 0
    return EARTH_MOON_DISTANCE_KM - this.distanceToMoonKm
  }
  get distanceToMoonKm(): number {
    if (this.stage !== 'transit') return 0
    const prog = this.transferProgress
    if (prog >= 0.98) return 100
    return Math.max(100, Math.round(Math.pow(1 - prog, 1.45) * EARTH_MOON_DISTANCE_KM))
  }
  get transitEtaText(): string {
    const remainingFraction = Math.max(0, 1 - this.transferProgress)
    const totalRealSeconds = 3 * 24 * 3600 + 4 * 3600
    const remainingRealSeconds = Math.round(remainingFraction * totalRealSeconds)
    const days = Math.floor(remainingRealSeconds / 86400)
    const hours = Math.floor((remainingRealSeconds % 86400) / 3600)
    const gameSeconds = Math.round(remainingFraction * 16)
    return `${days} kun ${hours} soat (O‘yinda: ~${gameSeconds} s)`
  }
  get transitHazardWarning(): string | undefined {
    return this.activeHazardMessage
  }
  get timeWarp(): number { return this.transitTimeWarp }
  get launchCameraView(): LaunchCameraView { return this.launchCameraPreset }
  get transitCameraView(): TransitCameraView { return this.transitCameraPreset }
  get transitCaptured(): boolean { return this.moonCaptured }
  get landingTiltDegrees(): number { return Math.hypot(this.landingPitchRad, this.landingRollRad) * 180 / Math.PI }
  get demoThrustHeld(): boolean { return this.burnHeldByUi }
  get landingSlopeDegrees(): number { return this.sampleLandingSlope() }
  get launchSpeedKmH(): number {
    if (this.stage !== 'launch') return 0
    return Math.round(Math.hypot(this.ascent.downrangeVelocityMps, this.ascent.verticalVelocityMps) * 3.6)
  }
  get launchThrottle(): number { return this.stage === 'launch' ? this.ascent.throttle : 0 }
  get launchAltitudeKm(): number {
    if (this.stage !== 'launch') return 0
    return Math.round(this.ascent.altitudeM / 1_000)
  }
  get launchAltitudeM(): number { return this.ascent.altitudeM }
  get launchSpeedMps(): number { return Math.hypot(this.ascent.downrangeVelocityMps, this.ascent.verticalVelocityMps) }
  get currentAtmosphereLayer() {
    return this.atmosphereStrata?.getCurrentLayerName(this.ascent.altitudeM / 1_000)
  }
  get launchAccelerationMps2(): number { return this.ascent.accelerationMps2 }
  get launchFuelPercent(): number {
    const total = ASCENT_STAGES.reduce((sum, stage) => sum + stage.propellantKg, 0)
    return this.ascent.propellantKg / total * 100
  }
  get launchStageNumber(): number { return Math.min(this.ascent.stageIndex + 1, ASCENT_STAGES.length) }

  private elapsed = 0
  private stageTimer = 0
  private ascent: AscentState = createAscentState()
  private transit?: EarthMoonState
  private transitTimeWarp = 1_000
  private launchCameraPreset: LaunchCameraView = 'chase'
  private transitCameraPreset: TransitCameraView = 'craft'
  private tliBurnApplied = false
  private transitBurnVisualSeconds = 0
  private moonCaptured = false
  private maxQAnnounced = false
  private burnHeldByUi = false
  private readonly hangar = new THREE.Group()
  private readonly launchWaterRings: THREE.Mesh[] = []
  private launchEnv?: LaunchEnvironment
  private launchTower?: LaunchTower
  private troposphereClouds?: TroposphereCloudSystem
  private atmosphereStrata?: AtmosphereStrataController
  private rocketExhaust?: RocketExhaustSystem
  private sunCosmos?: SunCosmosController
  private activeHazardMessage?: string
  private announced30m = false
  private announced10m = false
  private isRollingOut = false
  private rolloutProgress = 0
  private readonly terrainRockObstacles: Array<{ x: number; z: number; radius: number; height: number }> = []
  private starsGroup!: THREE.Group
  private fullTrajectoryRoute?: THREE.Line
  private moonWaypointMarker?: THREE.Group
  private readonly space = new THREE.Group()
  private readonly moon = new THREE.Group()
  private readonly rocket = new THREE.Group()
  private readonly rocketProcedural = new THREE.Group()
  private readonly rocketImported = new THREE.Group()
  private readonly importedStageGroups = [new THREE.Group(), new THREE.Group(), new THREE.Group()]
  private heroModelPartitioned = false
  private heroBoosterGroups: {
    group: THREE.Group
    angle: number
    attachPosition: THREE.Vector3
    plume: THREE.Mesh
    light: THREE.PointLight
  }[] = []
  private readonly rocketStageGroups = [new THREE.Group(), new THREE.Group(), new THREE.Group()]
  private readonly stageWorldPosition = new THREE.Vector3()
  private readonly stageWorldQuaternion = new THREE.Quaternion()
  private readonly flightCraft = new THREE.Group()
  private transitCraftAssembly?: TransitCraftAssembly
  private transitElapsedReal = 0
  private transitExtractionComplete = false
  private transitRetroBurnActive = false
  private transitSteerYaw = 0
  private transitSteerPitch = 0
  private readonly flightPathLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: '#80e6e3', transparent: true, opacity: 0.95, depthWrite: false }),
  )
  private readonly transitPlume = new THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>(
    new THREE.ConeGeometry(0.55, 3.2, 16),
    new THREE.MeshBasicMaterial({ color: '#ff9922', transparent: true, opacity: 0.88, depthWrite: false }),
  )
  private readonly transitLight = new THREE.PointLight('#ffaa44', 7, 32)
  private readonly lander = addLander(new THREE.Group())
  private readonly rover = new THREE.Group()
  private readonly landingZoneMarker = new THREE.Group()
  private readonly landingDust = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 2.4, 32),
    new THREE.MeshBasicMaterial({ color: '#b7a079', transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide }),
  )
  private terrainRocks?: THREE.InstancedMesh
  private terrainRockCount = 0
  private demoLandingThrottle = 0
  private landingDustBurstSeconds = 0
  private readonly roverPlaceholder = new THREE.Group()
  private readonly wheelMeshes: THREE.Mesh[] = []
  private readonly wheelPivots: THREE.Group[] = []
  private readonly wheelRollGroups: THREE.Group[] = []
  private readonly steeringWheels: THREE.Group[] = []
  private readonly wheelLocalPositions: THREE.Vector3[] = []
  private readonly roverWheelHeights = new Float32Array(8)
  private readonly roverImportedWheels: THREE.Object3D[] = []
  private readonly suspensionStruts: THREE.Mesh[] = []
  private heroModel?: THREE.Group
  private roverModel?: THREE.Group
  private landingX = 4.2
  private landingZ = -2.7
  private roverX = 0
  private roverZ = 0
  private roverSpeed = 0
  private roverHeading = 0
  private targetMarker: THREE.Group[] = []
  private earthBody?: EarthBody
  private moonBody?: MoonBody
  private fullTrajectoryCurve?: THREE.QuadraticBezierCurve3
  private strapOnBoosters: {
    group: THREE.Group
    angle: number
    plume: THREE.Mesh
    light: THREE.PointLight
  }[] = []
  private detachedBoosters: {
    group: THREE.Group
    velocity: THREE.Vector3
    angularVelocity: THREE.Vector3
    life: number
    relPos?: THREE.Vector3
    relAccel?: THREE.Vector3
    sepPlumeOffLife?: number
  }[] = []
  private boostersSeparated = false
  private fairingJettisoned = false
  private readonly flightStart = EARTH_CENTER.clone().add(V3(EARTH_RADIUS_WORLD_UNITS + 1.2, 0, 0))
  private readonly transitTangent = new THREE.Vector3()
  private readonly transitUp = new THREE.Vector3(0, 1, 0)
  private readonly cameraRelativeOffset = new THREE.Vector3(26 * Math.sin(0.22), 14.5, 27 * Math.cos(0.22))
  private readonly cameraRelativeLook = new THREE.Vector3(0, 8.2, 0)
  private readonly sun: THREE.DirectionalLight
  private readonly earthshineLight: THREE.DirectionalLight
  private spaceSun?: SpaceSunController
  private readonly sceneMachine = new MissionSceneMachine<Input>()

  // ── Exhaust particle system ──────────────────────────────────────────────
  private readonly exhaustGroup = new THREE.Group()
  private exhaustActive = false
  private groundSteamBurst = false
  private exhaustLight!: THREE.PointLight

  private readonly FIRE_N = 140
  private firePosArr!: Float32Array
  private fireVelArr!: Float32Array
  private fireLifeArr!: Float32Array
  private fireColArr!: Float32Array
  private firePts!: THREE.Points

  private readonly SMOKE_N = 640
  private smokePosArr!: Float32Array
  private smokeVelArr!: Float32Array
  private smokeLifeArr!: Float32Array
  private smokeMaxLifeArr!: Float32Array
  private smokeSizeArr!: Float32Array
  private smokeBaseSizeArr!: Float32Array
  private smokeOpacityArr!: Float32Array
  private smokePts!: THREE.Points

  private readonly STEAM_N = 90
  private steamPosArr!: Float32Array
  private steamVelArr!: Float32Array
  private steamLifeArr!: Float32Array
  private steamPts!: THREE.Points

  constructor(private readonly renderer: Renderer) {
    this.scene.background = new THREE.Color('#0a1324')
    this.scene.fog = new THREE.FogExp2('#b8623b', 0.0016)
    this.scene.add(new THREE.HemisphereLight('#85abcf', '#63422e', 1.15))
    this.sun = new THREE.DirectionalLight('#ffb470', 3.8)
    this.sun.position.set(-42, 24, -38)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(renderer.shadowMapSize, renderer.shadowMapSize)
    this.sun.shadow.camera.left = -55
    this.sun.shadow.camera.right = 55
    this.sun.shadow.camera.top = 55
    this.sun.shadow.camera.bottom = -55
    this.sun.shadow.camera.far = 160
    this.sun.shadow.bias = -0.00025
    this.scene.add(this.sun, this.sun.target)

    this.earthshineLight = new THREE.DirectionalLight('#1e4d82', 0)
    this.earthshineLight.position.set(0, -100, 0)
    this.scene.add(this.earthshineLight, this.earthshineLight.target)

    this.starsGroup = new THREE.Group()
    addStars(this.starsGroup, 1200, 330, 7182)
    this.starsGroup.visible = false
    this.camera.add(this.starsGroup)
    this.scene.add(this.camera)
    this.scene.add(this.hangar, this.space, this.moon)
    this.hangar.add(this.rocket)
    this.rocket.add(this.rocketProcedural, this.rocketImported)
    this.rocketImported.add(...this.importedStageGroups)
    // Exhaust glow light on the rocket
    this.exhaustLight = new THREE.PointLight('#ff7700', 0, 28)
    this.exhaustLight.position.set(0, -1, 0)
    this.rocket.add(this.exhaustLight)
    this.rocket.position.set(0, 0, 0)
    this.makeHangar()
    this.initExhaust()
    this.makeSpace()
    this.makeMoon()
    this.makeRover()
    this.rocketImported.visible = false
    this.rocketProcedural.visible = true
    this.sun.target.position.set(0, 0, 0)
    this.rebuildRocket()
    this.registerMissionScenes()
    this.setStage('title')
    this.camera.position.set(0, 14.5, 27)
    this.camera.lookAt(0, 8.2, 0)

    // Mouse / Touch drag to spin rocket on the launch pad
    let isDragging = false
    let lastPointerX = 0
    this.renderer.canvas.addEventListener('pointerdown', e => {
      if (this.stage === 'title' || this.stage === 'countdown') {
        isDragging = true
        lastPointerX = e.clientX
      }
    })
    window.addEventListener('pointermove', e => {
      if (isDragging && (this.stage === 'title' || this.stage === 'countdown')) {
        const dx = e.clientX - lastPointerX
        lastPointerX = e.clientX
        this.rocket.rotation.y += dx * 0.009
      }
    })
    window.addEventListener('pointerup', () => { isDragging = false })
    window.addEventListener('pointercancel', () => { isDragging = false })
  }

  async loadModels(assets: Assets, urls: { rocket: string; rover: string }): Promise<{ rocket: boolean; rover: boolean }> {
    const results = await Promise.allSettled([
      assets.gltf(urls.rocket).then(gltf => {
        const model = gltf.scene.clone(true)
        model.traverse(node => {
          if ((node as THREE.Mesh).isMesh) {
            const m = node as THREE.Mesh
            m.castShadow = true
            m.receiveShadow = true
            if (m.material && (m.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
              const mat = m.material as THREE.MeshStandardMaterial
              mat.roughness = 0.28
              mat.metalness = 0.35
              mat.envMapIntensity = 1.3
              mat.needsUpdate = true
            }
          }
        })
        this.heroModel = model
        this.initImportedRocket(model)
        this.syncRocket()
      }),
      assets.gltf(urls.rover).then(gltf => {
        const model = gltf.scene.clone(true)
        const bounds = new THREE.Box3().setFromObject(model)
        const size = bounds.getSize(new THREE.Vector3())
        const center = bounds.getCenter(new THREE.Vector3())
        const scale = 3.4 / Math.max(size.x, size.z, 0.001)
        model.scale.setScalar(scale)
        model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale)
        model.traverse(node => {
          if ((node as THREE.Mesh).isMesh) {
            const m = node as THREE.Mesh
            m.castShadow = true
            m.receiveShadow = true
            if (m.material && (m.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
              const mat = m.material as THREE.MeshStandardMaterial
              mat.roughness = 0.28
              mat.metalness = 0.35
              mat.envMapIntensity = 1.3
              mat.needsUpdate = true
            }
          }
        })
        this.roverModel = new THREE.Group()
        this.roverModel.add(model)
        this.rover.add(this.roverModel)
        this.roverImportedWheels.length = 0
        this.roverModel.traverse(node => {
          if (node.name && /wheel|tyre|tire/i.test(node.name)) this.roverImportedWheels.push(node)
        })
        this.roverPlaceholder.visible = false
      }),
    ])
    return { rocket: results[0].status === 'fulfilled', rover: results[1].status === 'fulfilled' }
  }

  begin(): void {
    this.demoMode = false
    this.resetMission()
  }

  beginDemo(): void {
    this.demoMode = true
    this.resetMission()
  }

  demoStartLaunch(): void {
    if (this.demoMode && (this.stage === 'countdown' || this.stage === 'launch')) this.setStage('launch')
  }

  demoStartTransit(): void {
    if (!this.demoMode) return
    if (!this.ascent.insertionComplete) {
      const orbitRadiusM = EARTH_RADIUS_M + 185_000
      this.ascent.downrangeM = 0
      this.ascent.positionYM = orbitRadiusM
      this.ascent.altitudeM = 185_000
      this.ascent.downrangeVelocityMps = Math.sqrt(EARTH_GRAVITATIONAL_PARAMETER / orbitRadiusM)
      this.ascent.verticalVelocityMps = 0
      this.ascent.insertionComplete = true
      this.ascent.pitchRad = Math.PI / 2
    }
    this.burnProgress = 100
    this.autopilotEnabled = true
    this.transitTimeWarp = 32_000
    this.setStage('transit')
  }

  demoBeginLanding(): void {
    if (!this.demoMode || this.stage !== 'transit') return
    this.moonCaptured = true
    this.autopilotEnabled = false
    this.beginLanding()
  }

  demoSyncDescent(state: DescentState): void {
    if (!this.demoMode || this.stage !== 'landing') return
    this.altitude = state.altitudeM
    this.verticalSpeed = state.verticalSpeedMps
    this.fuel = state.fuelPercent
    this.landingPitchRad = state.pitchRad
    this.landingRollRad = state.rollRad
    this.demoLandingThrottle = state.throttle
    const siteX = this.demoLandingSite ? THREE.MathUtils.clamp(this.demoLandingSite.longitudeDeg * 0.12, -24, 24) : 0
    const siteZ = this.demoLandingSite ? THREE.MathUtils.clamp(this.demoLandingSite.latitudeDeg * 0.12, -18, 18) : 0
    this.landingX = siteX + state.xM
    this.landingZ = siteZ + state.zM
  }

  demoCompleteLanding(outcome: DescentOutcome): void {
    if (!this.demoMode || this.stage !== 'landing') return
    this.landingOutcome = outcome
    this.demoLandingThrottle = 0
    this.landingDustBurstSeconds = 0.8
    this.statusMessage = `Qo‘nish natijasi: ${outcome.toUpperCase()}.`
  }

  demoPrepareNavigator(): void {
    if (!this.demoMode || this.stage !== 'transit' || this.moonCaptured || !this.transit) return
    const state = this.transit
    const moonRate = Math.sqrt(EARTH_GRAVITATIONAL_PARAMETER / EARTH_MOON_DISTANCE_M ** 3)
    const angle = state.moonPhaseRad + state.moonDirection * moonRate * state.elapsedSeconds
    const moonX = Math.cos(angle) * EARTH_MOON_DISTANCE_M
    const moonY = Math.sin(angle) * EARTH_MOON_DISTANCE_M
    const moonVx = -Math.sin(angle) * moonRate * EARTH_MOON_DISTANCE_M * state.moonDirection
    const moonVy = Math.cos(angle) * moonRate * EARTH_MOON_DISTANCE_M * state.moonDirection
    state.xM = moonX + 100_000
    state.yM = moonY
    state.vxMps = moonVx
    state.vyMps = moonVy
    const correction = captureIntoLunarOrbit(state)
    this.moonCaptured = true
    this.statusMessage = `Oy orbitasiga tormozlash bajarildi: ${correction.toFixed(0)} m/s.`
  }

  setDemoLandingSite(site: LandingSite): void {
    if (!this.demoMode) return
    this.demoLandingSite = site
    this.landingX = THREE.MathUtils.clamp(site.longitudeDeg * 0.12, -24, 24)
    this.landingZ = THREE.MathUtils.clamp(site.latitudeDeg * 0.12, -18, 18)
    this.landingZoneMarker.position.set(this.landingX, lunarTerrainHeight(this.landingX, this.landingZ), this.landingZ)
    this.landingZoneMarker.scale.setScalar(site.safeZoneRadiusM / site.difficultyModifier / 80)
    if (this.terrainRocks) this.terrainRocks.count = Math.round(this.terrainRockCount * site.boulderDensity)
    this.sun.position.set(
      Math.cos(site.lightingAngleRad) * 40,
      Math.sin(site.lightingAngleRad) * 18 + 5,
      Math.sin(site.lightingAngleRad) * 40,
    )
    this.sun.intensity = 1.8 + site.sunlight / 100
  }

  private resetMission(): void {
    tuning.activate('mission')
    this.burnProgress = 0
    this.autopilotEnabled = true // Auto-pilot is enabled by default for realistic computer-guided lunar mission
    this.fuel = 100
    this.oxygen = 100
    this.researched.clear()
    this.statusMessage = ''
    this.demoLandingSite = null
    this.landingX = 4.2
    this.landingZ = -2.7
    this.landingZoneMarker.position.set(0, 0, 0)
    this.landingZoneMarker.scale.setScalar(1)
    this.demoLandingThrottle = 0
    this.landingDustBurstSeconds = 0
    if (this.terrainRocks) this.terrainRocks.count = this.terrainRockCount
    this.ascent = createAscentState()
    this.maxQAnnounced = false
    this.ascentTelemetry.count = 0
    this.ascentTelemetry.next = 0
    this.rocket.position.set(0, 0, 0)
    for (const b of this.strapOnBoosters) {
      b.group.parent?.remove(b.group)
    }
    for (const db of this.detachedBoosters) {
      db.group.parent?.remove(db.group)
    }
    this.strapOnBoosters = []
    this.detachedBoosters = []
    this.boostersSeparated = false
    this.fairingJettisoned = false
    this.rebuildRocket()
    this.launchTower?.reset()
    this.rocketExhaust?.setCryoVenting?.(false)
    this.rocketExhaust?.setActive(false)
    this.setStage('countdown')
  }

  addTransferBurn(): void {
    if (this.stage === 'transit') this.burnProgress = Math.min(100, this.burnProgress + 17)
  }

  setTimeWarp(multiplier: number): boolean {
    if (!(TRANSIT_TIME_WARP_OPTIONS as readonly number[]).includes(multiplier)) return false
    this.transitTimeWarp = multiplier
    return true
  }

  setLaunchCameraView(view: LaunchCameraView): boolean {
    if (this.stage !== 'launch' || !['chase', 'engine', 'cabin'].includes(view)) return false
    this.launchCameraPreset = view
    return true
  }

  setTransitCameraView(view: TransitCameraView): boolean {
    if (this.stage !== 'transit' || !['craft', 'overview'].includes(view)) return false
    this.transitCameraPreset = view
    return true
  }

  setAutopilot(enabled: boolean): boolean {
    if (this.stage !== 'transit' && this.stage !== 'landing') return false
    this.autopilotEnabled = enabled
    this.statusMessage = enabled ? 'Avtopilot yoqildi.' : 'Qo‘lda boshqarish yoqildi.'
    return true
  }

  setDifficulty(difficulty: string): boolean {
    if (difficulty !== 'easy' && difficulty !== 'normal' && difficulty !== 'hard') return false
    this.difficulty = difficulty
    return true
  }

  beginLanding(): void {
    if (this.stage !== 'transit' || !this.moonCaptured) return
    tuning.activate('landing')
    this.altitude = 48
    this.verticalSpeed = -3.1
    this.fuel = 100
    this.landingPitchRad = 0
    this.landingRollRad = 0
    this.landingOutcome = null
    this.autopilotEnabled = true
    this.announced30m = false
    this.announced10m = false
    if (!this.demoMode || !this.demoLandingSite) {
      this.landingX = 4.2
      this.landingZ = -2.7
    }
    this.stageTimer = 0
    const parachutes = this.lander.userData.parachutes as THREE.Group | undefined
    if (parachutes) parachutes.visible = true
    speakRobotic('Внимание. Идёт посадка на Луну. Идёт посадка на Луну. Парашютная система раскрыта. Двигатели в норме.')
    this.setStage('landing')
  }

  setThrustButton(down: boolean): void {
    this.burnHeldByUi = down
  }

  pulseLandingThrust(): void {
    if (this.stage !== 'landing' || this.fuel <= 0) return
    this.verticalSpeed = Math.min(4.1, this.verticalSpeed + CONFIG.mission.landingBurstImpulse)
    this.fuel = Math.max(0, this.fuel - 3)
  }

  retryLanding(): void {
    if (this.stage !== 'landingFailed') return
    tuning.activate('landing')
    this.altitude = 48
    this.verticalSpeed = -3.1
    this.fuel = 100
    this.landingPitchRad = 0
    this.landingRollRad = 0
    this.landingOutcome = null
    this.landingX = 4.2
    this.landingZ = -2.7
    this.stageTimer = 0
    this.setStage('landing')
  }

  togglePause(): void {
    if (this.stage === 'title' || this.stage === 'complete') return
    this.paused = !this.paused
  }

  resume(): void { this.paused = false }

  toTitle(): void {
    this.paused = false
    this.rebuildRocket()
    this.setStage('title')
  }

  nearestResearch(): { id: string; title: string; detail: string; distance: number } | null {
    if (this.stage !== 'surface') return null
    const point = RESEARCH_OBJECTIVES.filter(target => !this.researched.has(target.id))
      .map(target => ({ ...target, distance: Math.hypot(target.position.x - this.roverX, target.position.z - this.roverZ) }))
      .sort((a, b) => a.distance - b.distance)[0]
    return point ? { id: point.id, title: point.title, detail: point.detail, distance: point.distance } : null
  }

  interact(): boolean {
    if (this.stage !== 'surface') return false
    const nearest = this.nearestResearch()
    if (!nearest || nearest.distance > CONFIG.mission.interactionRadius) {
      this.statusMessage = 'Ilmiy nuqtaga yaqinroq boring.'
      return false
    }
    this.researched.add(nearest.id)
    this.statusMessage = `Ma’lumot olindi: ${nearest.title}.`
    this.targetMarker[RESEARCH_OBJECTIVES.findIndex(item => item.id === nearest.id)]?.children.forEach(child => {
      const material = (child as THREE.Mesh).material
      if (material && !Array.isArray(material) && 'color' in material) (material as THREE.MeshStandardMaterial).color.set('#86e6b4')
    })
    if (this.researched.size === RESEARCH_OBJECTIVES.length) this.setStage('complete')
    return true
  }

  step(dt: number, input: Input): void {
    if (this.paused || this.stage === 'complete') return
    if (this.demoMode && this.stage === 'landing') return

    // ── Rocket Rotation (Q / E keys, A / D keys, Arrow keys) ──
    if (this.stage === 'title' || this.stage === 'countdown') {
      let turn = 0
      if (input.keyHeld('KeyQ') || input.keyHeld('KeyA') || input.keyHeld('ArrowLeft')) turn += 1
      if (input.keyHeld('KeyE') || input.keyHeld('KeyD') || input.keyHeld('ArrowRight')) turn -= 1
      if (turn !== 0) {
        this.rocket.rotation.y += turn * dt * 1.8
      }
      if (this.stage === 'title') return
    }

    if (this.stage === 'countdown') {
      this.stageTimer += dt
      const countdownTotal = this.demoMode ? 8.5 : 6.5
      const timeRemaining = countdownTotal - this.stageTimer

      // 1. Synchronize vertical rocket elevation with hydraulic support lift
      const liftY = this.launchTower?.getRocketLiftY() ?? 0
      this.rocket.position.set(0, liftY, 0)

      // 2. Realistic Countdown Sequence Announcements & Cryogenic Venting
      if (this.stageTimer < 2.4) {
        this.rocketExhaust?.setCryoVenting?.(false)
        this.statusMessage = 'GIDRAVLIK KO‘TARISH TIZIMI ISHGA TUSHDI: 3 ta ulkan tulpan tutqichlari raketani uchirish holatiga ko‘tardi (+1.6 m)...'
      } else if (this.stageTimer < 4.2) {
        this.rocketExhaust?.setCryoVenting?.(true)
        this.statusMessage = 'KRIOGEN BOSIM NORMAL: Suyuq kislorod klapanlari ventilyatsiya qilmoqda. Raketa ko‘tarilgan holatda.'
      } else if (this.stageTimer < 5.9) {
        this.statusMessage = 'DVIGATELLAR YONDIRILDI! Asosiy va yon bosqich dvigatellari 100% quvvatga chiqmoqda...'
      } else {
        this.rocketExhaust?.setCryoVenting?.(false)
        this.statusMessage = 'TUTQICHLAR TO‘LIQ OCHILDI! Uchirish moslamalari ajraldi. PARVOZ!'
      }

      // 3. Pre-liftoff Pad Fuel Ignition & Massive Deluge Steam (T-2.3s to T-0.0s before liftoff)
      if (timeRemaining <= 2.3) {
        const ignitionProgress = THREE.MathUtils.clamp((2.3 - timeRemaining) / 1.7, 0, 1)
        const preLiftoffThrottle = THREE.MathUtils.lerp(0.45, 1.0, ignitionProgress)
        this.rocketExhaust?.setActive(true)
        this.rocketExhaust?.update(
          dt,
          this.rocket.position,
          this.rocket.quaternion,
          preLiftoffThrottle,
          0,
          0,
          this.elapsed,
          0,
          this.heroModelPartitioned ? -0.34 : 0,
        )
      } else {
        // Update exhaust system for cryo venting even before main engine ignition
        this.rocketExhaust?.update(
          dt,
          this.rocket.position,
          this.rocket.quaternion,
          0,
          0,
          0,
          this.elapsed,
          0,
          this.heroModelPartitioned ? -0.34 : 0,
        )
      }

      if (this.stageTimer >= countdownTotal) {
        this.stageTimer = 0
        this.setStage('launch')
        this.statusMessage = 'UCHIRISH MOSLAMALARI BO‘SHATILDI: Raketa asta-sekin ko‘tarilmoqda va parvoz boshlandi!'
      }
      return
    }
    this.sceneMachine.update(dt, input)
  }

  private registerMissionScenes(): void {
    const thisMission = this
    this.sceneMachine.register(new LaunchMissionScene({
      get ascent() { return thisMission.ascent },
      rocket: this.rocket,
      get stageTimer() { return thisMission.stageTimer },
      set stageTimer(value: number) { thisMission.stageTimer = value },
      get maxQAnnounced() { return thisMission.maxQAnnounced },
      set maxQAnnounced(value: boolean) { thisMission.maxQAnnounced = value },
      get timeScale() { return thisMission.demoMode ? 75 : 1 },
      get demoMode() { return thisMission.demoMode },
      sampleTelemetry: () => this.sampleAscentTelemetry(),
      separateStage: index => this.separateRocketStage(index),
      separateBoosters: () => this.separateBoosters(),
      jettisonFairing: () => this.jettisonFairing(),
      setStatus: message => { this.statusMessage = message },
      setStage: stage => this.setStage(stage),
    }))
    this.sceneMachine.register(new TransitMissionScene({
      get autopilotEnabled() { return thisMission.autopilotEnabled },
      get burnProgress() { return thisMission.burnProgress },
      set burnProgress(value: number) { thisMission.burnProgress = value },
      advanceTransit: (dt, input) => this.advanceTransit(dt, input),
    }))
    this.sceneMachine.register(new LandingMissionScene({
      get stageTimer() { return thisMission.stageTimer },
      set stageTimer(value: number) { thisMission.stageTimer = value },
      get autopilotEnabled() { return thisMission.autopilotEnabled },
      get burnHeldByUi() { return thisMission.burnHeldByUi },
      get landingX() { return thisMission.landingX },
      set landingX(value: number) { thisMission.landingX = value },
      get landingZ() { return thisMission.landingZ },
      set landingZ(value: number) { thisMission.landingZ = value },
      get altitude() { return thisMission.altitude },
      set altitude(value: number) { thisMission.altitude = value },
      get verticalSpeed() { return thisMission.verticalSpeed },
      set verticalSpeed(value: number) { thisMission.verticalSpeed = value },
      get fuel() { return thisMission.fuel },
      set fuel(value: number) { thisMission.fuel = value },
      get pitchRad() { return thisMission.landingPitchRad },
      set pitchRad(value: number) { thisMission.landingPitchRad = value },
      get rollRad() { return thisMission.landingRollRad },
      set rollRad(value: number) { thisMission.landingRollRad = value },
      get difficulty() { return thisMission.difficulty },
      getSlopeDegrees: () => this.sampleLandingSlope(),
      landSuccessful: outcome => this.landSuccessful(outcome),
      setStatus: message => { this.statusMessage = message },
      setStage: stage => this.setStage(stage),
    }))
    this.sceneMachine.register(new SurfaceMissionScene({
      get roverSpeed() { return thisMission.roverSpeed },
      set roverSpeed(value: number) { thisMission.roverSpeed = value },
      get roverHeading() { return thisMission.roverHeading },
      set roverHeading(value: number) { thisMission.roverHeading = value },
      get roverX() { return thisMission.roverX },
      set roverX(value: number) { thisMission.roverX = value },
      get roverZ() { return thisMission.roverZ },
      set roverZ(value: number) { thisMission.roverZ = value },
      get oxygen() { return thisMission.oxygen },
      set oxygen(value: number) { thisMission.oxygen = value },
      steeringWheels: this.steeringWheels,
      get isRollingOut() { return thisMission.isRollingOut },
      interact: () => this.interact(),
    }))
    this.sceneMachine.register({ id: 'title', enter() {}, update() {}, exit() {} })
    this.sceneMachine.register({ id: 'countdown', enter() {}, update() {}, exit() {} })
    this.sceneMachine.register({
      id: 'landingFailed', enter() {}, exit() {},
      update: (_dt, input) => { if (input.consume('confirm')) this.retryLanding() },
    })
    this.sceneMachine.register({ id: 'complete', enter() {}, update() {}, exit() {} })
  }

  private initializeTransit(): void {
    const radiusM = Math.hypot(this.ascent.downrangeM, this.ascent.positionYM)
    if (radiusM < 1) throw new Error('Transit insertion state is invalid.')
    const angle = Math.atan2(this.ascent.positionYM, this.ascent.downrangeM)
    const insertion = {
      xM: this.ascent.downrangeM,
      yM: this.ascent.positionYM,
      vxMps: this.ascent.downrangeVelocityMps,
      vyMps: this.ascent.verticalVelocityMps,
    }
    const direction = insertion.xM * insertion.vyMps - insertion.yM * insertion.vxMps >= 0 ? 1 : -1
    this.transit = createEarthMoonState(insertion, angle + direction * 115 * Math.PI / 180)
    this.transitTimeWarp = 28_000
    this.transitCameraPreset = 'craft'
    this.tliBurnApplied = false
    this.transitBurnVisualSeconds = 4.0
    this.moonCaptured = false
    this.burnProgress = 100
    this.transitElapsedReal = 0
    this.transitExtractionComplete = false
    this.transitRetroBurnActive = false
    this.transitSteerYaw = 0
    this.transitSteerPitch = 0
    this.transitCraftAssembly?.updateExtraction(0)
    this.statusMessage = '🛰️ KOSMIK MODUL AJRATILMOQDA: Bosh qopqoqlar ochilib, modul raketadan chiqmoqda...'
  }

  private advanceTransit(realDt: number, input: Input): void {
    const state = this.transit
    if (!state) return

    this.transitElapsedReal += realDt
    this.transitCraftAssembly?.updateExtraction(this.transitElapsedReal)

    if (this.transitElapsedReal >= 3.2 && !this.transitExtractionComplete) {
      this.transitExtractionComplete = true
      this.statusMessage = '🛰️ KOSMIK MODUL RAKETADAN TO‘LIQ AJRALDI! Quyosh panellari yoyildi. Oy sari translunar parvoz boshlandi.'
    }

    // ── Active RCS Cold-Gas Thruster Steering ("gaz bilan boshqarilib") ──
    let firingPitch = 0
    let firingYaw = 0

    const moveX = input?.move?.x ?? 0
    const moveY = input?.move?.y ?? 0

    if (moveX < -0.1) {
      this.transitSteerYaw -= realDt * 1.8
      firingYaw = -1
    } else if (moveX > 0.1) {
      this.transitSteerYaw += realDt * 1.8
      firingYaw = 1
    }
    if (moveY > 0.1) {
      this.transitSteerPitch += realDt * 1.8
      firingPitch = 1
    } else if (moveY < -0.1) {
      this.transitSteerPitch -= realDt * 1.8
      firingPitch = -1
    }

    // Autopilot / Trajectory Stabilizer guides attitude towards the Moon
    if (Math.abs(moveX) <= 0.1 && Math.abs(this.transitSteerYaw) > 0.01) {
      const step = Math.sign(this.transitSteerYaw) * Math.min(Math.abs(this.transitSteerYaw), realDt * 2.4)
      this.transitSteerYaw -= step
      firingYaw = -Math.sign(this.transitSteerYaw)
    }
    if (Math.abs(moveY) <= 0.1 && Math.abs(this.transitSteerPitch) > 0.01) {
      const step = Math.sign(this.transitSteerPitch) * Math.min(Math.abs(this.transitSteerPitch), realDt * 2.4)
      this.transitSteerPitch -= step
      firingPitch = -Math.sign(this.transitSteerPitch)
    }

    this.transitCraftAssembly?.setRcs(firingPitch, firingYaw, this.transitRetroBurnActive)

    this.transitBurnVisualSeconds = Math.max(0, this.transitBurnVisualSeconds - realDt)
    if (!this.tliBurnApplied) {
      const radiusM = Math.hypot(state.xM, state.yM)
      const currentSpeed = Math.hypot(state.vxMps, state.vyMps)
      const transferSemiMajorAxisM = (radiusM + EARTH_MOON_DISTANCE_M) / 2
      const transferSpeedMps = Math.sqrt(EARTH_GRAVITATIONAL_PARAMETER * (2 / radiusM - 1 / transferSemiMajorAxisM))
      applyProgradeBurn(state, Math.max(0, transferSpeedMps - currentSpeed))
      this.tliBurnApplied = true
      this.transitBurnVisualSeconds = 3
    }

    // Dynamic Cruise Warp across space (15s nominal, or ~6s with turbo)
    const isAccelerated = input?.held('jump') || this.burnHeldByUi
    const warp = isAccelerated ? 72_000 : 28_000
    let remainingSeconds = Math.min(Math.max(0, realDt * warp), 24_000)
    while (remainingSeconds > 0) {
      const stepSeconds = Math.min(remainingSeconds, 60)
      stepEarthMoon(state, stepSeconds)
      remainingSeconds -= stepSeconds
    }

    const prog = this.transferProgress

    // ── Retrograde Braking in (^) Attitude ("keyin oyga gaz bilan '^' gaz mana shunaqa bulib") ──
    if (prog >= 0.88 && !this.transitRetroBurnActive) {
      this.transitRetroBurnActive = true
      this.statusMessage = '🌕 OYGA YETIB KELINDI! RETRO-GAZ ZARBI (LOI) ISHGA TUSHDI (^)! Kema sekinlashtirilmoqda, Oy orbitasiga kirildi.'
    }

    // ── Low Lunar Orbit Capture & LEM Undocking ("keyin asta-sekin chiqsin") ──
    if (prog >= 0.98 && !this.moonCaptured) {
      this.moonCaptured = true
      captureIntoLunarOrbit(state)
      this.transitCraftAssembly?.updateLemUndock(1.0)
      this.statusMessage = '🌕 OY ORBITASIGA MUVAFFOQIYATLI KIRILDI (100 km)! Qo‘nish moduli (LEM) ajraldi, Oy yuzasiga tushish boshlanmoqda...'
      window.setTimeout(() => this.beginLanding(), 2500)
    }
  }

  fastForwardToMoon(): void {
    if (this.stage !== 'transit' || !this.transit) return
    const state = this.transit
    state.elapsedSeconds = TRANSIT_DURATION_SECONDS * 0.96
    this.transitElapsedReal = 5.0
    this.transitCraftAssembly?.updateExtraction(5.0)
    this.transitRetroBurnActive = true
    if (this.fullTrajectoryCurve) {
      const prog = 0.96
      this.flightCraft.position.copy(this.fullTrajectoryCurve.getPoint(prog))
      const tangent = this.fullTrajectoryCurve.getTangent(prog).normalize()
      this.transitTangent.copy(tangent)
      this.flightCraft.quaternion.setFromUnitVectors(this.transitUp, tangent.clone().negate())
    }
    const correction = captureIntoLunarOrbit(state)
    this.moonCaptured = true
    this.transitBurnVisualSeconds = 3.5
    this.statusMessage = `🌕 OY ORBITASIGA MUVAFFOQIYATLI KIRILDI (${correction.toFixed(0)} m/s)! Oy yuzasi va kraterlari bevosita oldingizda ko‘rinmoqda.`
    this.burnProgress = 100
  }

  render(frameSeconds: number): void {
    const safeFrame = Math.max(0, frameSeconds)
    this.renderer.adaptQuality(safeFrame)
    this.elapsed += safeFrame
    const dt = Math.min(safeFrame, 0.05)
    this.earthBody?.update(dt)

    // Update physically detached Korolev cross boosters & fairings (rocket-relative aerodynamics so separation stays crisply visible!)
    for (let i = this.detachedBoosters.length - 1; i >= 0; i--) {
      const b = this.detachedBoosters[i]!
      b.life -= dt
      if (b.life <= 0) {
        b.group.parent?.remove(b.group)
        this.detachedBoosters.splice(i, 1)
        continue
      }
      if (b.relPos) {
        if (b.relAccel) b.velocity.addScaledVector(b.relAccel, dt)
        b.relPos.addScaledVector(b.velocity, dt)
        b.group.position.copy(this.rocket.position).add(b.relPos)
      } else {
        b.velocity.y -= 9.8 * dt // Earth gravity
        b.group.position.addScaledVector(b.velocity, dt)
      }

      // Solid motor separation burn cuts off cleanly after retro-kick
      if (b.life < (b.sepPlumeOffLife ?? 23.5)) {
        const sepPlume = b.group.getObjectByName('BoosterSepPlume')
        if (sepPlume) b.group.remove(sepPlume)
      }

      const angSpeed = b.angularVelocity.length()
      if (angSpeed > 0.001) {
        const deltaRot = new THREE.Quaternion().setFromAxisAngle(
          b.angularVelocity.clone().normalize(),
          angSpeed * dt
        )
        b.group.quaternion.multiplyQuaternions(deltaRot, b.group.quaternion)
      }
    }

    // Update attached booster plumes and lights during pre-liftoff ignition & ascent
    if (!this.boostersSeparated && (this.stage === 'launch' || this.stage === 'countdown')) {
      const countdownTotal = this.demoMode ? 8.5 : 6.5
      const countdownIgnited = this.stage === 'countdown' && countdownTotal - this.stageTimer <= 2.3
      const throttle = this.stage === 'launch'
        ? this.ascent.throttle
        : countdownIgnited
          ? THREE.MathUtils.lerp(0.45, 1.0, THREE.MathUtils.clamp((2.3 - (countdownTotal - this.stageTimer)) / 1.7, 0, 1))
          : 0
      const isFiring = this.stage === 'launch'
        ? !this.ascent.insertionComplete && (throttle > 0.05 || this.stageTimer < 2.0)
        : countdownIgnited
      const visThrottle = Math.max(0.7, throttle)
      for (const b of this.strapOnBoosters) {
        b.plume.visible = isFiring
        b.light.visible = isFiring
        if (isFiring) {
          const flicker = 0.88 + Math.random() * 0.24
          b.plume.scale.set(flicker, flicker * (0.8 + visThrottle * 0.5), flicker)
          b.light.intensity = 2.5 * visThrottle * flicker
        }
      }
    }

    if (['title', 'countdown', 'launch'].includes(this.stage)) {
      const moonAngle = this.elapsed * EARTH_MOON_MEAN_MOTION
      this.moonBody?.group.position.set(
        Math.cos(moonAngle) * EARTH_MOON_DISTANCE_M,
        -EARTH_RADIUS_M,
        Math.sin(moonAngle) * EARTH_MOON_DISTANCE_M,
      )
      if (this.scene.fog instanceof THREE.FogExp2) {
        const altKm = this.ascent.altitudeM / 1_000
        if (altKm >= 14) {
          this.scene.fog.density = 0
        } else {
          this.scene.fog.density = 0.0016 * Math.exp(-this.ascent.altitudeM / 4_500)
          const fogDarken = THREE.MathUtils.clamp((altKm - 4) / 10, 0, 1)
          this.scene.fog.color.lerpColors(new THREE.Color('#b8623b'), new THREE.Color('#020408'), fogDarken)
        }
      }
    } else {
      this.moonBody?.update(dt, EARTH_CENTER)
    }
    if (this.stage === 'transit') {
      const prog = THREE.MathUtils.clamp(this.transferProgress, 0, 1)

      if (this.fullTrajectoryCurve) {
        // Spacecraft position and orientation along full flight curve (0 -> o)
        const craftPt = this.fullTrajectoryCurve.getPoint(prog)
        this.flightCraft.position.copy(craftPt)

        const tangent = this.fullTrajectoryCurve.getTangent(prog).normalize()
        this.transitTangent.copy(tangent)

        // Orientation: if retro-braking (^), flip 180 degrees so engine faces forward to brake!
        if (this.transitRetroBurnActive) {
          const retroTarget = tangent.clone().negate()
          this.flightCraft.quaternion.setFromUnitVectors(this.transitUp, retroTarget)
        } else {
          this.flightCraft.quaternion.setFromUnitVectors(this.transitUp, tangent)
        }

        // Apply RCS steering tilts
        this.flightCraft.rotateZ(this.transitSteerYaw * 0.45)
        this.flightCraft.rotateX(this.transitSteerPitch * 0.45)

        // 1. Earth visibly recedes and shrinks behind the craft ("0")
        if (this.earthBody) {
          const startPt = this.fullTrajectoryCurve.getPoint(0)
          const earthDist = 26.0 + prog * 70.0
          const earthPos = startPt.clone().sub(tangent.clone().multiplyScalar(earthDist))
          this.earthBody.group.position.copy(earthPos)
          const earthScale = Math.max(0.06, 1.0 - Math.pow(prog, 0.6) * 0.94)
          this.earthBody.group.scale.setScalar(earthScale)
          this.earthBody.earthMesh.rotation.y += dt * 0.05
        }

        // 2. Moon visibly looms larger and approaches in front of the craft ("o")
        if (this.moonBody) {
          const endPt = this.fullTrajectoryCurve.getPoint(1)
          const arrivalTangent = this.fullTrajectoryCurve.getTangent(1).normalize()
          // Moon arrives right at the destination of the trajectory!
          const moonDist = Math.max(3.8, 14.0 * Math.pow(1 - prog, 0.75))
          const moonPos = endPt.clone().add(arrivalTangent.clone().multiplyScalar(moonDist))
          this.moonBody.group.position.copy(moonPos)
          // Moon scales from 3.5 in deep space up to 26.0 in low lunar orbit
          const moonScale = 3.5 + Math.pow(prog, 1.35) * 22.5
          this.moonBody.group.scale.setScalar(moonScale)
          this.moonBody.moonMesh.rotation.y += dt * 0.02
        }

        // 3. Moon Waypoint Target Marker
        if (this.moonWaypointMarker && this.moonBody) {
          this.moonWaypointMarker.position.copy(this.moonBody.group.position)
          this.moonWaypointMarker.lookAt(this.camera.position)
          const pulse = 1.0 + Math.sin(this.elapsed * 3.5) * 0.07
          this.moonWaypointMarker.scale.setScalar(pulse)
        }

        // 4. Update completed flight path line
        this.flightPathLine.geometry.setDrawRange(0, Math.ceil(prog * 120) + 1)
        this.flightPathLine.visible = true
      }

      this.flightCraft.rotateY(Math.sin(this.elapsed * 0.5) * 0.025)

      // Active propulsion engine flame & dynamic cruise burn
      const burnVisible = this.transitBurnVisualSeconds > 0 || this.transitRetroBurnActive
      this.transitPlume.visible = true
      this.transitLight.visible = true
      const flameFlicker = 0.90 + Math.sin(this.elapsed * 26) * 0.10
      this.transitPlume.scale.set(flameFlicker, flameFlicker * (burnVisible ? 1.7 : 1.2), flameFlicker)
      this.transitPlume.material.opacity = burnVisible ? 0.95 : 0.82
      this.transitLight.intensity = burnVisible ? 8.5 : 4.5

      // Transit fuel consumption: drops progressively from 100% to ~45% at lunar capture
      this.fuel = Math.max(42, Math.round(100 - this.transferProgress * 55))

      this.sunCosmos?.update(dt, this.elapsed, this.camera.position)
    }
    if (this.stage === 'title' || this.stage === 'countdown') {
      const orbit = this.stage === 'title' ? Math.sin(this.elapsed * 0.045) * 0.22 : 0.22
      const padDesired = V3(26 * Math.sin(orbit), 14.5, 27 * Math.cos(orbit))
      const padLook = V3(0, 8.2, 0)
      this.camera.position.lerp(padDesired, 1 - Math.exp(-dt * 6.0))
      this.camera.lookAt(padLook)
      this.sun.target.position.copy(padLook)
      this.cameraRelativeOffset.set(26 * Math.sin(0.22), 14.5, 27 * Math.cos(0.22))
      this.cameraRelativeLook.set(0, 8.2, 0)
    } else if (this.stage === 'launch') {
      const axisX = Math.sin(this.ascent.pitchRad)
      const axisY = Math.cos(this.ascent.pitchRad)
      const direction = this.transitTangent.set(axisX, axisY, 0).normalize()
      const normal = V3(-direction.y, direction.x, 0)

      let targetRelOffset: THREE.Vector3
      let targetRelLook: THREE.Vector3

      if (this.launchCameraPreset === 'cabin') {
        targetRelOffset = direction.clone().multiplyScalar(16.5).addScaledVector(normal, 1.4).add(V3(0, 0, 1.2))
        targetRelLook = direction.clone().multiplyScalar(75.0).addScaledVector(normal, 3.0)
      } else if (this.launchCameraPreset === 'engine') {
        targetRelOffset = direction.clone().multiplyScalar(-13.0).addScaledVector(normal, -3.2).add(V3(0, 0, 12.0))
        targetRelLook = direction.clone().multiplyScalar(4.0)
      } else {
        // Chase view: seamless liftoff anchor smoothly evolving into supersonic & orbital chase
        const altM = this.ascent.altitudeM
        const padT = THREE.MathUtils.clamp(altM / 300, 0, 1)
        const blend = padT * padT * (3 - 2 * padT)

        const padRelOffset = V3(26 * Math.sin(0.22), 14.5, 27 * Math.cos(0.22))
        const padRelLook = V3(0, 8.2, 0)

        const altKm = altM / 1_000
        const altT = THREE.MathUtils.clamp((altKm - 4) / 45, 0, 1)
        const spaceT = THREE.MathUtils.clamp((altKm - 35) / 145, 0, 1)
        const spaceEase = Math.pow(spaceT, 0.75)
        const chaseDist = THREE.MathUtils.lerp(18.0, 24.0, altT) + spaceEase * 14.0
        const chaseUp = THREE.MathUtils.lerp(5.0, 6.5, altT) + spaceEase * 5.0
        const chaseSide = THREE.MathUtils.lerp(20.0, 24.0, altT) + spaceEase * 9.0

        const flightRelOffset = direction.clone().multiplyScalar(-chaseDist)
          .addScaledVector(normal, chaseUp)
          .add(V3(0, 0, chaseSide))
        const flightRelLook = direction.clone().multiplyScalar(4.5 + spaceEase * 6.0).addScaledVector(normal, 0.4 - spaceEase * 1.0)

        targetRelOffset = padRelOffset.lerp(flightRelOffset, blend)
        targetRelLook = padRelLook.lerp(flightRelLook, blend)
      }

      // Smoothly update the relative angle offset
      const lerpSpeed = this.stageTimer < 1.0 ? 30.0 : 8.0
      this.cameraRelativeOffset.lerp(targetRelOffset, 1 - Math.exp(-dt * lerpSpeed))
      this.cameraRelativeLook.lerp(targetRelLook, 1 - Math.exp(-dt * lerpSpeed))

      // Direct rock-solid positional coupling: camera moves EXACTLY in lockstep with rocket
      this.syncRocket()
      this.camera.position.copy(this.rocket.position).add(this.cameraRelativeOffset)
      // Hypersonic aerodynamic buffeting shake during stratospheric ozone penetration (20.5..31 km)
      const altKmShake = this.ascent.altitudeM / 1_000
      if (altKmShake >= 20.5 && altKmShake <= 31.0) {
        const shakeEnv = Math.sin(((altKmShake - 20.5) / 10.5) * Math.PI)
        const shakeAmp = 0.28 * shakeEnv
        this.camera.position.x += Math.sin(this.elapsed * 67.0) * shakeAmp * 0.6 + (Math.random() - 0.5) * shakeAmp
        this.camera.position.y += Math.cos(this.elapsed * 53.0) * shakeAmp * 0.6 + (Math.random() - 0.5) * shakeAmp
      }
      const lookTarget = this.rocket.position.clone().add(this.cameraRelativeLook)
      this.camera.lookAt(lookTarget)
      this.sun.target.position.copy(lookTarget)
    } else if (this.stage === 'transit') {
      if (this.transitCameraPreset === 'overview') {
        const ovDesired = TRANSIT_OVERVIEW_POSITION
        const ovLook = TRANSIT_OVERVIEW_LOOK
        this.camera.position.lerp(ovDesired, 1 - Math.exp(-dt * 6.0))
        this.camera.lookAt(ovLook)
        this.sun.target.position.copy(ovLook)
      } else {
        const craftPos = this.flightCraft.position
        const progress = THREE.MathUtils.clamp(this.transferProgress, 0, 1)
        const tangent = this.transitTangent.lengthSq() > 0.01 ? this.transitTangent : V3(1, 0, 0)

        // Chase camera positioned behind craft looking directly forward along flight line to Moon
        const chaseDist = 16.0
        const chaseHeight = 4.2
        const chaseSide = 6.5
        const targetOffset = tangent.clone().multiplyScalar(-chaseDist).add(V3(0, chaseHeight, chaseSide))
        const lookAhead = 35.0
        let targetLook = tangent.clone().multiplyScalar(lookAhead)
        if (this.moonBody) {
          const toMoon = this.moonBody.group.position.clone().sub(craftPos).normalize().multiplyScalar(lookAhead)
          const moonLookBlend = progress < 0.1 ? 0 : Math.min(1, (progress - 0.1) / 0.65)
          targetLook.lerp(toMoon, moonLookBlend)
        }

        this.cameraRelativeOffset.lerp(targetOffset, 1 - Math.exp(-dt * 8.0))
        this.cameraRelativeLook.lerp(targetLook, 1 - Math.exp(-dt * 8.0))

        this.camera.position.copy(craftPos).add(this.cameraRelativeOffset)
        const lookTarget = craftPos.clone().add(this.cameraRelativeLook)
        this.camera.lookAt(lookTarget)
        this.sun.target.position.copy(lookTarget)
      }
    } else if (this.stage === 'landing' || this.stage === 'landingFailed') {
      const landerPos = V3(this.landingX, this.altitude, this.landingZ)
      this.lander.position.copy(landerPos)
      this.lander.rotation.y = Math.PI / 4
      if (this.demoMode) {
        this.lander.rotation.x = this.landingRollRad
        this.lander.rotation.z = this.landingPitchRad
      }
      // Flutter parachutes during descent
      const parachutes = this.lander.userData.parachutes as THREE.Group | undefined
      if (parachutes && parachutes.visible) {
        parachutes.children.forEach((singleChute, idx) => {
          singleChute.rotation.z = Math.sin(this.elapsed * 2.8 + idx * 1.5) * 0.05
          singleChute.rotation.x = Math.PI + Math.cos(this.elapsed * 2.4 + idx) * 0.04
        })
      }
      // Russian robotic altitude callouts
      if (this.altitude <= 32 && this.altitude > 25 && !this.announced30m) {
        this.announced30m = true
        speakRobotic('Идёт посадка на Луну. Высота тридцать метров. Снижение штатное.')
      } else if (this.altitude <= 12 && this.altitude > 5 && !this.announced10m) {
        this.announced10m = true
        speakRobotic('Идёт посадка на Луну. Высота десять метров. Приготовиться к касанию.')
      }

      const targetOffset = V3(18, 10, 20)
      const targetLook = V3(0, -this.altitude * 0.45 + 1.5, 0)
      this.cameraRelativeOffset.lerp(targetOffset, 1 - Math.exp(-dt * 8.0))
      this.cameraRelativeLook.lerp(targetLook, 1 - Math.exp(-dt * 8.0))

      this.camera.position.copy(landerPos).add(this.cameraRelativeOffset)
      const lookTarget = landerPos.clone().add(this.cameraRelativeLook)
      this.camera.lookAt(lookTarget)
      this.sun.target.position.copy(lookTarget)
    } else {
      this.lander.position.set(this.landingX, lunarTerrainHeight(this.landingX, this.landingZ), this.landingZ)
      this.lander.rotation.set(0, Math.PI / 4, 0)
      const roverPos = V3(this.roverX, this.rover.position.y, this.roverZ)
      const targetOffset = V3(13, 9.5, 16)
      const targetLook = V3(0, 1.2, 0)

      this.cameraRelativeOffset.lerp(targetOffset, 1 - Math.exp(-dt * 6.0))
      this.cameraRelativeLook.lerp(targetLook, 1 - Math.exp(-dt * 6.0))

      this.camera.position.copy(roverPos).add(this.cameraRelativeOffset)
      const lookTarget = roverPos.clone().add(this.cameraRelativeLook)
      this.camera.lookAt(lookTarget)
      this.sun.target.position.copy(lookTarget)
    }
    if (this.stage === 'launch') {
      const altKm = this.ascent.altitudeM / 1_000
      this.launchEnv?.setAltitudeKm(altKm)
      const currentSpeed = Math.hypot(this.ascent.downrangeVelocityMps, this.ascent.verticalVelocityMps)
      this.troposphereClouds?.update(dt, altKm, this.rocket.position, this.elapsed)
      this.atmosphereStrata?.update(
        this.camera.position,
        altKm,
        currentSpeed,
        dt,
        this.elapsed,
        this.rocket.position,
        this.rocket.quaternion,
      )
      this.starsGroup.visible = altKm > 30
      this.sun.color.set(altKm > 55 ? '#ffffff' : '#fff3df')
      this.sun.position.set(this.rocket.position.x - 1_000_000, this.rocket.position.y + 600_000, this.rocket.position.z - 850_000)
      this.sun.intensity = altKm > 55 ? 3.6 : 2.4

      // Deep space Sun visuals, solar corona & sunlight rays ("quyosh nuri")
      const sunDir = new THREE.Vector3(-1.0, 0.6, -0.85).normalize()
      this.spaceSun?.update(this.camera, altKm, sunDir, this.elapsed)

      // Ambient Earthshine bouncing off Earth onto the spacecraft's dark side in space
      if (altKm > 18) {
        this.earthshineLight.intensity = Math.min(1.15, (altKm - 18) / 35) * 0.95
        this.earthshineLight.position.set(this.rocket.position.x, this.rocket.position.y - 120, this.rocket.position.z)
        this.earthshineLight.target.position.copy(this.rocket.position)
      } else {
        this.earthshineLight.intensity = 0
      }
    }
    if (this.demoMode && (this.stage === 'landing' || this.stage === 'landingFailed')) {
      this.landingDustBurstSeconds = Math.max(0, this.landingDustBurstSeconds - dt)
      const dustIntensity = this.demoLandingThrottle + this.landingDustBurstSeconds
      this.landingDust.visible = dustIntensity > 0.06
      this.landingDust.position.set(this.landingX, lunarTerrainHeight(this.landingX, this.landingZ) + 0.04, this.landingZ)
      this.landingDust.scale.setScalar(1 + dustIntensity * 2.4)
      this.landingDust.material.opacity = Math.min(0.55, 0.12 + dustIntensity * 0.25)
    } else {
      this.landingDust.visible = false
    }
    const waterVisible = this.stage === 'launch' && this.stageTimer < 4.5
    for (let index = 0; index < this.launchWaterRings.length; index += 1) {
      const ring = this.launchWaterRings[index]!
      ring.visible = waterVisible
      if (!waterVisible) continue
      const progress = THREE.MathUtils.clamp(this.stageTimer / 4.5, 0, 1)
      const pulse = (this.stageTimer * 0.7 + index / this.launchWaterRings.length) % 1
      ring.scale.setScalar(0.75 + pulse * 1.05 + progress * 0.6)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = (1 - progress) * (0.3 + Math.sin(pulse * Math.PI) * 0.25)
    }
    if (this.stage === 'transit') {
      // Dynamic sun position: Oy tomonga yo'naltirilgan, Oyni yaxshi yoritsin
      const moonPos = this.moonBody?.group.position
      if (moonPos) {
        // Sun Oyning orqasida, yuqorida — Oyga "to'lin oy" effekti
        const toMoon = moonPos.clone().sub(EARTH_CENTER).normalize()
        this.sun.position.set(
          EARTH_CENTER.x - toMoon.x * 300,
          80,
          EARTH_CENTER.z - toMoon.z * 300,
        )
      } else {
        this.sun.position.set(-180, 90, 220)
      }
      this.sun.color.set('#fff8f0')
      this.sun.intensity = 4.5
      this.starsGroup.visible = true
    }
    for (let index = 0; index < 2; index += 1) {
      const debris = this.ascent.stageDebris[index]!
      const group = this.rocketStageGroups[index]!
      if (group.parent !== this.hangar) continue
      if (this.detachedBoosters.some(db => db.group === group)) continue
      group.visible = debris.active
      group.position.set(
        debris.downrangeM,
        debris.positionYM - EARTH_RADIUS_M,
        0,
      )
      group.rotation.z = debris.rotationRad
    }
    if (this.stage === 'surface' || this.stage === 'complete') this.updateRoverVisuals(dt)
    if (this.hangar.visible) {
      this.launchEnv?.update(dt, this.elapsed, this.camera)
      this.launchTower?.update(dt, this.stage, this.stageTimer)
    }
    this.updateExhaust(dt)
    if (this.stage === 'launch') {
      const activeThrottle = this.ascent.insertionComplete ? 0 : Math.max(0.85, this.launchThrottle)
      const nozzleBaseY = this.heroModelPartitioned
        ? -0.34
        : this.ascent.stageIndex >= 2
          ? 13.45
          : this.ascent.stageIndex === 1
            ? 8.25
            : 0
      this.rocketExhaust?.setActive(!this.ascent.insertionComplete)
      this.rocketExhaust?.update(
        dt,
        this.rocket.position,
        this.rocket.quaternion,
        activeThrottle,
        this.ascent.altitudeM,
        this.launchSpeedMps,
        this.elapsed,
        this.ascent.stageIndex,
        nozzleBaseY,
      )
    }
    this.renderer.render(this.scene, this.camera)
  }

  private sampleLandingSlope(): number {
    const x = this.landingX
    const z = this.landingZ
    const elevations = [
      lunarTerrainHeight(x - 1, z - 1), lunarTerrainHeight(x, z - 1), lunarTerrainHeight(x + 1, z - 1),
      lunarTerrainHeight(x - 1, z), lunarTerrainHeight(x, z), lunarTerrainHeight(x + 1, z),
      lunarTerrainHeight(x - 1, z + 1), lunarTerrainHeight(x, z + 1), lunarTerrainHeight(x + 1, z + 1),
    ]
    const terrainSlope = hornSlopeDegrees(elevations, 1)
    return this.demoMode && this.demoLandingSite
      ? Math.max(terrainSlope, this.demoLandingSite.slopeDegrees)
      : terrainSlope
  }

  private landSuccessful(outcome: 'perfect' | 'hard'): void {
    this.landingOutcome = outcome
    this.statusMessage = outcome === 'perfect'
      ? 'Mukammal qo‘nish! Shlyuz eshigi ochilmoqda, lunoxod sirtga chiqmoqda...'
      : 'Qattiq qo‘nish, ammo modul barqaror! Shlyuz ochilmoqda...'
    const parachutes = this.lander.userData.parachutes as THREE.Group | undefined
    if (parachutes) parachutes.visible = false
    speakRobotic('Посадка на Луну выполнена! Внимание, открытие внешнего шлюза. Луноход готов к выезду.')
    this.isRollingOut = true
    this.rolloutProgress = 0
    this.roverHeading = Math.PI / 4
    this.roverX = this.landingX + Math.sin(this.roverHeading) * 0.35
    this.roverZ = this.landingZ + Math.cos(this.roverHeading) * 0.35
    this.rover.position.set(this.roverX, lunarTerrainHeight(this.roverX, this.roverZ) + 0.5, this.roverZ)
    this.setStage('surface')
  }

  private sampleAscentTelemetry(): void {
    const telemetry = this.ascentTelemetry
    const index = telemetry.next
    telemetry.altitudeKm[index] = this.ascent.altitudeM / 1_000
    telemetry.velocityKmps[index] = Math.hypot(this.ascent.downrangeVelocityMps, this.ascent.verticalVelocityMps) / 1_000
    telemetry.accelerationG[index] = this.ascent.accelerationMps2 / 9.80665
    telemetry.next = (index + 1) % telemetry.capacity
    telemetry.count = Math.min(telemetry.capacity, telemetry.count + 1)
  }

  private setStage(stage: MissionStage): void {
    if (stage === 'title') {
      this.launchTower?.reset()
      this.rocket.position.set(0, 0, 0)
      this.rocketExhaust?.setCryoVenting?.(false)
      this.rocketExhaust?.setActive(false)
      this.fairingJettisoned = false
      for (const db of this.detachedBoosters) db.group.parent?.remove(db.group)
      this.detachedBoosters = []
    }
    if (stage !== 'launch' && this.spaceSun) {
      this.spaceSun.group.visible = false
    }
    if (stage === 'transit' && this.stage !== 'transit') {
      for (const db of this.detachedBoosters) db.group.parent?.remove(db.group)
      this.detachedBoosters = []
      this.autopilotEnabled = true
      this.initializeTransit()
    }
    this.sceneMachine.transition(stage)
    this.stage = stage
    const isLaunchHangar = ['title', 'countdown', 'launch'].includes(stage)
    this.hangar.visible = isLaunchHangar
    this.space.visible = stage === 'transit'
    this.setLaunchCelestialFrame(isLaunchHangar)
    if (this.earthBody) this.earthBody.group.visible = !isLaunchHangar
    this.moon.visible = ['landing', 'landingFailed', 'surface', 'complete'].includes(stage)
    this.lander.visible = ['landing', 'landingFailed', 'surface', 'complete'].includes(stage)
    this.landingZoneMarker.visible = stage === 'landing' || stage === 'landingFailed'
    this.rover.visible = stage === 'surface' || stage === 'complete'
    this.starsGroup.visible = !isLaunchHangar

    if (stage === 'landing' || stage === 'landingFailed') {
      this.cameraRelativeOffset.set(18, 10, 20)
      this.cameraRelativeLook.set(0, 0, 0)
    } else if (stage === 'surface' || stage === 'complete') {
      this.cameraRelativeOffset.set(13, 9.5, 16)
      this.cameraRelativeLook.set(0, 1.2, 0)
    }

    // Dynamic atmospheric fog and sun lighting per environment
    if (isLaunchHangar) {
      this.scene.fog = new THREE.FogExp2('#b8623b', 0.0016)
      this.sun.color.set('#ffb470')
      this.sun.position.set(-42, 24, -38)
      this.sun.intensity = 3.8
    } else if (stage === 'transit') {
      this.scene.fog = new THREE.FogExp2('#040812', 0.0001)
      this.sun.color.set('#ffffff')
      // Sun position: Oyga qarab borish yo'nalishida chap-yuqorida
      this.sun.position.set(-180, 90, 220)
      this.sun.intensity = 4.2  // Oy va Yerga ko'proq nur tushsin
    } else {
      this.scene.fog = null
      this.sun.color.set('#ffffff')
      this.sun.position.set(-20, 34, 20)
      this.sun.intensity = 2.2
    }

    this.stageTimer = 0
    this.syncRocket()
    // Exhaust particles
    this.exhaustGroup.visible = false
    this.exhaustActive = false
    this.exhaustLight.intensity = 0
    if (this.rocketExhaust) {
      this.rocketExhaust.group.visible = isLaunchHangar
    }
    if (stage === 'title') {
      this.cameraRelativeOffset.set(0, 14.5, 27)
      this.cameraRelativeLook.set(0, 8.2, 0)
      this.camera.position.set(0, 14.5, 27)
      this.camera.lookAt(0, 8.2, 0)
    } else if (stage === 'countdown') {
      const cx = 26 * Math.sin(0.22)
      const cz = 27 * Math.cos(0.22)
      this.cameraRelativeOffset.set(cx, 14.5, cz)
      this.cameraRelativeLook.set(0, 8.2, 0)
      this.camera.position.set(cx, 14.5, cz)
      this.camera.lookAt(0, 8.2, 0)
    }
    if (stage === 'launch') {
      this.groundSteamBurst = false
      this.rocketExhaust?.setActive(true)
      this.cameraRelativeOffset.set(26 * Math.sin(0.22), 14.5, 27 * Math.cos(0.22))
      this.cameraRelativeLook.set(0, 8.2, 0)
    } else {
      this.rocketExhaust?.setActive(false)
    }
    if (stage === 'transit') {
      this.cameraRelativeOffset.set(-22, 7, 10)
      this.cameraRelativeLook.set(12, 1, 0)
      this.space.scale.setScalar(TRANSIT_SCENE_SCALE)
      this.flightCraft.scale.setScalar(1.0)
      this.flightCraft.position.copy(this.flightStart)
      this.flightCraft.visible = true
      this.flightPathLine.visible = true
      if (this.fullTrajectoryRoute) this.fullTrajectoryRoute.visible = true
      if (this.moonWaypointMarker) this.moonWaypointMarker.visible = true
      this.transitPlume.visible = false
      this.transitLight.visible = false

      // Place camera immediately behind the craft in flight so no black void occurs!
      const startPos = this.flightCraft.position
      this.camera.position.set(startPos.x - 22, startPos.y + 7, startPos.z + 10)
      this.camera.lookAt(startPos.x + 12, startPos.y + 1, startPos.z)
    } else {
      this.space.scale.setScalar(1)
      this.flightCraft.scale.setScalar(1)
      this.flightCraft.visible = false
      this.flightPathLine.visible = false
      if (this.fullTrajectoryRoute) this.fullTrajectoryRoute.visible = false
      if (this.moonWaypointMarker) this.moonWaypointMarker.visible = false
      this.transitPlume.visible = false
    }
  }

  private setLaunchCelestialFrame(launchFrame: boolean): void {
    const earth = this.earthBody
    const moon = this.moonBody
    if (!earth || !moon) return
    if (launchFrame) {
      this.hangar.add(earth.group, moon.group)
      earth.group.position.set(0, -EARTH_RADIUS_M - LAUNCH_TERRAIN_CLEARANCE_M, 0)
      earth.group.scale.setScalar(1_000_000)
      earth.group.rotation.z = Math.PI / 2 - LAUNCH_SITE_LATITUDE_RAD
      earth.atmosphereMesh.visible = false
      earth.outerHaloMesh.visible = false
      moon.group.position.set(EARTH_MOON_DISTANCE_M, -EARTH_RADIUS_M, 0)
      moon.group.scale.setScalar(1_000_000)
      moon.orbitLine.visible = false
    } else {
      this.space.add(earth.group, moon.group, moon.orbitLine)
      earth.group.position.copy(EARTH_CENTER)
      earth.group.scale.setScalar(1)
      earth.group.rotation.set(0, 0, 0)
      earth.atmosphereMesh.visible = true
      earth.outerHaloMesh.visible = true
      moon.group.scale.setScalar(1)
      moon.orbitLine.visible = true
    }
  }

  private initExhaust(): void {
    const FN = this.FIRE_N, SN = this.SMOKE_N, GN = this.STEAM_N

    // Procedural soft, irregular puff sprite avoids a dotted exhaust silhouette.
    const particleCanvas = document.createElement('canvas')
    particleCanvas.width = 128
    particleCanvas.height = 128
    const pctx = particleCanvas.getContext('2d')
    if (pctx) {
      const image = pctx.createImageData(128, 128)
      for (let y = 0; y < 128; y++) {
        for (let x = 0; x < 128; x++) {
          const dx = (x - 63.5) / 63.5
          const dy = (y - 63.5) / 63.5
          const radius = Math.sqrt(dx * dx + dy * dy)
          const turbulence = 0.88
            + 0.07 * Math.sin(x * 0.19 + y * 0.11)
            + 0.05 * Math.sin(x * 0.07 - y * 0.17)
          const edge = THREE.MathUtils.clamp((1 - radius * turbulence) * 5, 0, 1)
          const alpha = Math.pow(edge, 1.7) * Math.exp(-radius * radius * 1.5)
          const offset = (y * 128 + x) * 4
          image.data[offset] = 255
          image.data[offset + 1] = 255
          image.data[offset + 2] = 255
          image.data[offset + 3] = Math.round(alpha * 255)
        }
      }
      pctx.putImageData(image, 0, 0)
    }
    const particleTex = new THREE.CanvasTexture(particleCanvas)
    particleTex.colorSpace = THREE.SRGBColorSpace

    // ── Fire (additive bright flame) ─────────────────────────────────────
    this.firePosArr = new Float32Array(FN * 3).fill(-9999)
    this.fireVelArr = new Float32Array(FN * 3)
    this.fireLifeArr = new Float32Array(FN)
    this.fireColArr = new Float32Array(FN * 3)

    const fireGeo = new THREE.BufferGeometry()
    const fPosBuf = new THREE.BufferAttribute(this.firePosArr, 3)
    fPosBuf.setUsage(THREE.DynamicDrawUsage)
    const fColBuf = new THREE.BufferAttribute(this.fireColArr, 3)
    fColBuf.setUsage(THREE.DynamicDrawUsage)
    fireGeo.setAttribute('position', fPosBuf)
    fireGeo.setAttribute('color', fColBuf)
    this.firePts = new THREE.Points(fireGeo, new THREE.PointsMaterial({
      map: particleTex,
      vertexColors: true,
      size: 2.8,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }))

    // ── Smoke (soft grey billowing cloud) ──────────────────────────────
    this.smokePosArr = new Float32Array(SN * 3).fill(-9999)
    this.smokeVelArr = new Float32Array(SN * 3)
    this.smokeLifeArr = new Float32Array(SN)
    this.smokeMaxLifeArr = new Float32Array(SN)
    this.smokeSizeArr = new Float32Array(SN)
    this.smokeBaseSizeArr = new Float32Array(SN)
    this.smokeOpacityArr = new Float32Array(SN)

    const smokeGeo = new THREE.BufferGeometry()
    const sPosBuf = new THREE.BufferAttribute(this.smokePosArr, 3)
    sPosBuf.setUsage(THREE.DynamicDrawUsage)
    smokeGeo.setAttribute('position', sPosBuf)
    const sSizeBuf = new THREE.BufferAttribute(this.smokeSizeArr, 1)
    sSizeBuf.setUsage(THREE.DynamicDrawUsage)
    const sOpacityBuf = new THREE.BufferAttribute(this.smokeOpacityArr, 1)
    sOpacityBuf.setUsage(THREE.DynamicDrawUsage)
    smokeGeo.setAttribute('particleSize', sSizeBuf)
    smokeGeo.setAttribute('particleOpacity', sOpacityBuf)
    const smokeMaterial = new THREE.PointsMaterial({
      map: particleTex,
      color: '#c4c0bb',
      size: 8,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    })
    smokeMaterial.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float particleSize;\nattribute float particleOpacity;\nvarying float vParticleOpacity;',
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvParticleOpacity = particleOpacity;')
        .replace('#include <project_vertex>', '#include <project_vertex>\ngl_PointSize *= particleSize;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vParticleOpacity;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vParticleOpacity;')
    }
    smokeMaterial.customProgramCacheKey = () => 'mission-smoke-puffs-v1'
    this.smokePts = new THREE.Points(smokeGeo, smokeMaterial)

    // ── Ground steam burst ──────────────────────────────────────────────
    this.steamPosArr = new Float32Array(GN * 3).fill(-9999)
    this.steamVelArr = new Float32Array(GN * 3)
    this.steamLifeArr = new Float32Array(GN)

    const steamGeo = new THREE.BufferGeometry()
    const gPosBuf = new THREE.BufferAttribute(this.steamPosArr, 3)
    gPosBuf.setUsage(THREE.DynamicDrawUsage)
    steamGeo.setAttribute('position', gPosBuf)
    this.steamPts = new THREE.Points(steamGeo, new THREE.PointsMaterial({
      map: particleTex,
      color: '#c7f5ff',
      size: 9,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }))

    this.exhaustGroup.add(this.firePts, this.smokePts, this.steamPts)
    this.hangar.add(this.exhaustGroup)
    this.exhaustGroup.visible = false
  }

  private updateExhaust(dt: number): void {
    if (!this.exhaustActive) return

    const rx = this.rocket.position.x
    const ry = this.rocket.position.y
    const rz = this.rocket.position.z
    const thinAtmosphere = this.ascent.altitudeM > 25_000
    const throttle = this.ascent.throttle

    const FN = this.FIRE_N, SN = this.SMOKE_N, GN = this.STEAM_N
    const fireToSpawn = Math.round(dt * 260 * throttle)
    const smokeFade = THREE.MathUtils.clamp(1 - this.ascent.altitudeM / 250, 0, 1)
    const smokeToSpawn = thinAtmosphere ? 0 : Math.round(dt * 220 * throttle * smokeFade)

    const cosY = Math.cos(this.rocket.rotation.y)
    const sinY = Math.sin(this.rocket.rotation.y)
    const cosPitch = Math.cos(this.rocket.rotation.z)
    const sinPitch = Math.sin(this.rocket.rotation.z)

    // ── Fire update & spawn from the imported vehicle's engine layout ──
    let fireSpawned = 0
    for (let i = 0; i < FN; i++) {
      if (this.fireLifeArr[i] > 0) {
        this.fireLifeArr[i] -= dt * 3.0
        this.firePosArr[i*3]   += this.fireVelArr[i*3]   * dt
        this.firePosArr[i*3+1] += this.fireVelArr[i*3+1] * dt
        this.firePosArr[i*3+2] += this.fireVelArr[i*3+2] * dt
        this.fireVelArr[i*3+1] *= (1 - dt * 1.5)
        const age = 1 - this.fireLifeArr[i]
        this.fireColArr[i*3]   = 1.0
        this.fireColArr[i*3+1] = Math.max(0, 1.0 - age * 2.6)
        this.fireColArr[i*3+2] = Math.max(0, 0.75 - age * 3.2)
        if (this.fireLifeArr[i] <= 0) this.firePosArr[i*3+1] = -9999
      } else if (fireSpawned < fireToSpawn) {
        // Pick one of the 5 rocket engine nozzles
        const n = NOZZLE_OFFSETS[Math.floor(Math.random() * NOZZLE_OFFSETS.length)]!
        const nozzleX = n[0] * cosPitch - n[1] * sinPitch
        const nozzleY = n[0] * sinPitch + n[1] * cosPitch
        const nx = nozzleX * cosY - n[2] * sinY
        const nz = nozzleX * sinY + n[2] * cosY
        const jx = (Math.random() - 0.5) * 0.18
        const jz = (Math.random() - 0.5) * 0.18

        this.firePosArr[i*3]   = rx + nx + jx
        this.firePosArr[i*3+1] = ry + nozzleY
        this.firePosArr[i*3+2] = rz + nz + jz

        const speed = 26 + Math.random() * 16
        this.fireVelArr[i*3]   = Math.sin(this.rocket.rotation.z) * speed + (Math.random() - 0.5) * 2.2
        this.fireVelArr[i*3+1] = Math.cos(this.rocket.rotation.z) * -speed
        this.fireVelArr[i*3+2] = (Math.random() - 0.5) * 2.2

        this.fireColArr[i*3]   = 1.0
        this.fireColArr[i*3+1] = 0.98
        this.fireColArr[i*3+2] = 0.8
        this.fireLifeArr[i] = 0.48 + Math.random() * 0.36
        fireSpawned++
      }
    }

    // ── Smoke update & spawn from engine blast trench ─────────────────
    let smokeSpawned = 0
    for (let i = 0; i < SN; i++) {
      if (this.smokeLifeArr[i] > 0) {
        this.smokeLifeArr[i] -= dt * (thinAtmosphere ? 3 : 0.8)
        this.smokePosArr[i*3]   += this.smokeVelArr[i*3]   * dt
        this.smokePosArr[i*3+1] += this.smokeVelArr[i*3+1] * dt
        this.smokePosArr[i*3+2] += this.smokeVelArr[i*3+2] * dt
        this.smokeVelArr[i*3]   *= (1 - dt * 0.32)
        this.smokeVelArr[i*3+1] += dt * 0.38
        this.smokeVelArr[i*3+2] *= (1 - dt * 0.32)
        if (this.smokeLifeArr[i] <= 0) {
          this.smokePosArr[i*3+1] = -9999
          this.smokeOpacityArr[i] = 0
        } else {
          const age = 1 - this.smokeLifeArr[i] / this.smokeMaxLifeArr[i]
          const fadeIn = THREE.MathUtils.clamp(age / 0.12, 0, 1)
          const fadeOut = THREE.MathUtils.clamp((1 - age) / 0.38, 0, 1)
          this.smokeOpacityArr[i] = fadeIn * fadeOut * 0.76
          this.smokeSizeArr[i] = (0.72 + age * 0.9) * this.smokeBaseSizeArr[i]
        }
      } else if (smokeSpawned < smokeToSpawn) {
        const angle = Math.random() * Math.PI * 2
        const spread = 0.25 + Math.random() * 0.75
        const trenchDir = Math.random() > 0.45 ? 1 : -1
        this.smokePosArr[i*3]   = rx + Math.cos(angle) * spread
        this.smokePosArr[i*3+1] = Math.max(0.12, ry - 0.25)
        this.smokePosArr[i*3+2] = rz + (trenchDir * (0.8 + Math.random() * 2.4))
        this.smokeVelArr[i*3]   = Math.cos(angle) * (1.1 + Math.random() * 2.8)
        this.smokeVelArr[i*3+1] = 0.35 + Math.random() * 1.2
        this.smokeVelArr[i*3+2] = trenchDir * (1.4 + Math.random() * 3.2)
        this.smokeLifeArr[i] = 3.2 + Math.random() * 1.5
        this.smokeMaxLifeArr[i] = this.smokeLifeArr[i]
        this.smokeBaseSizeArr[i] = 0.75 + Math.random() * 0.55
        this.smokeSizeArr[i] = this.smokeBaseSizeArr[i]
        this.smokeOpacityArr[i] = 0
        smokeSpawned++
      }
    }

    // ── Ground steam burst on ignition ──────────────────────────────
    if (!this.groundSteamBurst && ry < 3 && throttle > 0.1) {
      this.groundSteamBurst = true
      for (let i = 0; i < GN; i++) {
        const angle = Math.random() * Math.PI * 2
        const dist = 1 + Math.random() * 7.5
        this.steamPosArr[i*3]   = rx + Math.cos(angle) * dist
        this.steamPosArr[i*3+1] = 0.2 + Math.random() * 2
        this.steamPosArr[i*3+2] = rz + Math.sin(angle) * dist
        this.steamVelArr[i*3]   = Math.cos(angle) * (3 + Math.random() * 9)
        this.steamVelArr[i*3+1] = 2.5 + Math.random() * 6
        this.steamVelArr[i*3+2] = Math.sin(angle) * (3 + Math.random() * 9)
        this.steamLifeArr[i] = 1.8 + Math.random() * 1.2
      }
    }
    for (let i = 0; i < GN; i++) {
      if (this.steamLifeArr[i] > 0) {
        this.steamLifeArr[i] -= dt * 0.55
        this.steamPosArr[i*3]   += this.steamVelArr[i*3]   * dt
        this.steamPosArr[i*3+1] += this.steamVelArr[i*3+1] * dt
        this.steamPosArr[i*3+2] += this.steamVelArr[i*3+2] * dt
        this.steamVelArr[i*3]   *= (1 - dt * 0.5)
        this.steamVelArr[i*3+1] += dt * 0.3
        this.steamVelArr[i*3+2] *= (1 - dt * 0.5)
        if (this.steamLifeArr[i] <= 0) this.steamPosArr[i*3+1] = -9999
      }
    }

    // Pulsing fire glow light
    this.exhaustLight.intensity = 10 * (0.75 + Math.random() * 0.5)

    this.firePts.geometry.attributes.position.needsUpdate = true
    this.firePts.geometry.attributes.color.needsUpdate = true
    this.smokePts.geometry.attributes.position.needsUpdate = true
    this.smokePts.geometry.attributes.particleSize.needsUpdate = true
    this.smokePts.geometry.attributes.particleOpacity.needsUpdate = true
    this.steamPts.geometry.attributes.position.needsUpdate = true
  }

  private updateRoverVisuals(dt: number): void {
    // ── Lander Ramp Opening & Cinematic Rover Rollout (Task 8 & 9) ──
    if (this.isRollingOut) {
      this.rolloutProgress = Math.min(1.0, this.rolloutProgress + dt / 3.8)
      const ramp = this.lander.userData.ramp as THREE.Group | undefined
      if (ramp) {
        // Ramp lowers open smoothly from -0.47*PI to +0.38 rad
        const openT = THREE.MathUtils.clamp(this.rolloutProgress / 0.32, 0, 1)
        ramp.rotation.x = THREE.MathUtils.lerp(-Math.PI * 0.47, 0.38, openT)
      }
      if (this.rolloutProgress > 0.32) {
        // Rover rolls out forward down the ramp onto the lunar regolith
        const rollT = (this.rolloutProgress - 0.32) / 0.68
        const rollDist = 0.35 + rollT * 4.0
        this.roverX = this.landingX + Math.sin(this.roverHeading) * rollDist
        this.roverZ = this.landingZ + Math.cos(this.roverHeading) * rollDist
        this.roverSpeed = 1.3
      }
      if (this.rolloutProgress >= 1.0) {
        this.isRollingOut = false
        this.roverSpeed = 0
        this.statusMessage = 'Lunoxod sirtga muvaffaqiyatli tushdi. Boshqaruv faollashtirildi.'
        speakRobotic('Луноход успешно развёрнут на поверхности Луны. Бортовые системы активны.')
      }
    }

    const heading = this.roverHeading
    const cos = Math.cos(heading)
    const sin = Math.sin(heading)
    let averageHeight = 0
    let frontHeight = 0
    let rearHeight = 0
    let leftHeight = 0
    let rightHeight = 0
    let frontCount = 0
    let rearCount = 0
    let leftCount = 0
    let rightCount = 0
    for (let index = 0; index < this.wheelLocalPositions.length; index += 1) {
      const point = this.wheelLocalPositions[index]!
      const worldX = this.roverX + point.x * cos + point.z * sin
      const worldZ = this.roverZ - point.x * sin + point.z * cos
      let height = lunarTerrainHeight(worldX, worldZ)

      // Active Rock Obstacle Detection for Rover Wheels (Task 9)
      for (const rock of this.terrainRockObstacles) {
        const dist = Math.hypot(worldX - rock.x, worldZ - rock.z)
        if (dist < rock.radius) {
          const bump = rock.height * Math.cos((dist / rock.radius) * (Math.PI / 2))
          height += bump
        }
      }

      this.roverWheelHeights[index] = height
      averageHeight += height
      if (point.z > 0) { frontHeight += height; frontCount += 1 }
      else { rearHeight += height; rearCount += 1 }
      if (point.x < 0) { leftHeight += height; leftCount += 1 }
      else { rightHeight += height; rightCount += 1 }
    }
    const wheelCount = this.wheelLocalPositions.length
    if (wheelCount !== this.wheelPivots.length || wheelCount < 4) return
    averageHeight /= wheelCount
    const frontMean = frontHeight / Math.max(1, frontCount)
    const rearMean = rearHeight / Math.max(1, rearCount)
    const leftMean = leftHeight / Math.max(1, leftCount)
    const rightMean = rightHeight / Math.max(1, rightCount)
    const targetPitch = -Math.atan2(frontMean - rearMean, 1.54)
    const targetRoll = Math.atan2(rightMean - leftMean, 2.36)

    this.rover.position.x = this.roverX
    this.rover.position.z = this.roverZ
    this.rover.position.y = THREE.MathUtils.damp(this.rover.position.y, averageHeight, 9, dt)
    this.rover.rotation.y = heading
    this.rover.rotation.x = THREE.MathUtils.damp(this.rover.rotation.x, targetPitch, 8, dt)
    this.rover.rotation.z = THREE.MathUtils.damp(this.rover.rotation.z, targetRoll, 8, dt)

    for (let index = 0; index < this.wheelPivots.length; index += 1) {
      const pivot = this.wheelPivots[index]!
      const terrainOffset = THREE.MathUtils.clamp(this.roverWheelHeights[index]! - averageHeight, -0.45, 0.45)
      pivot.position.y = THREE.MathUtils.damp(pivot.position.y, 0.56 + terrainOffset, 14, dt)
      this.wheelRollGroups[index]!.rotation.x += (this.roverSpeed / 0.48) * dt
      const strut = this.suspensionStruts[index]
      if (strut) strut.scale.y = THREE.MathUtils.clamp(1.0 - terrainOffset * 1.6, 0.45, 1.55)
    }
    for (const wheel of this.roverImportedWheels) wheel.rotation.x += (this.roverSpeed / 0.48) * dt
  }

  private rebuildRocket(): void {
    this.rocketProcedural.clear()
    for (const group of this.rocketStageGroups) {
      group.parent?.remove(group)
      group.clear()
    }
    this.rocketProcedural.add(...this.rocketStageGroups)
    for (const component of ROCKET_COMPONENTS) {
      const stageIndex = component === 'engine' || component === 'tank' ? 0 : component === 'upper' ? 1 : 2
      makeRocketComponent(this.rocketStageGroups[stageIndex]!, component)
    }

    if (this.heroModelPartitioned) {
      this.rebuildImportedRocket()
    } else {
      this.buildStrapOnBoosters()
    }

    this.syncRocket()
  }

  private initImportedRocket(model: THREE.Group): void {
    let sourceMesh: THREE.Mesh | null = null
    model.traverse(node => {
      if (!sourceMesh && (node as THREE.Mesh).isMesh) {
        sourceMesh = node as THREE.Mesh
      }
    })
    if (!sourceMesh) return

    const rawGeo = (sourceMesh as THREE.Mesh).geometry
    rawGeo.computeBoundingBox()
    const geoBounds = rawGeo.boundingBox ?? new THREE.Box3().setFromBufferAttribute(rawGeo.attributes.position as THREE.BufferAttribute)
    const geoSize = geoBounds.getSize(new THREE.Vector3())
    const scale = 18.0 / Math.max(geoSize.y, 0.001)

    // First center vertically at Y = 0 and find true cylindrical central core axis (y in [9.0, 17.5])
    // because 3 asymmetric strap-on boosters pull the overall AABB center slightly off-axis.
    const geo = rawGeo.clone()
    geo.translate(0, -geoBounds.min.y, 0)
    geo.scale(scale, scale, scale)

    const prePosAttr = geo.attributes.position!
    let coreAxisSumX = 0
    let coreAxisSumZ = 0
    let coreAxisCount = 0
    for (let v = 0; v < prePosAttr.count; v++) {
      const vy = prePosAttr.getY(v)
      if (vy >= 9.0 && vy <= 17.5) {
        coreAxisSumX += prePosAttr.getX(v)
        coreAxisSumZ += prePosAttr.getZ(v)
        coreAxisCount++
      }
    }
    const coreOffsetX = coreAxisCount > 0 ? coreAxisSumX / coreAxisCount : 0
    const coreOffsetZ = coreAxisCount > 0 ? coreAxisSumZ / coreAxisCount : 0
    geo.translate(-coreOffsetX, 0, -coreOffsetZ)
    geo.computeVertexNormals()

    const posAttr = geo.attributes.position!
    const index = geo.index!
    const idxArray = index.array
    const count = index.count

    // Union-Find connected-component segmentation using spatially welded vertices
    const vertCount = posAttr.count
    const parent = new Int32Array(vertCount)
    for (let v = 0; v < vertCount; v++) parent[v] = v
    const findRoot = (a: number): number => {
      let cur = a
      while (parent[cur] !== cur) {
        parent[cur] = parent[parent[cur]!]!
        cur = parent[cur]!
      }
      return cur
    }
    const unionVerts = (a: number, b: number): void => {
      const ra = findRoot(a)
      const rb = findRoot(b)
      if (ra !== rb) parent[rb] = ra
    }

    const posKeyMap = new Map<string, number>()
    for (let v = 0; v < vertCount; v++) {
      const key = `${Math.round(posAttr.getX(v) * 200)},${Math.round(posAttr.getY(v) * 200)},${Math.round(posAttr.getZ(v) * 200)}`
      const existing = posKeyMap.get(key)
      if (existing !== undefined) {
        unionVerts(v, existing)
      } else {
        posKeyMap.set(key, v)
      }
    }
    for (let i = 0; i < count; i += 3) {
      unionVerts(idxArray[i]!, idxArray[i + 1]!)
      unionVerts(idxArray[i + 1]!, idxArray[i + 2]!)
    }

    interface MeshIsland {
      rootId: number
      indices: number[]
      minY: number
      maxY: number
      maxR: number
      sumX: number
      sumZ: number
      vertTotal: number
      nozzleSumX: number
      nozzleSumZ: number
      nozzleVerts: number
    }

    const islandsMap = new Map<number, MeshIsland>()
    for (let i = 0; i < count; i += 3) {
      const i0 = idxArray[i]!
      const i1 = idxArray[i + 1]!
      const i2 = idxArray[i + 2]!
      const rootId = findRoot(i0)
      let island = islandsMap.get(rootId)
      if (!island) {
        island = {
          rootId,
          indices: [],
          minY: Infinity,
          maxY: -Infinity,
          maxR: 0,
          sumX: 0,
          sumZ: 0,
          vertTotal: 0,
          nozzleSumX: 0,
          nozzleSumZ: 0,
          nozzleVerts: 0,
        }
        islandsMap.set(rootId, island)
      }
      island.indices.push(i0, i1, i2)
      for (const vi of [i0, i1, i2]) {
        const vx = posAttr.getX(vi)
        const vy = posAttr.getY(vi)
        const vz = posAttr.getZ(vi)
        if (vy < island.minY) island.minY = vy
        if (vy > island.maxY) island.maxY = vy
        const r = Math.hypot(vx, vz)
        if (r > island.maxR) island.maxR = r
        island.sumX += vx
        island.sumZ += vz
        island.vertTotal++
        if (vy < 1.1) {
          island.nozzleSumX += vx
          island.nozzleSumZ += vz
          island.nozzleVerts++
        }
      }
    }

    // Identify the tall exterior strap-on booster islands cleanly (the 3 real strap-on boosters)
    const primaryBoosters: MeshIsland[] = []
    const otherIslands: MeshIsland[] = []
    for (const island of islandsMap.values()) {
      if (island.maxY >= 5.0 && island.maxY <= 8.6 && island.maxR > 1.2) {
        primaryBoosters.push(island)
      } else {
        otherIslands.push(island)
      }
    }

    // Sort deterministically by azimuth angle
    primaryBoosters.sort((a, b) => {
      const angA = Math.atan2(a.sumZ / Math.max(1, a.vertTotal), a.sumX / Math.max(1, a.vertTotal))
      const angB = Math.atan2(b.sumZ / Math.max(1, b.vertTotal), b.sumX / Math.max(1, b.vertTotal))
      return angA - angB
    })

    // Absorb detached nozzle skirt rings directly aligned beneath any strap-on booster nozzle (within 0.65m)
    const boosterIdxLists: number[][] = primaryBoosters.map(b => [...b.indices])
    const boosterNozzleCenters = primaryBoosters.map(b => ({
      nx: b.nozzleVerts > 0 ? b.nozzleSumX / b.nozzleVerts : b.sumX / Math.max(1, b.vertTotal),
      nz: b.nozzleVerts > 0 ? b.nozzleSumZ / b.nozzleVerts : b.sumZ / Math.max(1, b.vertTotal),
    }))

    const coreIdx: number[] = []
    for (const island of otherIslands) {
      let absorbed = false
      if (island.maxY <= 1.2 && island.maxR > 1.2) {
        const icx = island.sumX / Math.max(1, island.vertTotal)
        const icz = island.sumZ / Math.max(1, island.vertTotal)
        for (let b = 0; b < primaryBoosters.length; b++) {
          const nc = boosterNozzleCenters[b]!
          if (Math.hypot(icx - nc.nx, icz - nc.nz) < 0.65) {
            boosterIdxLists[b]!.push(...island.indices)
            absorbed = true
            break
          }
        }
      }
      if (!absorbed) {
        coreIdx.push(...island.indices)
      }
    }

    const mat = (sourceMesh as THREE.Mesh).material
    function makeSubMesh(indices: number[], offsetX = 0, offsetZ = 0): THREE.Mesh {
      const subGeo = new THREE.BufferGeometry()
      if (offsetX === 0 && offsetZ === 0) {
        subGeo.setAttribute('position', geo.attributes.position!)
      } else {
        const posClone = geo.attributes.position!.clone()
        for (let j = 0; j < posClone.count; j++) {
          posClone.setX(j, posClone.getX(j) - offsetX)
          posClone.setZ(j, posClone.getZ(j) - offsetZ)
        }
        subGeo.setAttribute('position', posClone)
      }
      if (geo.attributes.normal) subGeo.setAttribute('normal', geo.attributes.normal)
      if (geo.attributes.uv) subGeo.setAttribute('uv', geo.attributes.uv)
      const arr = indices.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices)
      subGeo.setIndex(new THREE.BufferAttribute(arr, 1))
      const m = new THREE.Mesh(subGeo, mat)
      m.castShadow = true
      m.receiveShadow = true
      return m
    }

    this.heroBoosterGroups = []
    for (let b = 0; b < primaryBoosters.length; b++) {
      const bIndices = boosterIdxLists[b]!
      let sx = 0
      let sz = 0
      for (const idx of bIndices) {
        sx += posAttr.getX(idx)
        sz += posAttr.getZ(idx)
      }
      const bCount = bIndices.length
      const bx = bCount > 0 ? sx / bCount : 0
      const bz = bCount > 0 ? sz / bCount : 0
      const angle = Math.atan2(bz, bx)
      const attachPosition = new THREE.Vector3(bx, 0, bz)
      const nc = boosterNozzleCenters[b]!
      const plumeLocalX = nc.nx - bx
      const plumeLocalZ = nc.nz - bz

      const bGroup = new THREE.Group()
      bGroup.name = `HeroBooster_${b + 1}`
      bGroup.position.copy(attachPosition)
      bGroup.add(makeSubMesh(bIndices, bx, bz))

      const plume = new THREE.Mesh(
        new THREE.ConeGeometry(0.32, 2.8, 16),
        new THREE.MeshBasicMaterial({ color: '#ffaa22', transparent: true, opacity: 0.90, depthWrite: false }),
      )
      plume.position.set(plumeLocalX, -1.35, plumeLocalZ)
      plume.rotation.x = Math.PI
      bGroup.add(plume)

      const plumeCore = new THREE.Mesh(
        new THREE.ConeGeometry(0.17, 2.0, 12),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false }),
      )
      plumeCore.position.set(0, -0.40, 0)
      plume.add(plumeCore)

      const light = new THREE.PointLight('#ff7700', 0, 14)
      light.position.set(plumeLocalX, -0.6, plumeLocalZ)
      bGroup.add(light)

      this.heroBoosterGroups.push({
        group: bGroup,
        angle,
        attachPosition,
        plume,
        light,
      })
    }

    for (const g of this.importedStageGroups) g.clear()
    this.importedStageGroups[0]!.add(makeSubMesh(coreIdx))

    // Sculpted dark-titanium sustainer engine bell & heat-shield bulkhead at base of GLB core (y = -0.36..+0.26)
    const coreBulkheadMat = new THREE.MeshStandardMaterial({ color: '#1b2028', roughness: 0.58, metalness: 0.45 })
    const coreNozzleMat = new THREE.MeshStandardMaterial({ color: '#2b323d', roughness: 0.36, metalness: 0.78 })
    const coreCollar = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 0.94, 0.24, 28), coreBulkheadMat)
    coreCollar.position.set(0, 0.14, 0)
    const coreBell = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.72, 0.64, 24), coreNozzleMat)
    coreBell.position.set(0, -0.04, 0)
    coreBell.castShadow = true
    const coreThroat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.38, 0.10, 20),
      new THREE.MeshBasicMaterial({ color: '#ff9922' }),
    )
    coreThroat.position.set(0, -0.33, 0)
    this.importedStageGroups[0]!.add(coreCollar, coreBell, coreThroat)

    for (const b of this.heroBoosterGroups) {
      this.importedStageGroups[0]!.add(b.group)
    }

    this.heroModelPartitioned = true
    this.rebuildImportedRocket()
  }

  private rebuildImportedRocket(): void {
    if (!this.heroModelPartitioned) return

    for (const db of this.detachedBoosters) {
      db.group.parent?.remove(db.group)
    }
    this.detachedBoosters = []
    this.boostersSeparated = false

    for (let i = 0; i < 3; i++) {
      const g = this.importedStageGroups[i]!
      if (g.parent !== this.rocketImported) {
        g.parent?.remove(g)
        this.rocketImported.add(g)
      }
      g.position.set(0, 0, 0)
      g.quaternion.identity()
      g.visible = true
    }

    for (const b of this.heroBoosterGroups) {
      const oldSep = b.group.getObjectByName('BoosterSepPlume')
      if (oldSep) b.group.remove(oldSep)
      const oldEmber = b.group.getObjectByName('BoosterThroatEmber')
      if (oldEmber) b.group.remove(oldEmber)
      if (b.group.parent !== this.importedStageGroups[0]) {
        b.group.parent?.remove(b.group)
        this.importedStageGroups[0]!.add(b.group)
      }
      b.group.position.copy(b.attachPosition)
      b.group.quaternion.identity()
      b.plume.visible = this.stage === 'launch'
      b.light.intensity = this.stage === 'launch' ? 2.5 : 0
    }

    this.strapOnBoosters = [...this.heroBoosterGroups]
  }

  private buildStrapOnBoosters(): void {
    for (const b of this.strapOnBoosters) {
      b.group.parent?.remove(b.group)
    }
    for (const db of this.detachedBoosters) {
      db.group.parent?.remove(db.group)
    }
    this.strapOnBoosters = []
    this.detachedBoosters = []
    this.boostersSeparated = false

    const stage0 = this.rocketStageGroups[0]
    if (!stage0) return

    const whiteMat = mat('#f0f2f5', 0.28, 0.15)
    const blackMat = mat('#14171a', 0.85, 0.05)
    const metalMat = mat('#c2c7cc', 0.35, 0.75)
    const nozzleMat = mat('#1c2024', 0.5, 0.5)

    const boosterRadius = 1.95
    const angles = [
      Math.PI / 4,
      (3 * Math.PI) / 4,
      (5 * Math.PI) / 4,
      (7 * Math.PI) / 4,
    ]

    for (let i = 0; i < angles.length; i++) {
      const angle = angles[i]!
      const bGroup = new THREE.Group()
      bGroup.name = `StrapOnBooster_${i + 1}`

      // 1. Aerodynamic Conical Nosecone
      const nose = mesh(new THREE.ConeGeometry(0.44, 1.6, 24), whiteMat, V3(0, 7.6, 0), bGroup)
      nose.rotation.z = -0.06

      // 2. Main Booster Cylindrical Tank
      mesh(new THREE.CylinderGeometry(0.44, 0.44, 6.2, 24), whiteMat, V3(0, 3.8, 0), bGroup)

      // Black vertical tracking roll stripe
      box(bGroup, [0.06, 5.8, 0.08], [0.44, 3.8, 0], blackMat)

      // Structural compression rings
      for (const ry of [1.8, 3.8, 5.8]) {
        const ring = mesh(new THREE.TorusGeometry(0.45, 0.02, 6, 24), metalMat, V3(0, ry, 0), bGroup)
        ring.rotation.x = Math.PI / 2
      }

      // 3. Heavy Rocket Engine Gimbal Nozzle Bell
      const nozzle = mesh(new THREE.CylinderGeometry(0.18, 0.40, 0.75, 18), nozzleMat, V3(0, 0.35, 0), bGroup)
      nozzle.rotation.x = Math.PI
      const throat = mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.15, 16), new THREE.MeshBasicMaterial({ color: '#ff7700' }), V3(0, 0.65, 0), bGroup, false)
      throat.rotation.x = Math.PI

      // 4. Heavy-duty Chrome Attachment Trusses connecting booster to core
      box(bGroup, [0.55, 0.12, 0.12], [-0.48, 2.2, 0], metalMat)
      box(bGroup, [0.55, 0.12, 0.12], [-0.48, 5.6, 0], metalMat)

      // 5. Fiery Engine Plume & Dynamic PointLight
      const plume = new THREE.Mesh(
        new THREE.ConeGeometry(0.34, 2.8, 16),
        new THREE.MeshBasicMaterial({ color: '#ffaa22', transparent: true, opacity: 0.92, depthWrite: false }),
      )
      plume.position.set(0, -1.35, 0)
      plume.rotation.x = Math.PI
      bGroup.add(plume)

      const plumeCore = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 2.0, 12),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.96, depthWrite: false }),
      )
      plumeCore.position.set(0, -0.40, 0)
      plume.add(plumeCore)

      const light = new THREE.PointLight('#ff7700', 3.0, 14)
      light.position.set(0, -0.6, 0)
      bGroup.add(light)

      // Radial placement around the central stage 0 core
      const bx = Math.cos(angle) * boosterRadius
      const bz = Math.sin(angle) * boosterRadius
      bGroup.position.set(bx, 0, bz)
      bGroup.rotation.y = -angle

      stage0.add(bGroup)
      this.strapOnBoosters.push({
        group: bGroup,
        angle,
        plume,
        light,
      })
    }
  }

  separateBoosters(): void {
    if (this.boostersSeparated || this.strapOnBoosters.length === 0) return
    this.boostersSeparated = true

    this.rocket.updateMatrixWorld(true)
    const rocketForward = new THREE.Vector3(0, 1, 0).applyQuaternion(this.rocket.quaternion).normalize()

    // 1. Pyrotechnic separation flash light
    const flashLight = new THREE.PointLight('#ffaa22', 14.0, 30)
    flashLight.position.copy(this.rocket.position)
    this.hangar.add(flashLight)
    window.setTimeout(() => {
      this.hangar.remove(flashLight)
    }, 180)

    for (const booster of this.strapOnBoosters) {
      if (!booster.group.parent) continue
      booster.group.updateMatrixWorld(true)
      const worldPos = new THREE.Vector3()
      const worldQuat = new THREE.Quaternion()
      booster.group.getWorldPosition(worldPos)
      booster.group.getWorldQuaternion(worldQuat)

      booster.group.parent.remove(booster.group)
      this.hangar.add(booster.group)
      booster.group.position.copy(worldPos)
      booster.group.quaternion.copy(worldQuat)

      booster.plume.visible = false
      booster.light.intensity = 0

      // 2. Active solid-propellant nosecone separation retro-thruster (pushes tips outward in symmetrical Korolev cross)
      const jetDirLocal = this.heroModelPartitioned
        ? new THREE.Vector3(-Math.cos(booster.angle), 0.36, -Math.sin(booster.angle)).normalize()
        : new THREE.Vector3(-1, 0.36, 0).normalize()
      const throatPosLocal = this.heroModelPartitioned
        ? new THREE.Vector3(-Math.cos(booster.angle) * 0.25, 7.15, -Math.sin(booster.angle) * 0.25)
        : new THREE.Vector3(-0.32, 7.15, 0)

      const sepPlume = new THREE.Mesh(
        new THREE.ConeGeometry(0.24, 1.75, 12),
        new THREE.MeshBasicMaterial({ color: '#fff4de', transparent: true, opacity: 0.95, depthWrite: false }),
      )
      sepPlume.name = 'BoosterSepPlume'
      sepPlume.quaternion.setFromUnitVectors(V3(0, -1, 0), jetDirLocal)
      sepPlume.position.copy(throatPosLocal).addScaledVector(jetDirLocal, 0.85)
      booster.group.add(sepPlume)

      // Glowing hot orange throat ember centered at booster nozzle bell
      const throatEmber = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.22, 0.18, 12),
        new THREE.MeshBasicMaterial({ color: '#ff3300' }),
      )
      throatEmber.name = 'BoosterThroatEmber'
      throatEmber.position.set(booster.plume.position.x, 0.35, booster.plume.position.z)
      booster.group.add(throatEmber)

      // Radial outward separation direction (Korolev cross pattern)
      const outwardLocal = new THREE.Vector3(Math.cos(booster.angle), 0, Math.sin(booster.angle))
      const outwardDir = outwardLocal.applyQuaternion(this.rocket.quaternion).normalize()

      // Rocket-relative kinematics so all 3 boosters peel open & drift cleanly within chase camera view
      const relPos = worldPos.clone().sub(this.rocket.position)
      const velocity = outwardDir.clone().multiplyScalar(6.5).addScaledVector(rocketForward, -3.2)
      const relAccel = outwardDir.clone().multiplyScalar(2.4).addScaledVector(rocketForward, -7.2).add(V3(0, -1.2, 0))

      // Tumbling angular velocity: peeling nosecones outward away from the central core
      const pitchAxisLocal = new THREE.Vector3(Math.sin(booster.angle), 0, -Math.cos(booster.angle))
      const pitchAxis = pitchAxisLocal.applyQuaternion(this.rocket.quaternion).normalize()
      const angularVelocity = pitchAxis.multiplyScalar(1.05)

      this.detachedBoosters.push({
        group: booster.group,
        velocity,
        angularVelocity,
        life: 16.0,
        relPos,
        relAccel,
        sepPlumeOffLife: 13.8,
      })
    }

    const boosterCount = this.strapOnBoosters.length
    this.statusMessage = `⚡ OZON QATLAMI YORIB O‘TILDI: ${boosterCount} ta yon bosqich (Korolyov kresti) muvaffaqiyatli ajraldi! Asosiy blok parvozda.`
  }

  jettisonFairing(): void {
    if (this.fairingJettisoned) return
    this.fairingJettisoned = true

    this.rocket.updateMatrixWorld(true)
    const rocketForward = new THREE.Vector3(0, 1, 0).applyQuaternion(this.rocket.quaternion).normalize()
    const rocketRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.rocket.quaternion).normalize()

    // 2 Aerodynamic clamshell fairing halves that split laterally in space
    const fairingMat = new THREE.MeshStandardMaterial({
      color: '#f0f2f5',
      roughness: 0.3,
      metalness: 0.1,
      side: THREE.DoubleSide,
    })

    for (const dir of [-1, 1]) {
      const halfFairingGroup = new THREE.Group()

      // Half-cylinder body
      const halfCyl = new THREE.Mesh(
        new THREE.CylinderGeometry(1.15, 1.15, 3.2, 16, 1, false, 0, Math.PI),
        fairingMat,
      )
      halfCyl.position.set(0, 1.6, 0)
      halfFairingGroup.add(halfCyl)

      // Half-cone nose
      const halfNose = new THREE.Mesh(
        new THREE.ConeGeometry(1.15, 2.8, 16, 1, false, 0, Math.PI),
        fairingMat,
      )
      halfNose.position.set(0, 4.6, 0)
      halfFairingGroup.add(halfNose)

      // Position in world space at rocket upper payload adapter
      const fairingWorldPos = new THREE.Vector3(0, 14.5, 0)
        .applyQuaternion(this.rocket.quaternion)
        .add(this.rocket.position)

      halfFairingGroup.position.copy(fairingWorldPos)
      halfFairingGroup.quaternion.copy(this.rocket.quaternion)
      if (dir < 0) halfFairingGroup.rotateY(Math.PI)

      this.hangar.add(halfFairingGroup)

      // Rocket-relative lateral ejection velocity + backward drift
      const relPos = fairingWorldPos.clone().sub(this.rocket.position)
      const ejectVel = rocketRight
        .clone()
        .multiplyScalar(dir * 6.8)
        .addScaledVector(rocketForward, -2.5)
      const relAccel = rocketForward.clone().multiplyScalar(-5.8)

      const tumble = new THREE.Vector3(0.35 * dir, 0.75, 0.45).applyQuaternion(this.rocket.quaternion)

      this.detachedBoosters.push({
        group: halfFairingGroup,
        velocity: ejectVel,
        angularVelocity: tumble,
        life: 14.0,
        relPos,
        relAccel,
      })
    }

    this.statusMessage = '⚡ FEYRING AJRATILDI (105 km): Aerodinamik bosh qoplama ajraldi! Oy ekspeditsiya moduli ochiq koinotda.'
  }

  private separateRocketStage(stageIndex: number): void {
    // For imported 3D rocket model, keep the full central rocket core continuous and intact.
    // Only the side boosters detach at 30 km, ensuring no empty gap or missing body during flight!
    if (this.heroModelPartitioned) return

    const rocketForward = new THREE.Vector3(0, 1, 0).applyQuaternion(this.rocket.quaternion).normalize()
    const group = this.rocketStageGroups[stageIndex]
    if (group && group.parent === this.rocketProcedural) {
      this.rocket.updateMatrixWorld(true)
      group.getWorldPosition(this.stageWorldPosition)
      group.getWorldQuaternion(this.stageWorldQuaternion)
      this.rocketProcedural.remove(group)
      this.hangar.add(group)
      group.position.copy(this.stageWorldPosition)
      group.quaternion.copy(this.stageWorldQuaternion)
      this.detachedBoosters.push({
        group,
        velocity: rocketForward.clone().multiplyScalar(-16.0),
        angularVelocity: new THREE.Vector3(0.12, 0.05, 0.08),
        life: 25.0,
      })
    }

    this.syncRocket()
  }

  private syncRocket(): void {
    const useImportedRocket = Boolean(this.heroModel && this.heroModelPartitioned)
    this.rocketImported.visible = useImportedRocket
    this.rocketProcedural.visible = !useImportedRocket
  }

  private makeHangar(): void {
    // ── Realistic Launch Environment (Sunrise Sky, Clouds, Concrete Pad, Mountains, Infrastructure) ──
    const env = createLaunchEnvironment(this.scene)
    this.launchEnv = env
    this.hangar.add(env.group)
    this.launchWaterRings.push(...env.waterRings)

    // ── Realistic Launch Umbilical Tower & Articulated Swing Clamp Arms (Task 2/7) ──
    const tower = createLaunchTower()
    this.launchTower = tower
    this.hangar.add(tower.group)

    // ── Realistic Tropospheric Multi-Deck 3D Clouds ──
    const clouds = createTroposphereCloudSystem()
    this.troposphereClouds = clouds
    this.hangar.add(clouds.group)

    // ── Realistic Earth Atmosphere Strata & Ozone Layer ──
    const strata = createAtmosphereStrata()
    this.atmosphereStrata = strata
    this.hangar.add(strata.group)
    this.rocket.add(strata.rocketAttachmentGroup)

    // ── High-density Supersonic Rocket Exhaust & Combustion System ──
    const exhaust = createRocketExhaustSystem(this.scene)
    this.rocketExhaust = exhaust

    // ── Photorealistic Deep-Space Sun, Coronal Halo & Solar Rays ("Quyosh Nuri") ──
    const spaceSun = createSpaceSun(this.scene)
    this.spaceSun = spaceSun
  }

  private makeSpace(): void {
    const earth = createEarth(EARTH_CENTER)
    this.earthBody = earth
    this.space.add(earth.group)

    const moon = createMoon(EARTH_CENTER)
    this.moonBody = moon
    this.space.add(moon.group)
    this.space.add(moon.orbitLine)

    // ── Full Illuminated Ballistic Trajectory Route all the way to the Moon ──
    // Trajectory is placed directly in the craft's horizontal orbital plane (Y = EARTH_CENTER.y + 2)
    const fullRoutePoints: THREE.Vector3[] = []
    const trajectorySegments = 120
    const startPt = V3(EARTH_CENTER.x + 22, EARTH_CENTER.y + 2, EARTH_CENTER.z + 12)
    const endPt = V3(MOON_CENTER.x - 22, EARTH_CENTER.y + 2, MOON_CENTER.z + 12)
    const archApex = V3(ROUTE_CENTER.x, EARTH_CENTER.y + 2, ROUTE_CENTER.z - 28)

    const trajCurve = new THREE.QuadraticBezierCurve3(startPt, archApex, endPt)
    this.fullTrajectoryCurve = trajCurve
    for (let i = 0; i <= trajectorySegments; i++) {
      fullRoutePoints.push(trajCurve.getPoint(i / trajectorySegments))
    }

    const fullRouteGeo = new THREE.BufferGeometry().setFromPoints(fullRoutePoints)
    const fullRouteMat = new THREE.LineDashedMaterial({
      color: '#00f5ff',
      dashSize: 6,
      gapSize: 4,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      fog: false,
    })
    const fullRouteLine = new THREE.Line(fullRouteGeo, fullRouteMat)
    fullRouteLine.computeLineDistances()
    fullRouteLine.renderOrder = 2
    this.space.add(fullRouteLine)
    this.fullTrajectoryRoute = fullRouteLine

    // Completed Path (solid bright gold line tracing past travel)
    this.flightPathLine.geometry.setFromPoints(fullRoutePoints)
    this.flightPathLine.material = new THREE.LineBasicMaterial({
      color: '#ffd56b',
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    })
    this.flightPathLine.geometry.setDrawRange(0, 0)
    this.flightPathLine.renderOrder = 3
    this.flightPathLine.visible = false
    this.space.add(this.flightPathLine)

    // Glowing Holographic Moon Target Waypoint Beacon
    const moonBeacon = new THREE.Group()
    moonBeacon.name = 'MoonWaypointBeacon'
    const reticleGeo = new THREE.RingGeometry(CELESTIAL_CONFIG.MOON_RADIUS * 1.35, CELESTIAL_CONFIG.MOON_RADIUS * 1.48, 48)
    const reticleMat = new THREE.MeshBasicMaterial({
      color: '#00f0ff',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    })
    const reticleMesh = new THREE.Mesh(reticleGeo, reticleMat)
    moonBeacon.add(reticleMesh)
    this.space.add(moonBeacon)
    this.moonWaypointMarker = moonBeacon

    // Realistic Lunar Expedition Spacecraft (Command & Service Module + Lunar Module + Solar Wings + Carrier Rocket Adapter)
    this.transitCraftAssembly = createLunarTransitCraft()
    this.flightCraft.add(this.transitCraftAssembly.group)
    this.transitPlume.position.y = -1.9
    this.transitPlume.rotation.x = Math.PI
    this.transitPlume.visible = true

    // Fiery glowing inner propulsion core
    const plumeCore = new THREE.Mesh(
      new THREE.ConeGeometry(0.24, 2.2, 12),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false }),
    )
    plumeCore.position.set(0, 0.2, 0)
    plumeCore.renderOrder = 4
    this.transitPlume.add(plumeCore)

    this.transitLight.position.y = 3.8
    this.flightCraft.add(this.transitPlume, this.transitLight)
    this.space.add(this.flightCraft)
    this.makeSun()
  }

  private makeSun(): void {
    const sunCosmos = createSunCosmos()
    this.sunCosmos = sunCosmos
    // Distant fiery Sun in the deep background (upper-left cosmic vista, matching sunlight)
    sunCosmos.group.position.set(-280, 130, -260)
    sunCosmos.group.scale.setScalar(1.4)
    this.space.add(sunCosmos.group)
  }

  private loadEarthTextures(earthMaterial: THREE.MeshStandardMaterial, cloudMaterial: THREE.MeshStandardMaterial): void {
    const loader = new THREE.TextureLoader()
    const basePath = import.meta.env.BASE_URL
    loader.load(`${basePath}textures/earth-daymap.jpg`, texture => {
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 4
      earthMaterial.map = texture
      earthMaterial.color.set('#ffffff')
      earthMaterial.roughness = 0.55
      earthMaterial.metalness = 0.12
      earthMaterial.needsUpdate = true
    })
    loader.load(`${basePath}textures/earth-nightmap.jpg`, texture => {
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 4
      earthMaterial.emissiveMap = texture
      earthMaterial.emissive = new THREE.Color('#ffe2a0')
      earthMaterial.emissiveIntensity = 0.85
      earthMaterial.needsUpdate = true
    })
    loader.load(`${basePath}textures/earth-clouds.jpg`, texture => {
      texture.colorSpace = THREE.NoColorSpace
      texture.anisotropy = 4
      cloudMaterial.alphaMap = texture
      cloudMaterial.opacity = 0.72
      cloudMaterial.needsUpdate = true
    })
  }

  private makeMoon(): void {
    const terrainGeo = new THREE.PlaneGeometry(280, 280, 128, 128)
    const positions = terrainGeo.attributes.position as THREE.BufferAttribute
    let random = seededRandom(0x4c554e41)
    makeLunarCraters(random)
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i)
      const z = -positions.getY(i)
      positions.setZ(i, lunarTerrainHeight(x, z))
    }
    terrainGeo.rotateX(-Math.PI / 2)
    terrainGeo.computeVertexNormals()

    // Regolith Canvas Texture with micro-craters, dust roughness, and ejecta blanket
    const regolithCanvas = document.createElement('canvas')
    regolithCanvas.width = 512
    regolithCanvas.height = 512
    const rctx = regolithCanvas.getContext('2d')
    if (rctx) {
      rctx.fillStyle = '#8a8984'
      rctx.fillRect(0, 0, 512, 512)
      // Fine dust noise
      const imgData = rctx.getImageData(0, 0, 512, 512)
      const d = imgData.data
      let rseed = 0x7e8b
      for (let p = 0; p < d.length; p += 4) {
        rseed = (rseed * 1664525 + 1013904223) >>> 0
        const noise = ((rseed / 4294967296) - 0.5) * 28
        d[p] = Math.min(255, Math.max(0, d[p] + noise))
        d[p + 1] = Math.min(255, Math.max(0, d[p + 1] + noise))
        d[p + 2] = Math.min(255, Math.max(0, d[p + 2] + noise))
      }
      rctx.putImageData(imgData, 0, 0)
    }
    const regolithTex = new THREE.CanvasTexture(regolithCanvas)
    regolithTex.wrapS = regolithTex.wrapT = THREE.RepeatWrapping
    regolithTex.repeat.set(16, 16)
    regolithTex.colorSpace = THREE.SRGBColorSpace

    const colors = new Float32Array(positions.count * 3)
    const base = new THREE.Color('#94928b')
    for (let i = 0; i < positions.count; i += 1) {
      const h = THREE.MathUtils.clamp(0.92 + positions.getY(i) * 0.035, 0.74, 1.22)
      colors[i * 3] = base.r * h
      colors[i * 3 + 1] = base.g * h
      colors[i * 3 + 2] = base.b * h
    }
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const terrainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: regolithTex,
      bumpMap: regolithTex,
      bumpScale: 0.16,
      roughness: 0.96,
      metalness: 0.02,
      flatShading: false,
    })
    const lunarMap = new THREE.TextureLoader().load(
      `${import.meta.env.BASE_URL}textures/moon-map.jpg`,
      texture => {
        texture.colorSpace = THREE.SRGBColorSpace
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.repeat.set(2, 2)
        terrainMaterial.map = texture
        terrainMaterial.bumpMap = texture
        terrainMaterial.needsUpdate = true
      },
      undefined,
      error => console.error('Oy sirt xaritasi yuklanmadi.', error),
    )
    lunarMap.colorSpace = THREE.SRGBColorSpace
    const terrain = new THREE.Mesh(terrainGeo, terrainMaterial)
    terrain.receiveShadow = true
    terrain.rotation.y = 0
    this.moon.add(terrain)
    const rockGeometry = new THREE.DodecahedronGeometry(0.42, 0)
    const rocks = new THREE.InstancedMesh(rockGeometry, mat('#77756f', 0.99, 0), 80)
    const rockTransform = new THREE.Object3D()
    let placedRocks = 0
    this.terrainRockObstacles.length = 0
    for (let attempt = 0; attempt < 220 && placedRocks < rocks.count; attempt += 1) {
      const x = random() * 112 - 56
      const z = random() * 112 - 56
      if (Math.hypot(x, z) < 10 || RESEARCH_OBJECTIVES.some(point => Math.hypot(x - point.position.x, z - point.position.z) < 5)) continue
      const size = 0.35 + random() * 0.9
      rockTransform.position.set(x, lunarTerrainHeight(x, z) + size * 0.22, z)
      rockTransform.rotation.set(random() * 0.8, random() * Math.PI, random() * 0.7)
      rockTransform.scale.set(size * (0.8 + random() * 0.6), size * (0.45 + random() * 0.4), size * (0.8 + random() * 0.5))
      rockTransform.updateMatrix()
      rocks.setMatrixAt(placedRocks, rockTransform.matrix)
      this.terrainRockObstacles.push({
        x,
        z,
        radius: size * 0.85,
        height: size * 0.42,
      })
      placedRocks += 1
    }
    rocks.count = placedRocks
    rocks.castShadow = true
    rocks.receiveShadow = true
    this.moon.add(rocks)
    this.terrainRocks = rocks
    this.terrainRockCount = placedRocks
    const horizon = mesh(new THREE.SphereGeometry(230, 32, 20), mat('#17191c', 1, 0), V3(0, -230, 0), this.moon, false)
    horizon.scale.y = 0.1

    // Distant Earth hanging beautifully in the lunar sky (Earthrise perspective)
    const earthriseGroup = new THREE.Group()
    earthriseGroup.position.set(-250_000_000, 110_000_000, -278_000_000)
    const skyEarthMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.65,
      metalness: 0.08,
      emissive: '#04101e',
      emissiveIntensity: 0.28,
    })
    const skyEarth = mesh(new THREE.SphereGeometry(6_371_000, 48, 36), skyEarthMat, V3(0, 0, 0), earthriseGroup, false)
    skyEarth.rotation.x = 0.25
    skyEarth.rotation.z = -0.15

    const skyEarthCloudsMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 1,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    })
    mesh(new THREE.SphereGeometry(6_485_000, 48, 36), skyEarthCloudsMat, V3(0, 0, 0), earthriseGroup, false)

    const skyEarthAtmosphereMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.7 - dot(vNormal, vec3(0, 0, 1.0)), 2.8);
          gl_FragColor = vec4(0.24, 0.65, 1.0, 1.0) * intensity * 0.9;
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    })
    mesh(new THREE.SphereGeometry(6_560_000, 48, 36), skyEarthAtmosphereMat, V3(0, 0, 0), earthriseGroup, false)
    this.loadEarthTextures(skyEarthMat, skyEarthCloudsMat)
    this.moon.add(earthriseGroup)
    this.landingZoneMarker.visible = false
    const landingRing = mesh(new THREE.TorusGeometry(8, 0.12, 8, 72), mat('#8b9b9b', 0.72, 0.02), V3(0, 0.14, 0), this.landingZoneMarker, false)
    landingRing.rotation.x = Math.PI / 2
    const centerRing = mesh(new THREE.TorusGeometry(4.7, 0.055, 6, 64), mat('#b3aa8a', 0.8, 0), V3(0, 0.18, 0), this.landingZoneMarker, false)
    centerRing.rotation.x = Math.PI / 2
    this.moon.add(this.landingZoneMarker)
    this.landingDust.rotation.x = -Math.PI / 2
    this.landingDust.visible = false
    this.moon.add(this.landingDust)
    this.lander.position.set(this.landingX, 48, this.landingZ)
    this.moon.add(this.lander)
    this.makeResearchMarkers()
    this.moon.add(this.rover)
    this.rover.add(this.roverPlaceholder)
  }

  private makeResearchMarkers(): void {
    const hues = ['#f2c86b', '#77daca', '#89b7ee']
    RESEARCH_OBJECTIVES.forEach((target, index) => {
      const beacon = new THREE.Group()
      beacon.position.copy(target.position)
      const color = hues[index]
      mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.6, 8), mat(color, 0.55, 0.16), V3(0, 0.82, 0), beacon, false)
      const ring = mesh(new THREE.TorusGeometry(1.4, 0.06, 8, 32), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.26, roughness: 0.5 }), V3(0, 0.12, 0), beacon, false)
      ring.rotation.x = Math.PI / 2
      mesh(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshBasicMaterial({ color }), V3(0, 1.7, 0), beacon, false)
      const light = new THREE.PointLight(color, 2.4, 13)
      light.position.set(0, 2.1, 0)
      beacon.add(light)
      if (index === 0) {
        const rock = mesh(new THREE.DodecahedronGeometry(0.7, 1), mat('#928f87', 0.98, 0), V3(1.1, 0.44, 0.6), beacon, true)
        rock.scale.set(1.2, 0.72, 0.9)
      } else if (index === 1) {
        box(beacon, [0.8, 0.9, 0.8], [0.72, 0.56, 0.4], mat('#3a4850', 0.66, 0.27))
        const mast = mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 6), mat('#bec8c4', 0.6, 0.24), V3(0.72, 1.7, 0.4), beacon, false)
        mast.rotation.z = -0.3
      } else {
        for (let i = 0; i < 3; i += 1) {
          const rock = mesh(new THREE.DodecahedronGeometry(0.8 - i * 0.12, 1), mat('#878680', 0.98, 0), V3((i - 1) * 1.1, 0.28, 1.3), beacon)
          rock.scale.set(1.4, 0.6, 1)
        }
      }
      this.moon.add(beacon)
      this.targetMarker.push(beacon)
    })
  }

  private makeRover(): void {
    const body = mat('#c2c9c7', 0.58, 0.3)
    const dark = mat('#242c31', 0.84, 0.12)
    const panel = mat('#23496e', 0.38, 0.52)
    box(this.roverPlaceholder, [2.2, 0.45, 1.7], [0, 1.05, 0], body)
    box(this.roverPlaceholder, [1.4, 0.62, 1.05], [0, 1.54, 0], mat('#8e9ba0', 0.63, 0.22))
    box(this.roverPlaceholder, [2.4, 0.08, 0.72], [2, 1.38, 0], panel)
    box(this.roverPlaceholder, [2.4, 0.08, 0.72], [-2, 1.38, 0], panel)
    mesh(new THREE.CylinderGeometry(0.055, 0.065, 1.55, 7), body, V3(0, 2.35, -0.4), this.roverPlaceholder)
    box(this.roverPlaceholder, [0.62, 0.48, 0.52], [0, 3.05, -0.4], dark)
    for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) {
      const position = V3(sx * 1.18, 0.56, sz * 0.77)
      const pivot = new THREE.Group()
      pivot.position.copy(position)
      this.roverPlaceholder.add(pivot)
      const rollingWheel = new THREE.Group()
      pivot.add(rollingWheel)
      this.wheelRollGroups.push(rollingWheel)
      const wheel = mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.3, 16), dark, V3(0, 0, 0), rollingWheel)
      wheel.rotation.z = Math.PI / 2
      this.wheelMeshes.push(wheel)
      this.wheelPivots.push(pivot)
      this.wheelLocalPositions.push(V3(position.x, 0, position.z))
      if (sz > 0) this.steeringWheels.push(pivot)
      const hub = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.33, 12), mat('#869195', 0.66, 0.35), V3(0, 0, 0), rollingWheel, false)
      hub.rotation.z = Math.PI / 2
      const shock = mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.38, 8), mat('#c5cbca', 0.48, 0.64), V3(0, 0.31, 0), pivot, false)
      this.suspensionStruts.push(shock)
    }
  }
}
