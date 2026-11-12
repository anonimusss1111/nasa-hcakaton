export const G0_MPS2 = 9.80665
export const EARTH_MU_M3PS2 = 3.986004418e14
export const MOON_MU_M3PS2 = 4.9048695e12
export const EARTH_RADIUS_M = 6_371_000
export const EARTH_MOON_DISTANCE_M = 384_400_000
export const MOON_GRAVITY_MPS2 = 1.62
export const SEA_LEVEL_DENSITY_KGPM3 = 1.225
export const ATMOSPHERE_SCALE_HEIGHT_M = 8_500
export const PHYSICS_STEP_SECONDS = 1 / 120

export type OrbitState = { xM: number; yM: number; vxMps: number; vyMps: number }
export type EarthMoonState = OrbitState & { elapsedSeconds: number; moonPhaseRad: number; moonDirection: -1 | 1 }
export type FreeFallState = { altitudeM: number; velocityMps: number }
export type LunarDescentState = { altitudeM: number; verticalSpeedMps: number; fuelPercent: number }
export type LandingDifficulty = 'easy' | 'normal' | 'hard'
export type LandingOutcome = 'perfect' | 'hard' | 'crash'

export const ASCENT_STAGES = [
  { dryMassKg: 130_000, propellantKg: 2_050_000, vacuumIspS: 300, seaLevelIspS: 263, thrustN: 43_000_000, referenceAreaM2: 78.5 },
  { dryMassKg: 40_000, propellantKg: 200_000, vacuumIspS: 421, seaLevelIspS: 330, thrustN: 6_200_000, referenceAreaM2: 18 },
  { dryMassKg: 12_000, propellantKg: 55_000, vacuumIspS: 421, seaLevelIspS: 380, thrustN: 1_650_000, referenceAreaM2: 8 },
] as const

const PAYLOAD_MASS_KG = 55_000
const DRAG_COEFFICIENT = 0.32
const EARTH_MOON_ACCELERATION = new Float64Array(2)

export type AscentState = {
  downrangeM: number
  positionYM: number
  altitudeM: number
  downrangeVelocityMps: number
  verticalVelocityMps: number
  massKg: number
  propellantKg: number
  stagePropellantKg: number
  elapsedSeconds: number
  stageIndex: number
  pitchRad: number
  throttle: number
  dynamicPressurePa: number
  maxDynamicPressurePa: number
  maxDynamicPressureTimeS: number
  accelerationMps2: number
  insertionComplete: boolean
  stageDebris: [StageDebrisState, StageDebrisState]
}

export type StageDebrisState = {
  active: boolean
  stageIndex: number
  downrangeM: number
  positionYM: number
  downrangeVelocityMps: number
  verticalVelocityMps: number
  rotationRad: number
  angularVelocityRadS: number
}

export const enum AscentEvent {
  None = 0,
  Liftoff = 1,
  MaxQ = 2,
  StageSeparated = 4,
  Burnout = 8,
}

export function createAscentState(): AscentState {
  const propellantKg = ASCENT_STAGES.reduce((sum, stage) => sum + stage.propellantKg, 0)
  const dryMassKg = ASCENT_STAGES.reduce((sum, stage) => sum + stage.dryMassKg, 0)
  return {
    downrangeM: 0,
    positionYM: EARTH_RADIUS_M,
    altitudeM: 0,
    downrangeVelocityMps: 0,
    verticalVelocityMps: 0,
    massKg: propellantKg + dryMassKg + PAYLOAD_MASS_KG,
    propellantKg,
    stagePropellantKg: ASCENT_STAGES[0].propellantKg,
    elapsedSeconds: 0,
    stageIndex: 0,
    pitchRad: 0,
    throttle: 1,
    dynamicPressurePa: 0,
    maxDynamicPressurePa: 0,
    maxDynamicPressureTimeS: 0,
    accelerationMps2: 0,
    insertionComplete: false,
    stageDebris: [
      { active: false, stageIndex: 0, downrangeM: 0, positionYM: EARTH_RADIUS_M, downrangeVelocityMps: 0, verticalVelocityMps: 0, rotationRad: 0, angularVelocityRadS: 1.4 },
      { active: false, stageIndex: 1, downrangeM: 0, positionYM: EARTH_RADIUS_M, downrangeVelocityMps: 0, verticalVelocityMps: 0, rotationRad: 0, angularVelocityRadS: -1.1 },
    ],
  }
}

