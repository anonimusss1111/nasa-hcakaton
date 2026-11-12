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
import { createProceduralStarfield, type StarfieldController } from './starfield'
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

  // ── 1. CARRIER ROCKET UPPER STAGE & PAYLOAD ADAPTER ──────────────────────
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

  // ── 2. SEPARATING PAYLOAD FAIRING HALF-CLAMSHELLS ────────────────────────
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

  // ── 3. MAIN LUNAR EXPEDITION SPACECRAFT (Orion / Apollo style) ────────────
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

    // Yaw left / right
    const yL = mesh(new THREE.ConeGeometry(0.09, 0.52, 8), gasMat.clone(), V3(0, 0, 0.32), rcsBlock, false)
    yL.rotation.y = -Math.PI / 2
    rcsPlumes.yawLeft.push(yL)
    const yR = mesh(new THREE.ConeGeometry(0.09, 0.52, 8), gasMat.clone(), V3(0, 0, -0.32), rcsBlock, false)
    yR.rotation.y = Math.PI / 2
    rcsPlumes.yawRight.push(yR)

    // Retro
    const retro = mesh(new THREE.ConeGeometry(0.09, 0.52, 8), gasMat.clone(), V3(-0.32, 0, 0), rcsBlock, false)
    retro.rotation.z = Math.PI / 2
    rcsPlumes.retro.push(retro)
  }

  // D. Solar Panels
  const solarWings: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const wing = new THREE.Group()
    wing.position.set(side * 1.35, 0.2, 0)
    mesh(new THREE.BoxGeometry(0.08, 0.08, 0.4), chromeMat, V3(0, 0, 0), wing)
    mesh(new THREE.BoxGeometry(2.8, 0.06, 1.1), solarPanelMat, V3(side * 1.5, 0, 0), wing)
    craftBody.add(wing)
    solarWings.push(wing)
  }

  // E. Lunar Module (LEM) docked below service module for transit
  const lemModule = new THREE.Group()
  lemModule.name = 'LEM'
  mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 24), goldFoil, V3(0, -1.4, 0), lemModule)
  mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.8, 16), whiteMat, V3(0, -2.4, 0), lemModule)
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2
    mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8), chromeMat, V3(Math.cos(a) * 0.7, -2.8, Math.sin(a) * 0.7), lemModule)
  }
  craftBody.add(lemModule)

  group.add(craftBody)

  return {
    group,
    craftBody,
    carrierStage,
    fairingLeft,
    fairingRight,
    lemModule,
    solarWings,
    rcsPlumes,
    updateExtraction(elapsedSeconds: number) {
      const t = Math.min(1, elapsedSeconds / 8)
      fairingLeft.rotation.z = -t * 1.2
      fairingRight.rotation.z = t * 1.2
      fairingLeft.position.x = -t * 3.5
      fairingRight.position.x = t * 3.5
    },
    updateLemUndock(prog: number) {
      lemModule.position.y = -1.4 - prog * 6
    },
    setRcs(pitch: number, yaw: number, retro: boolean) {
      const op = 0.85
      for (const m of rcsPlumes.pitchPos) m.material.opacity = pitch > 0.1 ? op : 0
      for (const m of rcsPlumes.pitchNeg) m.material.opacity = pitch < -0.1 ? op : 0
      for (const m of rcsPlumes.yawLeft) m.material.opacity = yaw > 0.1 ? op : 0
      for (const m of rcsPlumes.yawRight) m.material.opacity = yaw < -0.1 ? op : 0
      for (const m of rcsPlumes.retro) m.material.opacity = retro ? op : 0
    },
  }
}

