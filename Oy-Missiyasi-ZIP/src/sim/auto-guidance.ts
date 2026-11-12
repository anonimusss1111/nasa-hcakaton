import { DESCENT_MAX_THRUST_ACCELERATION_MPS2, MOON_SURFACE_GRAVITY_MPS2, type DescentControls, type DescentState } from './descent'

const LATERAL_ACCELERATION_LIMIT_MPS2 = 4.4

export function updateAutoLandingGuidance(state: DescentState, controls: DescentControls): void {
  const altitude = Math.max(0, state.altitudeM)
  const desiredVerticalSpeed = -Math.max(0.8, Math.min(10, Math.sqrt(2 * MOON_SURFACE_GRAVITY_MPS2 * altitude * 0.62)))
  const verticalError = desiredVerticalSpeed - state.verticalSpeedMps
  const requiredAcceleration = MOON_SURFACE_GRAVITY_MPS2 + verticalError * 1.15
  controls.throttle = clamp(requiredAcceleration / DESCENT_MAX_THRUST_ACCELERATION_MPS2, 0, 1)
  controls.lateralX = clamp(
    (-state.xM * 0.14 - state.horizontalVelocityXMps * 1.65) / LATERAL_ACCELERATION_LIMIT_MPS2,
    -1,
    1,
  )
  controls.lateralZ = clamp(
    (-state.zM * 0.14 - state.horizontalVelocityZMps * 1.65) / LATERAL_ACCELERATION_LIMIT_MPS2,
    -1,
    1,
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