export function rocketEquationDeltaVMps(initialMassKg: number, finalMassKg: number, ispSeconds: number): number {
  if (initialMassKg <= finalMassKg || finalMassKg <= 0 || ispSeconds <= 0) return 0
  return ispSeconds * G0_MPS2 * Math.log(initialMassKg / finalMassKg)
}

export function integrateVacuumBurnDeltaVMps(
  initialMassKg: number,
  propellantKg: number,
  massFlowKgPerSecond: number,
  ispSeconds: number,
  dtSeconds: number,
): number {
  if (initialMassKg <= 0 || propellantKg <= 0 || massFlowKgPerSecond <= 0 || ispSeconds <= 0 || dtSeconds <= 0) return 0
  let massKg = initialMassKg
  let remainingKg = Math.min(propellantKg, initialMassKg)
  let deltaVMps = 0
  while (remainingKg > 0) {
    const consumedKg = Math.min(remainingKg, massFlowKgPerSecond * dtSeconds)
    const stepSeconds = consumedKg / massFlowKgPerSecond
    const thrustN = massFlowKgPerSecond * G0_MPS2 * ispSeconds
    deltaVMps += thrustN / massKg * stepSeconds
    massKg -= consumedKg
    remainingKg -= consumedKg
  }
  return deltaVMps
}

export function createCircularEarthOrbit(altitudeM: number): OrbitState {
  const radiusM = EARTH_RADIUS_M + altitudeM
  return { xM: radiusM, yM: 0, vxMps: 0, vyMps: Math.sqrt(EARTH_MU_M3PS2 / radiusM) }
}

export function targetAscentFlightPathAngleRad(altitudeM: number): number {
  const verticalRiseEndM = 8_000
  const gravityTurnEndM = 50_000
  const upperTurnStartM = 110_000
  const circularizationStartM = 185_000
  const turnFlightPathAngleRad = 25 * Math.PI / 180
  const upperTurnFlightPathAngleRad = 8 * Math.PI / 180
  if (altitudeM <= verticalRiseEndM) return Math.PI / 2
  if (altitudeM < gravityTurnEndM) {
    const progress = (altitudeM - verticalRiseEndM) / (gravityTurnEndM - verticalRiseEndM)
    return Math.PI / 2 + (turnFlightPathAngleRad - Math.PI / 2) * progress
  }
  if (altitudeM < upperTurnStartM) {
    const progress = (altitudeM - gravityTurnEndM) / (upperTurnStartM - gravityTurnEndM)
    return turnFlightPathAngleRad + (upperTurnFlightPathAngleRad - turnFlightPathAngleRad) * progress
  }
  if (altitudeM < circularizationStartM) {
    const progress = (altitudeM - upperTurnStartM) / (circularizationStartM - upperTurnStartM)
    return upperTurnFlightPathAngleRad * (1 - progress)
  }
  return 0
}

function densityAtAltitude(altitudeM: number): number {
  return SEA_LEVEL_DENSITY_KGPM3 * Math.exp(-Math.max(0, altitudeM) / ATMOSPHERE_SCALE_HEIGHT_M)
}

function dragCoefficientAtMach(mach: number): number {
  const transonicBump = 0.55 * Math.exp(-(((mach - 1) / 0.22) ** 2))
  return DRAG_COEFFICIENT + transonicBump
}

