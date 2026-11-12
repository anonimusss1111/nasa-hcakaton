export const MOON_SURFACE_GRAVITY_MPS2 = 1.62
export const DESCENT_FIXED_STEP_SECONDS = 1 / 120
export const DESCENT_MAX_THRUST_ACCELERATION_MPS2 = 4.8
const FUEL_PERCENT_PER_SECOND = 1.5
const MAX_ATTITUDE_RAD = 0.52
const MAX_LATERAL_ACCELERATION_MPS2 = 4.4

export type DescentOutcome = 'perfect' | 'safe' | 'hard' | 'crash'

export type DescentState = {
  altitudeM: number
  verticalSpeedMps: number
  xM: number
  zM: number
  horizontalVelocityXMps: number
  horizontalVelocityZMps: number
  pitchRad: number
  rollRad: number
  pitchRateRadS: number
  rollRateRadS: number
  fuelPercent: number
  throttle: number
  slopeDegrees: number
  safeZoneRadiusM: number
  landed: boolean
  outcome: DescentOutcome | null
}

export type DescentControls = {
  throttle: number
  lateralX: number
  lateralZ: number
}

export function stepLunarDescent(state: DescentState, elapsedSeconds: number, controls: DescentControls): void {
  if (state.landed || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return
  let remaining = elapsedSeconds
  while (remaining > 0 && !state.landed) {
    const dt = Math.min(remaining, DESCENT_FIXED_STEP_SECONDS)
    stepFixed(state, controls, dt)
    remaining -= dt
  }
}

function stepFixed(state: DescentState, controls: DescentControls, dt: number): void {
  const throttle = state.fuelPercent > 0
    ? Math.max(0, Math.min(1, controls.throttle))
    : 0
  const lateralX = Math.max(-1, Math.min(1, controls.lateralX))
  const lateralZ = Math.max(-1, Math.min(1, controls.lateralZ))
  state.throttle = throttle

  const targetPitch = Math.max(-MAX_ATTITUDE_RAD, Math.min(MAX_ATTITUDE_RAD, -lateralX * 0.12))
  const targetRoll = Math.max(-MAX_ATTITUDE_RAD, Math.min(MAX_ATTITUDE_RAD, lateralZ * 0.12))
  state.pitchRateRadS += (targetPitch - state.pitchRad) * 3.2 * dt - state.pitchRateRadS * 1.9 * dt
  state.rollRateRadS += (targetRoll - state.rollRad) * 3.2 * dt - state.rollRateRadS * 1.9 * dt
  state.pitchRad = Math.max(-MAX_ATTITUDE_RAD, Math.min(MAX_ATTITUDE_RAD, state.pitchRad + state.pitchRateRadS * dt))
  state.rollRad = Math.max(-MAX_ATTITUDE_RAD, Math.min(MAX_ATTITUDE_RAD, state.rollRad + state.rollRateRadS * dt))

  const verticalAcceleration = throttle * DESCENT_MAX_THRUST_ACCELERATION_MPS2 - MOON_SURFACE_GRAVITY_MPS2
  state.verticalSpeedMps += verticalAcceleration * dt
  state.altitudeM += state.verticalSpeedMps * dt
  state.horizontalVelocityXMps += (lateralX * MAX_LATERAL_ACCELERATION_MPS2 - state.horizontalVelocityXMps * 0.22) * dt
  state.horizontalVelocityZMps += (lateralZ * MAX_LATERAL_ACCELERATION_MPS2 - state.horizontalVelocityZMps * 0.22) * dt
  state.xM += state.horizontalVelocityXMps * dt
  state.zM += state.horizontalVelocityZMps * dt
  state.fuelPercent = Math.max(0, state.fuelPercent - throttle * FUEL_PERCENT_PER_SECOND * dt)

  if (state.altitudeM <= 0) {
    state.altitudeM = 0
    state.landed = true
    state.outcome = touchdownOutcome(state)
  }
}

function touchdownOutcome(state: DescentState): DescentOutcome {
  const verticalSpeed = Math.abs(state.verticalSpeedMps)
  const horizontalSpeed = Math.hypot(state.horizontalVelocityXMps, state.horizontalVelocityZMps)
  const totalSpeed = Math.hypot(verticalSpeed, horizontalSpeed)
  const tiltDegrees = Math.hypot(state.pitchRad, state.rollRad) * 180 / Math.PI
  const offset = Math.hypot(state.xM, state.zM)
  const withinSafeZone = offset <= state.safeZoneRadiusM
  if (totalSpeed <= 1.5 && tiltDegrees <= 3 && state.slopeDegrees <= 8 && offset <= state.safeZoneRadiusM * 0.6) {
    return 'perfect'
  }
  if (totalSpeed <= 4.5 && tiltDegrees <= 12 && state.slopeDegrees <= 18 && withinSafeZone) return 'safe'
  if (totalSpeed <= 8 && tiltDegrees <= 20 && offset <= state.safeZoneRadiusM * 2) return 'hard'
  return 'crash'
}
