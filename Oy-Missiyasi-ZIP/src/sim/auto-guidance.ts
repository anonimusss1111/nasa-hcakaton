import { DESCENT_MAX_THRUST_ACCELERATION_MPS2, MOON_SURFACE_GRAVITY_MPS2, type DescentControls, type DescentState } from './descent'

const LATERAL_ACCELERATION_LIMIT_MPS2 = 4.4

/**
 * Autonomous landing guidance with basic Terrain Relative Navigation (TRN)
 * and hazard avoidance concepts.
 */
export function updateAutoLandingGuidance(state: DescentState, controls: DescentControls): void {
  const altitude = Math.max(0, state.altitudeM)

  // Vertical velocity guidance (soft landing curve)
  const desiredVerticalSpeed = -Math.max(0.6, Math.min(8.5, Math.sqrt(2 * MOON_SURFACE_GRAVITY_MPS2 * altitude * 0.55)))
  const verticalError = desiredVerticalSpeed - state.verticalSpeedMps
  const requiredAcceleration = MOON_SURFACE_GRAVITY_MPS2 + verticalError * 1.25
  controls.throttle = clamp(requiredAcceleration / DESCENT_MAX_THRUST_ACCELERATION_MPS2, 0, 1)

  // Horizontal position hold + simple hazard bias
  // (In a full TRN system this would come from lidar / camera hazard map)
  const positionGain = altitude > 40 ? 0.12 : 0.22
  const velocityGain = 1.8

  let lateralX = (-state.xM * positionGain - state.horizontalVelocityXMps * velocityGain)
  let lateralZ = (-state.zM * positionGain - state.horizontalVelocityZMps * velocityGain)

  // Mild hazard avoidance: if near the edge of the safe zone, bias inward
  const distanceFromCenter = Math.hypot(state.xM, state.zM)
  const safeRadius = state.safeZoneRadiusM * 0.75
  if (distanceFromCenter > safeRadius && altitude < 60) {
    const bias = 0.35 * (distanceFromCenter - safeRadius) / safeRadius
    lateralX -= (state.xM / (distanceFromCenter + 0.1)) * bias
    lateralZ -= (state.zM / (distanceFromCenter + 0.1)) * bias
  }

  controls.lateralX = clamp(lateralX / LATERAL_ACCELERATION_LIMIT_MPS2, -1, 1)
  controls.lateralZ = clamp(lateralZ / LATERAL_ACCELERATION_LIMIT_MPS2, -1, 1)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