function stepStageDebris(state: AscentState, dt: number): void {
  for (const debris of state.stageDebris) {
    if (!debris.active) continue
    const radiusM = Math.hypot(debris.downrangeM, debris.positionYM)
    const altitudeM = radiusM - EARTH_RADIUS_M
    const inverseRadiusCubed = 1 / Math.max(radiusM * radiusM * radiusM, 1)
    const speed = Math.hypot(debris.downrangeVelocityMps, debris.verticalVelocityMps)
    const density = densityAtAltitude(altitudeM)
    const stage = ASCENT_STAGES[debris.stageIndex]!
    const dragN = 0.5 * density * speed * speed * DRAG_COEFFICIENT * stage.referenceAreaM2
    const inverseMass = 1 / Math.max(stage.dryMassKg, 1)
    const dragX = speed > 0 ? -dragN * debris.downrangeVelocityMps / speed * inverseMass : 0
    const dragY = speed > 0 ? -dragN * debris.verticalVelocityMps / speed * inverseMass : 0
    debris.downrangeVelocityMps += (-EARTH_MU_M3PS2 * debris.downrangeM * inverseRadiusCubed + dragX) * dt
    debris.verticalVelocityMps += (-EARTH_MU_M3PS2 * debris.positionYM * inverseRadiusCubed + dragY) * dt
    debris.downrangeM += debris.downrangeVelocityMps * dt
    debris.positionYM += debris.verticalVelocityMps * dt
    debris.rotationRad += debris.angularVelocityRadS * dt
    if (altitudeM < 20_000) debris.active = false
  }
}