class MoonMission {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 500_000_000)
  stage: MissionStage = 'title'

  private readonly hangar = new THREE.Group()
  private readonly space = new THREE.Group()
  private readonly moon = new THREE.Group()
  private readonly rocket = new THREE.Group()
  private readonly rocketProcedural = new THREE.Group()
  private readonly rocketImported = new THREE.Group()
  private readonly importedStageGroups: THREE.Group[] = []
  private readonly cameraRelativeOffset = new THREE.Vector3(18, 10, 20)
  private readonly launchCameraView: LaunchCameraView = 'chase'
  private readonly transitCameraView: TransitCameraView = 'craft'

  private starsGroup!: THREE.Group
  private starfield?: StarfieldController
  private fullTrajectoryRoute?: THREE.Line
  private moonWaypointMarker?: THREE.Group
  private readonly terrainRockObstacles: Array<{ x: number; z: number; radius: number; height: number }> = []
  private rolloutProgress = 0
  private stageTimer = 0
  private elapsed = 0
  private statusMessage = ''
  private demoLandingSite: LandingSite | null = null
  private heroModelPartitioned = false

  private sun!: THREE.DirectionalLight
  private earthshineLight!: THREE.DirectionalLight
  private exhaustLight!: THREE.PointLight
  private rocketExhaust?: RocketExhaustSystem
  private atmosphereStrata?: AtmosphereStrataController
  private troposphereClouds?: TroposphereCloudSystem
  private launchEnvironment?: LaunchEnvironment
  private launchTower?: LaunchTower
  private sunCosmos?: SunCosmosController
  private spaceSun?: SpaceSunController
  private earth?: EarthBody
  private moonBody?: MoonBody
  private transitCraft?: TransitCraftAssembly
  private rover!: THREE.Group
  private landingZoneMarker!: THREE.Group
  private suspensionStruts: THREE.Mesh[] = []

  private readonly sceneMachine = new MissionSceneMachine()
  private transit?: { elapsedSeconds: number }
  private ascent?: AscentState
  private earthMoon?: EarthMoonState

  get transferElapsed(): number { return this.stage === 'transit' ? this.transit?.elapsedSeconds ?? 0 : 0 }
  get transferProgress(): number { return this.stage === 'transit' ? THREE.MathUtils.clamp(this.transferElapsed / TRANSIT_DURATION_SECONDS, 0, 1) : 0 }

  constructor(private readonly renderer: Renderer) {
    this.scene.background = new THREE.Color('#0a1324')
    this.scene.fog = new THREE.FogExp2('#b8623b', 0.0016)
    this.scene.add(new THREE.HemisphereLight('#85abcf', '#63422e', 1.15))
    this.sun = new THREE.DirectionalLight('#ffb470', 3.8)
    this.sun.position.set(-42, 24, -38)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.near = 0.5
    this.sun.shadow.camera.far = 160
    this.sun.shadow.camera.left = -55
    this.sun.shadow.camera.right = 55
    this.sun.shadow.camera.top = 55
    this.sun.shadow.camera.bottom = -55
    this.sun.shadow.bias = -0.00025
    this.scene.add(this.sun, this.sun.target)

    this.earthshineLight = new THREE.DirectionalLight('#1e4d82', 0)
    this.earthshineLight.position.set(0, -100, 0)
    this.scene.add(this.earthshineLight, this.earthshineLight.target)

    this.starsGroup = new THREE.Group()
    this.starfield = createProceduralStarfield({ count: 14000, radius: 1200, seed: 0x51a7 })
    this.starsGroup.add(this.starfield.points)
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
    this.makeSpace()
    this.makeMoon()
    this.makeRover()
    this.registerMissionScenes()
  }

  private makeHangar(): void {
    // Simplified hangar for launch pad
    const floor = mesh(new THREE.PlaneGeometry(200, 200), mat('#3a2a1a', 0.9, 0.05), V3(0, 0, 0), this.hangar)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
  }

  private makeSpace(): void {
    this.earth = createEarth(EARTH_CENTER)
    this.space.add(this.earth.group)
    this.moonBody = createMoon(EARTH_CENTER)
    this.space.add(this.moonBody.group)
    this.space.add(this.moonBody.orbitLine)
  }

  private makeMoon(): void {
    // Lunar surface placeholder
    const terrain = mesh(new THREE.PlaneGeometry(400, 400, 64, 64), mat('#8a7a6a', 0.95, 0.02), V3(0, 0, 0), this.moon)
    terrain.rotation.x = -Math.PI / 2
    terrain.receiveShadow = true
  }

  private makeRover(): void {
    this.rover = new THREE.Group()
    mesh(new THREE.BoxGeometry(1.8, 0.6, 1.2), mat('#c0c0c0', 0.4, 0.6), V3(0, 0.5, 0), this.rover)
    this.moon.add(this.rover)
    this.rover.visible = false
  }

  update(dt: number, input: Input): void {
    this.elapsed += dt
    this.stageTimer += dt

    // Starfield twinkle
    this.starfield?.update(this.elapsed)

    if (this.stage === 'title' || this.stage === 'countdown') {
      // Pre-launch logic
      if (this.stageTimer >= 10) {
        this.setStage('launch')
      }
      return
    }

    this.sceneMachine.update(dt, input)

    // Visibility of stars
    const altKm = this.ascent ? this.ascent.altitudeKm : 0
    this.starsGroup.visible = altKm > 30 || this.stage !== 'launch'
  }

  private setStage(stage: MissionStage): void {
    this.stage = stage
    this.stageTimer = 0
  }

  private registerMissionScenes(): void {
    // Scene registration placeholder
  }
}

export function createMoonMission(renderer: Renderer): MoonMission {
  return new MoonMission(renderer)
}
