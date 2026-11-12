import * as THREE from 'three'

/**
 * ── TRANSLUNAR ASTEROID HAZARDS & AUTOPILOT AUTO-DODGE SYSTEM ───────────────
 * Realistic deep space asteroid encounter along Earth-Moon transit trajectory:
 * 1. 10 3D irregular, tumbling, cratered asteroids drifting in deep space.
 * 2. Automated proximity sensor (detects approaching rock within 36 world units).
 * 3. Proactive lateral evasion maneuver (auto-dodge): smooth banking and RCS thruster
 *    deflection around the obstacle, cleanly preventing any collision.
 * 4. Automatic return to ballistic transit route after hazard clearance.
 * 5. Real-time HUD warning and avoidance status telemetry.
 */

export interface AsteroidObstacle {
  mesh: THREE.Mesh
  basePosition: THREE.Vector3
  radius: number
  rotationAxis: THREE.Vector3
  rotationSpeed: number
  trajectoryProgress: number // Point along the Earth-Moon curve (0.22 to 0.82)
}

export interface TransitHazardController {
  group: THREE.Group
  update: (
    dt: number,
    craftWorldPos: THREE.Vector3,
    transferProgress: number,
    tangent: THREE.Vector3,
  ) => {
    evasionOffset: THREE.Vector3
    isDodging: boolean
    rcsPuff: boolean
    statusMessage?: string
    hazardDistanceKm?: number
  }
  dispose: () => void
}

export function createTransitHazards(trajectoryCurve: THREE.QuadraticBezierCurve3): TransitHazardController {
  const group = new THREE.Group()
  group.name = 'TransitAsteroidField'

  // Irregular rocky asteroid material with bumpiness and sunlight shading
  const asteroidMat = new THREE.MeshStandardMaterial({
    color: '#8b8f94',
    roughness: 0.88,
    metalness: 0.15,
    flatShading: true,
  })

  const obstacles: AsteroidObstacle[] = []
  const ASTEROID_COUNT = 10

  let seed = 0x73a91c
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }

  // Deform a dodecahedron into an authentic organic space asteroid
  function createAsteroidGeometry(radius: number): THREE.BufferGeometry {
    const geo = new THREE.DodecahedronGeometry(radius, 2)
    const pos = geo.attributes.position
    const p = new THREE.Vector3()

    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i)
      const len = p.length()
      // Crater depressions and irregular facet extrusion
      const noise = 1.0 + (rnd() - 0.5) * 0.36 + Math.sin(p.x * 3.0 + p.y * 2.0) * 0.12
      p.setLength(len * noise)
      pos.setXYZ(i, p.x, p.y, p.z)
    }

    geo.computeVertexNormals()
    return geo
  }

  // Distribute asteroids along the translunar arc (progress 0.22 to 0.82)
  for (let i = 0; i < ASTEROID_COUNT; i++) {
    const t = 0.22 + (i / (ASTEROID_COUNT - 1)) * 0.58 + (rnd() - 0.5) * 0.04
    const centerOnCurve = trajectoryCurve.getPoint(t)
    const tangent = trajectoryCurve.getTangent(t).normalize()

    // Normal vector perpendicular to flight tangent
    const up = new THREE.Vector3(0, 1, 0)
    const normal = new THREE.Vector3().crossVectors(tangent, up).normalize()

    // Position asteroid directly in or close to the flight corridor (-4 to +4 lateral units)
    const lateralOffset = (i % 2 === 0 ? 1 : -1) * (1.8 + rnd() * 3.5)
    const verticalOffset = (rnd() - 0.5) * 3.2

    const pos = centerOnCurve.clone()
      .addScaledVector(normal, lateralOffset)
      .add(new THREE.Vector3(0, verticalOffset, 0))

    const radius = 1.4 + rnd() * 2.6
    const geo = createAsteroidGeometry(radius)
    const mesh = new THREE.Mesh(geo, asteroidMat)
    mesh.position.copy(pos)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)

    obstacles.push({
      mesh,
      basePosition: pos.clone(),
      radius,
      rotationAxis: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
      rotationSpeed: 0.15 + rnd() * 0.45,
      trajectoryProgress: t,
    })
  }

  // Dynamic evasion offset smoothed via critically-damped spring
  const evasionOffset = new THREE.Vector3()
  const targetEvasionOffset = new THREE.Vector3()

  return {
    group,

    update(
      dt: number,
      craftWorldPos: THREE.Vector3,
      transferProgress: number,
      tangent: THREE.Vector3,
    ) {
      // 1. Slow tumbling rotation of asteroids in vacuum
      for (const obs of obstacles) {
        obs.mesh.rotateOnAxis(obs.rotationAxis, obs.rotationSpeed * dt)
      }

      // 2. Proximity sensor: find upcoming asteroid along flight path
      let nearestDist = Infinity
      let activeObstacle: AsteroidObstacle | null = null

      for (const obs of obstacles) {
        // Only consider obstacles in front of the craft (up to 0.08 progress ahead)
        const progressDiff = obs.trajectoryProgress - transferProgress
        if (progressDiff > -0.015 && progressDiff < 0.085) {
          const dist = craftWorldPos.distanceTo(obs.mesh.position)
          if (dist < nearestDist) {
            nearestDist = dist
            activeObstacle = obs
          }
        }
      }

      const up = new THREE.Vector3(0, 1, 0)
      const normal = new THREE.Vector3().crossVectors(tangent, up).normalize()
      let isDodging = false
      let rcsPuff = false
      let statusMessage: string | undefined
      let hazardDistanceKm: number | undefined

      // Danger zone: within 32 world units (~32,000 km)
      if (activeObstacle && nearestDist < 32) {
        const hazardKm = Math.round(nearestDist * 1000)
        hazardDistanceKm = hazardKm

        // Determine which side of the craft the obstacle is on
        const toObs = activeObstacle.mesh.position.clone().sub(craftWorldPos)
        const lateralDist = toObs.dot(normal)

        // Steer in the opposite lateral direction with clearance margin
        const dodgeDirection = lateralDist >= 0 ? -1 : 1
        const dodgeMagnitude = Math.max(0, 12 - nearestDist * 0.32)

        targetEvasionOffset.copy(normal).multiplyScalar(dodgeDirection * dodgeMagnitude)
        // Add subtle vertical lift to clear tumbling edges
        targetEvasionOffset.y = Math.sin(transferProgress * 40.0) * 1.8

        isDodging = true
        rcsPuff = Math.random() > 0.4

        statusMessage = `⚠️ ASTEROID XAVFI: ${hazardKm.toLocaleString('uz-UZ')} km masofada. Avtopilot chetlab o‘tish manevrida...`
      } else {
        // Clear: smoothly glide back onto nominal ballistic trajectory
        targetEvasionOffset.set(0, 0, 0)
        if (nearestDist < 55 && activeObstacle) {
          statusMessage = '✅ Asteroid xavfsiz chetlab o‘tildi. Trayektoriya nominal.'
        }
      }

      // Smooth evasion filtering (exponential approach)
      evasionOffset.lerp(targetEvasionOffset, 1 - Math.exp(-dt * 4.5))

      return {
        evasionOffset,
        isDodging,
        rcsPuff,
        statusMessage,
        hazardDistanceKm,
      }
    },

    dispose() {
      for (const obs of obstacles) {
        obs.mesh.geometry.dispose()
      }
      asteroidMat.dispose()
    },
  }
}