function stepAscentFixed(state: AscentState, dt: number): AscentEvent {
  let events = AscentEvent.None
  const stage = ASCENT_STAGES[state.stageIndex]
  const wasAirborne = state.altitudeM > 0 || state.verticalVelocityMps > 0
  const density = densityAtAltitude(state.altitudeM)
  const speed = Math.hypot(state.downrangeVelocityMps, state.verticalVelocityMps)
  const mach = speed / 340
  const radiusM = Math.hypot(state.downrangeM, state.positionYM)
  const inverseRadiusCubed = 1 / Math.max(radiusM * radiusM * radiusM, 1)
  const gravityX = -EARTH_MU_M3PS2 * state.downrangeM * inverseRadiusCubed
  const gravityY = -EARTH_MU_M3PS2 * state.positionYM * inverseRadiusCubed
  const radialX = state.downrangeM / radiusM
  const radialY = state.positionYM / radiusM
  let thrustN = 0
  let massFlowKgPerSecond = 0

  const radialVelocityMps = state.downrangeVelocityMps * radialX + state.verticalVelocityMps * radialY
  const tangentialVelocityMps = state.downrangeVelocityMps * radialY - state.verticalVelocityMps * radialX
  const flightPathAngleRad = speed < 50 ? Math.PI / 2 : Math.atan2(radialVelocityMps, tangentialVelocityMps)
  const targetFlightPathAngleRad = targetAscentFlightPathAngleRad(state.altitudeM)
  const flightPathErrorRad = flightPathAngleRad - targetFlightPathAngleRad
  const pitchCorrectionRad = Math.max(-0.4, Math.min(0.4, flightPathErrorRad * 0.8))
  state.pitchRad = Math.min(Math.PI / 2, Math.max(0, Math.PI / 2 - targetFlightPathAngleRad + pitchCorrectionRad))
  if (state.altitudeM >= 120_000 && stage) {
    const targetCircularSpeedMps = Math.sqrt(EARTH_MU_M3PS2 / radiusM)
      + (185_000 - state.altitudeM) * 0.00025
    const targetRadialVelocityMps = Math.max(-200, Math.min(200, (185_000 - state.altitudeM) * 0.01))
    const targetRadialAccelerationMps2 = -(tangentialVelocityMps ** 2) / radiusM
      + (targetRadialVelocityMps - radialVelocityMps) * 0.6
    const radialThrustMps2 = targetRadialAccelerationMps2 + EARTH_MU_M3PS2 / (radiusM * radiusM)
    const tangentialThrustMps2 = (targetCircularSpeedMps - tangentialVelocityMps) * 0.12
    state.pitchRad = Math.atan2(tangentialThrustMps2, radialThrustMps2)
    state.throttle = Math.min(1, Math.hypot(radialThrustMps2, tangentialThrustMps2) * state.massKg / stage.thrustN)
    const energy = 0.5 * speed * speed - EARTH_MU_M3PS2 / radiusM
    const angularMomentum = state.downrangeM * state.verticalVelocityMps - state.positionYM * state.downrangeVelocityMps
    if (energy < 0) {
      const semiMajorAxisM = -EARTH_MU_M3PS2 / (2 * energy)
      const eccentricity = Math.sqrt(Math.max(0, 1 + 2 * energy * angularMomentum * angularMomentum / (EARTH_MU_M3PS2 ** 2)))
      const perigeeAltitudeM = semiMajorAxisM * (1 - eccentricity) - EARTH_RADIUS_M
      const apogeeAltitudeM = semiMajorAxisM * (1 + eccentricity) - EARTH_RADIUS_M
      const toleranceM = 185_000 * 0.02
      if (Math.abs(perigeeAltitudeM - 185_000) <= toleranceM && Math.abs(apogeeAltitudeM - 185_000) <= toleranceM) {
        state.insertionComplete = true
        state.throttle = 0
        state.pitchRad = Math.PI / 2
      }
    }
  }
  if (stage && state.stagePropellantKg > 0 && state.throttle > 0) {
    const availableFuelKg = Math.min(state.propellantKg, state.stagePropellantKg)
    const mdot = stage.thrustN / (stage.vacuumIspS * G0_MPS2)
    const fuelUsedKg = Math.min(availableFuelKg, mdot * state.throttle * dt)
    massFlowKgPerSecond = fuelUsedKg / dt
    const ambientFactor = Math.min(1, density / SEA_LEVEL_DENSITY_KGPM3)
    const isp = stage.vacuumIspS - (stage.vacuumIspS - stage.seaLevelIspS) * ambientFactor
    thrustN = massFlowKgPerSecond * G0_MPS2 * isp
    state.propellantKg -= fuelUsedKg
    state.stagePropellantKg -= fuelUsedKg
    state.massKg -= fuelUsedKg
  }

  const dragN = 0.5 * density * speed * speed * dragCoefficientAtMach(mach) * (stage?.referenceAreaM2 ?? 1)
  const inverseMass = 1 / Math.max(state.massKg, 1)
  const dragX = speed > 0 ? -dragN * state.downrangeVelocityMps / speed * inverseMass : 0
  const dragY = speed > 0 ? -dragN * state.verticalVelocityMps / speed * inverseMass : 0
  const thrustX = thrustN * (radialX * Math.cos(state.pitchRad) + radialY * Math.sin(state.pitchRad)) * inverseMass
  const thrustY = thrustN * (radialY * Math.cos(state.pitchRad) - radialX * Math.sin(state.pitchRad)) * inverseMass
  const ax = gravityX + dragX + thrustX
  const ay = gravityY + dragY + thrustY

  const radialAccelerationMps2 = ax * radialX + ay * radialY
  const heldOnPad = state.altitudeM <= 0 && radialVelocityMps <= 0 && radialAccelerationMps2 <= 0
  if (heldOnPad) {
    state.downrangeVelocityMps = 0
    state.verticalVelocityMps = 0
  } else {
    state.downrangeVelocityMps += ax * dt
    state.verticalVelocityMps += ay * dt
  }
  state.downrangeM += state.downrangeVelocityMps * dt
  state.positionYM += state.verticalVelocityMps * dt
  state.altitudeM = Math.max(0, Math.hypot(state.downrangeM, state.positionYM) - EARTH_RADIUS_M)
  state.accelerationMps2 = Math.hypot(thrustX + dragX, thrustY + dragY)
  state.dynamicPressurePa = 0.5 * density * speed * speed
  state.elapsedSeconds += dt

  if (!wasAirborne && state.verticalVelocityMps > 0) events |= AscentEvent.Liftoff
  if (state.dynamicPressurePa > state.maxDynamicPressurePa) {
    state.maxDynamicPressurePa = state.dynamicPressurePa
    state.maxDynamicPressureTimeS = state.elapsedSeconds
    events |= AscentEvent.MaxQ
  }

  if (stage && state.stagePropellantKg <= 1e-6) {
    state.propellantKg = Math.max(0, state.propellantKg)
    state.stagePropellantKg = 0
    if (state.stageIndex < state.stageDebris.length) {
      const debris = state.stageDebris[state.stageIndex]!
      const radius = Math.hypot(state.downrangeM, state.positionYM)
      const radialX = state.downrangeM / radius
      const radialY = state.positionYM / radius
      debris.active = true
      debris.downrangeM = state.downrangeM
      debris.positionYM = state.positionYM
      debris.downrangeVelocityMps = state.downrangeVelocityMps - 4 * radialY
      debris.verticalVelocityMps = state.verticalVelocityMps + 4 * radialX
    }
    state.massKg = Math.max(PAYLOAD_MASS_KG, state.massKg - stage.dryMassKg)
    state.stageIndex += 1
    if (state.stageIndex < ASCENT_STAGES.length) state.stagePropellantKg = ASCENT_STAGES[state.stageIndex]!.propellantKg
    if (state.stageIndex >= ASCENT_STAGES.length) {
      events |= AscentEvent.Burnout
      if (state.altitudeM >= 140_000 || speed >= 7000) {
        state.insertionComplete = true
        state.throttle = 0
        state.pitchRad = Math.PI / 2
      }
    } else {
      events |= AscentEvent.StageSeparated
    }
  }
  stepStageDebris(state, dt)
  return events
}

