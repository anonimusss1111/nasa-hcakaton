import * as THREE from 'three'

/**
 * Procedural deep-space starfield with spectral colors, magnitude distribution,
 * and subtle twinkling. Suitable for transit and space scenes.
 */
export interface StarfieldController {
  points: THREE.Points
  update: (elapsed: number) => void
  dispose: () => void
}

export function createProceduralStarfield(options: {
  count?: number
  radius?: number
  seed?: number
} = {}): StarfieldController {
  const count = options.count ?? 12000
  const radius = options.radius ?? 800
  let seed = options.seed ?? 0x51a7

  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }

  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const phases = new Float32Array(count)

  // Spectral color palette (approximate blackbody)
  const palette = [
    new THREE.Color(0.7, 0.8, 1.0),   // Blue-white
    new THREE.Color(1.0, 1.0, 1.0),   // White
    new THREE.Color(1.0, 0.95, 0.8),  // Yellow-white
    new THREE.Color(1.0, 0.85, 0.6),  // Yellow
    new THREE.Color(1.0, 0.7, 0.4),   // Orange
  ]

  for (let i = 0; i < count; i++) {
    // Uniform distribution on sphere
    const u = rnd()
    const v = rnd()
    const theta = 2 * Math.PI * u
    const phi = Math.acos(2 * v - 1)
    const r = radius * (0.85 + rnd() * 0.15)

    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)

    // Magnitude distribution (most stars faint)
    const mag = Math.pow(rnd(), 2.2)
    const colorIdx = Math.floor(rnd() * palette.length)
    const base = palette[colorIdx]!
    const brightness = 0.25 + mag * 0.75

    colors[i * 3]     = base.r * brightness
    colors[i * 3 + 1] = base.g * brightness
    colors[i * 3 + 2] = base.b * brightness

    // Size variation (few bright stars larger)
    sizes[i] = mag > 0.92 ? 2.8 + rnd() * 1.5 : 0.6 + mag * 1.4
    phases[i] = rnd() * Math.PI * 2
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))

  const material = new THREE.PointsMaterial({
    size: 1.2,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })

  // Twinkling via onBeforeCompile
  const uTime = { value: 0 }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime
    shader.vertexShader = `
      uniform float uTime;
      attribute float aSize;
      attribute float aPhase;
      ${shader.vertexShader}
    `.replace(
      'gl_PointSize = size;',
      `gl_PointSize = size * aSize * (0.75 + 0.25 * sin(uTime * 1.8 + aPhase));`
    )
  }

  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  points.renderOrder = -100

  return {
    points,
    update(elapsed: number) {
      uTime.value = elapsed
    },
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