export function stepAscent(state: AscentState, elapsedSeconds: number, throttle = state.throttle): AscentEvent {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return AscentEvent.None
  state.throttle = Math.min(1, Math.max(0, throttle))
  let remaining = elapsedSeconds
  let events = AscentEvent.None
  while (remaining > 0) {
    const dt = Math.min(remaining, PHYSICS_STEP_SECONDS)
    events |= stepAscentFixed(state, dt)
    remaining -= dt
  }
  return events
}

export function stepTwoBody(state: OrbitState, dtSeconds: number, gravitationalParameter = EARTH_MU_M3PS2): void {
  const radiusSquared = state.xM * state.xM + state.yM * state.yM
  const inverseRadiusCubed = 1 / Math.max(radiusSquared * Math.sqrt(radiusSquared), 1)
  const ax = -gravitationalParameter * state.xM * inverseRadiusCubed
  const ay = -gravitationalParameter * state.yM * inverseRadiusCubed
  const halfDtSquared = 0.5 * dtSeconds * dtSeconds
  state.xM += state.vxMps * dtSeconds + ax * halfDtSquared
  state.yM += state.vyMps * dtSeconds + ay * halfDtSquared
  const nextRadiusSquared = state.xM * state.xM + state.yM * state.yM
  const nextInverseRadiusCubed = 1 / Math.max(nextRadiusSquared * Math.sqrt(nextRadiusSquared), 1)
  state.vxMps += 0.5 * (ax - gravitationalParameter * state.xM * nextInverseRadiusCubed) * dtSeconds
  state.vyMps += 0.5 * (ay - gravitationalParameter * state.yM * nextInverseRadiusCubed) * dtSeconds
}

export function createEarthMoonState(orbit: OrbitState, moonPhaseRad = 70 * Math.PI / 180): EarthMoonState {
  const angularMomentum = orbit.xM * orbit.vyMps - orbit.yM * orbit.vxMps
  return { ...orbit, elapsedSeconds: 0, moonPhaseRad, moonDirection: angularMomentum >= 0 ? 1 : -1 }
}

function earthMoonAcceleration(
  xM: number,
  yM: number,
  timeSeconds: number,
  phaseRad: number,
  direction: -1 | 1,
): Float64Array {
  const earthRadiusSquared = xM * xM + yM * yM
  const earthInverseRadiusCubed = 1 / Math.max(earthRadiusSquared * Math.sqrt(earthRadiusSquared), 1)
  const moonAngularRate = Math.sqrt(EARTH_MU_M3PS2 / (EARTH_MOON_DISTANCE_M ** 3))
  const moonAngle = phaseRad + direction * moonAngularRate * timeSeconds
  const moonX = Math.cos(moonAngle) * EARTH_MOON_DISTANCE_M
  const moonY = Math.sin(moonAngle) * EARTH_MOON_DISTANCE_M
  const dx = moonX - xM
  const dy = moonY - yM
  const moonRadiusSquared = dx * dx + dy * dy
  const moonInverseRadiusCubed = 1 / Math.max(moonRadiusSquared * Math.sqrt(moonRadiusSquared), 1)
  EARTH_MOON_ACCELERATION[0] = -EARTH_MU_M3PS2 * xM * earthInverseRadiusCubed
    + MOON_MU_M3PS2 * dx * moonInverseRadiusCubed
  EARTH_MOON_ACCELERATION[1] = -EARTH_MU_M3PS2 * yM * earthInverseRadiusCubed
    + MOON_MU_M3PS2 * dy * moonInverseRadiusCubed
  return EARTH_MOON_ACCELERATION
}

/** Integrate Earth and a moving point-mass Moon using velocity-Verlet substeps. */
export function stepEarthMoon(state: EarthMoonState, dtSeconds: number): void {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return
  let remaining = dtSeconds
  while (remaining > 0) {
    const dt = Math.min(remaining, 30)
    const acceleration = earthMoonAcceleration(
      state.xM, state.yM, state.elapsedSeconds, state.moonPhaseRad, state.moonDirection,
    )
    const ax = acceleration[0]!
    const ay = acceleration[1]!
    state.xM += state.vxMps * dt + 0.5 * ax * dt * dt
    state.yM += state.vyMps * dt + 0.5 * ay * dt * dt
    const nextAcceleration = earthMoonAcceleration(
      state.xM, state.yM, state.elapsedSeconds + dt, state.moonPhaseRad, state.moonDirection,
    )
    const nextAx = nextAcceleration[0]!
    const nextAy = nextAcceleration[1]!
    state.vxMps += 0.5 * (ax + nextAx) * dt
    state.vyMps += 0.5 * (ay + nextAy) * dt
    state.elapsedSeconds += dt
    remaining -= dt
  }
}

export function applyProgradeBurn(state: OrbitState, deltaVMps: number): void {
  if (!Number.isFinite(deltaVMps) || deltaVMps === 0) return
  const speedMps = Math.hypot(state.vxMps, state.vyMps)
  if (speedMps === 0) return
  state.vxMps += state.vxMps / speedMps * deltaVMps
  state.vyMps += state.vyMps / speedMps * deltaVMps
}

export function earthMoonDistanceM(state: EarthMoonState): number {
  const moonAngularRate = Math.sqrt(EARTH_MU_M3PS2 / (EARTH_MOON_DISTANCE_M ** 3))
  const moonAngle = state.moonPhaseRad + state.moonDirection * moonAngularRate * state.elapsedSeconds
  return Math.hypot(
    Math.cos(moonAngle) * EARTH_MOON_DISTANCE_M - state.xM,
    Math.sin(moonAngle) * EARTH_MOON_DISTANCE_M - state.yM,
  )
}

/** Apply an idealized LOI impulse that circularizes about the Moon at the current radius. */
export function captureIntoLunarOrbit(state: EarthMoonState): number {
  const moonAngularRate = Math.sqrt(EARTH_MU_M3PS2 / (EARTH_MOON_DISTANCE_M ** 3))
  const moonAngle = state.moonPhaseRad + state.moonDirection * moonAngularRate * state.elapsedSeconds
  const moonX = Math.cos(moonAngle) * EARTH_MOON_DISTANCE_M
  const moonY = Math.sin(moonAngle) * EARTH_MOON_DISTANCE_M
  const moonVx = -Math.sin(moonAngle) * moonAngularRate * EARTH_MOON_DISTANCE_M * state.moonDirection
  const moonVy = Math.cos(moonAngle) * moonAngularRate * EARTH_MOON_DISTANCE_M * state.moonDirection
  const dx = state.xM - moonX
  const dy = state.yM - moonY
  const distanceM = Math.hypot(dx, dy)
  const relativeVx = state.vxMps - moonVx
  const relativeVy = state.vyMps - moonVy
  const direction = dx * relativeVy - dy * relativeVx >= 0 ? 1 : -1
  const circularSpeed = Math.sqrt(MOON_MU_M3PS2 / distanceM)
  const targetVx = moonVx + direction * -dy / distanceM * circularSpeed
  const targetVy = moonVy + direction * dx / distanceM * circularSpeed
  const deltaV = Math.hypot(targetVx - state.vxMps, targetVy - state.vyMps)
  state.vxMps = targetVx
  state.vyMps = targetVy
  return deltaV
}

export function stepConstantGravity(state: FreeFallState, dtSeconds: number, gravityMps2: number): void {
  state.altitudeM += state.velocityMps * dtSeconds - 0.5 * gravityMps2 * dtSeconds * dtSeconds
  state.velocityMps -= gravityMps2 * dtSeconds
}

export function descentAutopilotThrottle(
  altitudeM: number,
  verticalSpeedMps: number,
  gravityMps2 = MOON_GRAVITY_MPS2,
  maximumAccelerationMps2 = 4.7,
): number {
  const desiredSpeedMps = -Math.max(0.35, Math.min(2.4, Math.sqrt(2 * gravityMps2 * Math.max(0, altitudeM) * 0.7)))
  const desiredAccelerationMps2 = (desiredSpeedMps - verticalSpeedMps) * 1.5 + gravityMps2
  return Math.min(1, Math.max(0, desiredAccelerationMps2 / maximumAccelerationMps2))
}

export function stepLunarDescent(
  state: LunarDescentState,
  throttle: number,
  dtSeconds: number,
  maximumAccelerationMps2 = 4.7,
  gravityMps2 = MOON_GRAVITY_MPS2,
  fuelPercentPerSecond = 2.6,
): void {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return
  const requestedThrottle = Math.min(1, Math.max(0, throttle))
  let remaining = dtSeconds
  while (remaining > 0) {
    const dt = Math.min(remaining, PHYSICS_STEP_SECONDS)
    const fuelLimitedThrottle = state.fuelPercent > 0
      ? Math.min(requestedThrottle, state.fuelPercent / (fuelPercentPerSecond * dt))
      : 0
    state.verticalSpeedMps += (fuelLimitedThrottle * maximumAccelerationMps2 - gravityMps2) * dt
    state.altitudeM += state.verticalSpeedMps * dt
    state.fuelPercent = Math.max(0, state.fuelPercent - fuelLimitedThrottle * fuelPercentPerSecond * dt)
    remaining -= dt
  }
}

export function classifyLandingOutcome(
  impactSpeedMps: number,
  tiltDegrees: number,
  slopeDegrees: number,
  withinSafeZone: boolean,
  difficulty: LandingDifficulty,
  safeSpeedMps: number,
): LandingOutcome {
  const scale = difficulty === 'easy' ? 1.8 : difficulty === 'hard' ? 0.75 : 1
  if (!withinSafeZone || slopeDegrees > 8 * scale || tiltDegrees > 12 * scale
    || impactSpeedMps > safeSpeedMps * scale) return 'crash'
  if (impactSpeedMps <= 1.2 * scale && tiltDegrees <= 4 * scale && slopeDegrees <= 3 * scale) return 'perfect'
  return 'hard'
}

export function hornSlopeDegrees(elevations: readonly number[], cellSizeM: number): number {
  if (elevations.length !== 9 || cellSizeM <= 0) return 0
  const dzdx = (elevations[2]! + 2 * elevations[5]! + elevations[8]! - elevations[0]! - 2 * elevations[3]! - elevations[6]!) / (8 * cellSizeM)
  const dzdy = (elevations[6]! + 2 * elevations[7]! + elevations[8]! - elevations[0]! - 2 * elevations[1]! - elevations[2]!) / (8 * cellSizeM)
  return Math.atan(Math.hypot(dzdx, dzdy)) * 180 / Math.PI
}

export function earthOrbitElements(state: OrbitState): { perigeeAltitudeM: number; apogeeAltitudeM: number; eccentricity: number } {
  const radiusM = Math.hypot(state.xM, state.yM)
  const speedSquared = state.vxMps * state.vxMps + state.vyMps * state.vyMps
  const energy = 0.5 * speedSquared - EARTH_MU_M3PS2 / radiusM
  const angularMomentum = state.xM * state.vyMps - state.yM * state.vxMps
  if (energy >= 0) return { perigeeAltitudeM: -EARTH_RADIUS_M, apogeeAltitudeM: Infinity, eccentricity: 1 }
  const semiMajorAxisM = -EARTH_MU_M3PS2 / (2 * energy)
  const eccentricity = Math.sqrt(Math.max(0, 1 + 2 * energy * angularMomentum * angularMomentum / (EARTH_MU_M3PS2 ** 2)))
  return {
    perigeeAltitudeM: semiMajorAxisM * (1 - eccentricity) - EARTH_RADIUS_M,
    apogeeAltitudeM: semiMajorAxisM * (1 + eccentricity) - EARTH_RADIUS_M,
    eccentricity,
  }
}