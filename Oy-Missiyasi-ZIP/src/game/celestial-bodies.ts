import * as THREE from 'three'

/**
 * ── CELESTIAL CONFIGURATION & SCALE ───────────────────────────────────────────────────────────────
 * Base Scale Unit: 1 world unit = 1,000 km (0.001 unit = 1 km)
 *
 * Real NASA Astronomical Parameters:
 * - Earth Mean Radius: 6,371.0 km   → 6.371 world units
 * - Earth Diameter:   12,742.0 km   → 12.742 world units
 * - Moon Mean Radius:  1,737.4 km   → 1.7374 world units (Moon is 27.27% Earth's radius)
 * - Moon Diameter:     3,474.8 km   → 3.4748 world units
 * - Earth-Moon Distance: 384,400 km → 384.4 units in 1:1 scale
 *
 * For optimal framing in the 48° camera view while maintaining exact 1:1 planetary scale:
 * - Planetary bodies are rendered at 100% exact real radius ratio (Moon = 0.2727x Earth).
 * - Mean distance is 384.4 units at true scale.
 */
export const CELESTIAL_CONFIG = {
  KM_PER_UNIT: 1000,
  EARTH_RADIUS_KM: 6371.0,
  MOON_RADIUS_KM: 1737.4,
  EARTH_MOON_DISTANCE_KM: 384400,

  // Scaled world units
  EARTH_RADIUS: 6.371,
  MOON_RADIUS: 1.7374,
  EARTH_MOON_DISTANCE: 384.4,

  // Rotation & Orbital Dynamics
  EARTH_SPIN_SPEED: 0.000072921159, // Earth sidereal rotation, rad/s
  CLOUDS_SPIN_SPEED: 0.000084, // Approximate cloud drift, rad/s
  MOON_ORBIT_SPEED: 0.0000026617, // Mean lunar orbital motion, rad/s
}

export interface EarthBody {
  group: THREE.Group
  earthMesh: THREE.Mesh
  cloudsMesh: THREE.Mesh
  atmosphereMesh: THREE.Mesh
  outerHaloMesh: THREE.Mesh
  radius: number
  update: (dt: number) => void
  dispose: () => void
}

export interface MoonBody {
  group: THREE.Group
  moonMesh: THREE.Mesh
  orbitLine: THREE.LineLoop
  radius: number
  orbitRadius: number
  update: (dt: number, earthCenter: THREE.Vector3) => void
  dispose: () => void
}

// ── Procedural Textures ───────────────────────────────────────────────────────────

function createLunarHeightAndNormal(): { bump: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, size, size)

  let seed = 0x6e7a2b
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }

  // Multi-scale realistic craters
  const layers = [
    { count: 14, minR: 48, maxR: 110 },
    { count: 55, minR: 18, maxR: 42 },
    { count: 160, minR: 5, maxR: 16 },
  ]

  for (const layer of layers) {
    for (let i = 0; i < layer.count; i++) {
      const x = rnd() * size
      const y = rnd() * size
      const r = layer.minR + rnd() * (layer.maxR - layer.minR)
      const depth = 0.5 + rnd() * 0.45

      const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
      grad.addColorStop(0, `rgba(22,22,22,${0.72 * depth})`)
      grad.addColorStop(0.5, `rgba(50,50,50,${0.4 * depth})`)
      grad.addColorStop(0.76, `rgba(215,215,215,${0.78 * depth})`)
      grad.addColorStop(0.9, `rgba(145,145,145,${0.28 * depth})`)
      grad.addColorStop(1, 'rgba(128,128,128,0)')

      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()

      if (r > 36 && rnd() > 0.5) {
        const peakR = r * 0.16
        const pg = ctx.createRadialGradient(x, y, 0, x, y, peakR)
        pg.addColorStop(0, 'rgba(195,195,195,0.65)')
        pg.addColorStop(1, 'rgba(128,128,128,0)')
        ctx.fillStyle = pg
        ctx.beginPath()
        ctx.arc(x, y, peakR, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  // Fine regolith noise
  const imgData = ctx.getImageData(0, 0, size, size)
  const d = imgData.data
  for (let p = 0; p < d.length; p += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const n = ((seed / 4294967296) - 0.5) * 16
    const v = Math.min(255, Math.max(0, d[p] + n))
    d[p] = d[p + 1] = d[p + 2] = v
  }
  ctx.putImageData(imgData, 0, 0)

  const bumpTex = new THREE.CanvasTexture(canvas)
  bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping
  bumpTex.repeat.set(3.2, 1.6)
  bumpTex.colorSpace = THREE.NoColorSpace
  bumpTex.anisotropy = 8

  // Generate normal map from height field
  const normalCanvas = document.createElement('canvas')
  normalCanvas.width = size
  normalCanvas.height = size
  const nctx = normalCanvas.getContext('2d')!
  const nd = nctx.createImageData(size, size)
  const strength = 3.2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4
      const h = d[idx] / 255.0

      const hx = d[(y * size + ((x + 1) % size)) * 4] / 255.0 - h
      const hy = d[(((y + 1) % size) * size + x) * 4] / 255.0 - h

      let nx = -hx * strength
      let ny = -hy * strength
      let nz = 1.0
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
      nx /= len; ny /= len; nz /= len

      nd.data[idx]     = Math.floor((nx * 0.5 + 0.5) * 255)
      nd.data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255)
      nd.data[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255)
      nd.data[idx + 3] = 255
    }
  }
  nctx.putImageData(nd, 0, 0)

  const normalTex = new THREE.CanvasTexture(normalCanvas)
  normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping
  normalTex.repeat.set(3.2, 1.6)
  normalTex.colorSpace = THREE.NoColorSpace
  normalTex.anisotropy = 8

  return { bump: bumpTex, normal: normalTex }
}

// ── 1. REALISTIC EARTH BUILDER ─────────────────────────────────────────
export function createEarth(position: THREE.Vector3): EarthBody {
  const group = new THREE.Group()
  group.position.copy(position)

  const radius = CELESTIAL_CONFIG.EARTH_RADIUS // 6.371 units

  // 1A. Earth Solid Sphere — MeshPhysicalMaterial for better ocean sheen + realistic PBR
  const earthMat = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: 0.48,
    metalness: 0.04,
    clearcoat: 0.22,
    clearcoatRoughness: 0.18,
    emissive: new THREE.Color('#ffb080'),
    emissiveIntensity: 0.42,
    ior: 1.45,
    envMapIntensity: 0.65,
  })
  earthMat.fog = false

  const textureLoader = new THREE.TextureLoader()
  const basePath = import.meta.env.BASE_URL

  // Load local Earth day map
  textureLoader.load(`${basePath}textures/earth-daymap.jpg`, tex => {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    earthMat.map = tex
    earthMat.needsUpdate = true
  })

  // Load local Earth night city lights map for night side terminator
  textureLoader.load(`${basePath}textures/earth-nightmap.jpg`, tex => {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    earthMat.emissiveMap = tex
    earthMat.needsUpdate = true
  })

  const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), earthMat)
  earthMesh.castShadow = true
  earthMesh.receiveShadow = true
  earthMesh.renderOrder = 1
  group.add(earthMesh)

  // 1B. Dynamic Cloud Layer (Drifting weather patterns above continents)
  const cloudMat = new THREE.MeshPhysicalMaterial({
    color: '#f4f8ff',
    roughness: 0.92,
    metalness: 0.0,
    clearcoat: 0.08,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.NormalBlending,
    envMapIntensity: 0.35,
  })
  cloudMat.fog = false

  textureLoader.load(`${basePath}textures/earth-clouds.jpg`, tex => {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    cloudMat.alphaMap = tex
    cloudMat.needsUpdate = true
  })

  const cloudsMesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.004, 96, 64), cloudMat)
  cloudsMesh.renderOrder = 2
  group.add(cloudsMesh)

  // 1C. Rayleigh Atmosphere Scattering (Fresnel Cyan-Blue Limb Glow)
  const atmosphereMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        float facing = max(0.0, dot(normal, viewDir));
        float fresnel = pow(1.0 - facing, 2.8);

        // Rayleigh blue scattering + subtle warm sunset fringe
        vec3 blueLimb = vec3(0.22, 0.62, 1.0);
        vec3 sunsetEdge = vec3(0.72, 0.82, 1.0);
        vec3 col = mix(blueLimb, sunsetEdge, fresnel * 0.6);

        float alpha = smoothstep(0.01, 0.78, fresnel) * 0.82;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  })

  const atmosphereMesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.018, 96, 64), atmosphereMat)
  atmosphereMesh.renderOrder = 3
  group.add(atmosphereMesh)

  // 1D. Outer Faint Space Aura
  const outerHaloMat = new THREE.ShaderMaterial({
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
        float intensity = pow(0.62 - dot(vNormal, vec3(0, 0, 1.0)), 3.2);
        intensity = clamp(intensity, 0.0, 1.0);
        gl_FragColor = vec4(0.18, 0.52, 1.0, 1.0) * intensity * 0.88;
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  })

  const outerHaloMesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.042, 64, 48), outerHaloMat)
  outerHaloMesh.renderOrder = 4
  group.add(outerHaloMesh)

  return {
    group,
    earthMesh,
    cloudsMesh,
    atmosphereMesh,
    outerHaloMesh,
    radius,
    update(dt: number) {
      // Slow rotation on axis (24-hour day accelerated for gameplay)
      earthMesh.rotation.y += dt * CELESTIAL_CONFIG.EARTH_SPIN_SPEED
      // Cloud layer drifts slightly faster
      cloudsMesh.rotation.y += dt * CELESTIAL_CONFIG.CLOUDS_SPIN_SPEED
    },
    dispose() {
      earthMat.dispose()
      cloudMat.dispose()
      atmosphereMat.dispose()
      outerHaloMat.dispose()
    },
  }
}

// ── 2. REALISTIC MOON BUILDER ──────────────────────────────────────────
export function createMoon(earthCenter: THREE.Vector3): MoonBody {
  const group = new THREE.Group()

  // Prominent spherical celestial globe (distinct, grand, and detailed)
  const radius = CELESTIAL_CONFIG.MOON_RADIUS * 2.2
  const orbitRadius = CELESTIAL_CONFIG.EARTH_MOON_DISTANCE // 384.4 world units at true scale

  // Initial position along orbit
  group.position.set(earthCenter.x + orbitRadius, earthCenter.y, earthCenter.z)

  // 2A. Lunar Surface Sphere — improved height + normal maps
  const { bump: lunarBumpTex, normal: lunarNormalTex } = createLunarHeightAndNormal()
  const moonMat = new THREE.MeshPhysicalMaterial({
    color: '#d0d0d0',
    roughness: 0.93,
    metalness: 0.012,
    clearcoat: 0.03,
    clearcoatRoughness: 0.55,
    bumpMap: lunarBumpTex,
    bumpScale: 0.014,
    normalMap: lunarNormalTex,
    normalScale: new THREE.Vector2(0.85, 0.85),
    envMapIntensity: 0.2,
    ior: 1.5,
  })
  moonMat.fog = false

  const textureLoader = new THREE.TextureLoader()
  textureLoader.load(`${import.meta.env.BASE_URL}textures/moon-map.jpg`, tex => {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 16
    moonMat.map = tex
    moonMat.color.set('#e8e8e8')
    moonMat.needsUpdate = true
  })

  // Perfect smooth sphere geometry for round ball appearance ("huddi koptokka o'xshagan")
  const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 128, 96), moonMat)
  moonMesh.castShadow = true
  moonMesh.receiveShadow = true
  moonMesh.renderOrder = 1
  group.add(moonMesh)

  // 2B. Inner soft luminous halo — moon glow effect (like real photos over ocean at night)
  const innerGlowMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewPosition = -mvPos.xyz;
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewPosition);
        float rim = pow(1.0 - max(0.0, dot(N, V)), 2.4);
        // Soft blue-white glow at the limb — moonlight scattering effect
        vec3 glowColor = mix(vec3(0.75, 0.84, 1.0), vec3(1.0, 1.0, 1.0), rim * 0.35);
        float alpha = rim * 0.48;
        gl_FragColor = vec4(glowColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  })
  const innerGlowMesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.014, 96, 64), innerGlowMat)
  innerGlowMesh.renderOrder = 2
  group.add(innerGlowMesh)

  // 2C. Outer atmospheric/photon halo — the classic full-moon glow seen from Earth
  const outerGlowMat = new THREE.ShaderMaterial({
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
        // Backside glow — creates halo corona around the visible disc
        float intensity = pow(0.70 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.8);
        intensity = clamp(intensity, 0.0, 1.0);
        // Cool blue-white moonlight color
        vec3 haloColor = vec3(0.65, 0.80, 1.0);
        gl_FragColor = vec4(haloColor, 1.0) * intensity * 0.95;
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  })
  const outerGlowMesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.07, 64, 48), outerGlowMat)
  outerGlowMesh.renderOrder = 3
  group.add(outerGlowMesh)

  // 2D. Far glow sprite — wide soft bloom visible from long distances
  const farGlowMat = new THREE.ShaderMaterial({
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
        float d = dot(vNormal, vec3(0.0, 0.0, 1.0));
        float intensity = pow(clamp(0.58 - d, 0.0, 1.0), 3.0) * 0.55;
        vec3 col = vec3(0.70, 0.82, 1.0);
        gl_FragColor = vec4(col, intensity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  })
  const farGlowMesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.25, 48, 32), farGlowMat)
  farGlowMesh.renderOrder = 4
  group.add(farGlowMesh)

  // 2E. Circular Orbital Path Line around Earth
  const orbitSegments = 128
  const orbitPoints: THREE.Vector3[] = []
  for (let i = 0; i <= orbitSegments; i++) {
    const theta = (i / orbitSegments) * Math.PI * 2
    orbitPoints.push(new THREE.Vector3(
      earthCenter.x + Math.cos(theta) * orbitRadius,
      earthCenter.y,
      earthCenter.z + Math.sin(theta) * orbitRadius,
    ))
  }

  const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPoints)
  const orbitMat = new THREE.LineBasicMaterial({
    color: '#65b2c2',
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    fog: false,
  })
  const orbitLine = new THREE.LineLoop(orbitGeo, orbitMat)
  orbitLine.renderOrder = 1

  let orbitAngle = 0

  return {
    group,
    moonMesh,
    orbitLine,
    radius,
    orbitRadius,
    update(dt: number, currentEarthPos: THREE.Vector3) {
      // 1. Orbital motion around Earth
      orbitAngle += dt * CELESTIAL_CONFIG.MOON_ORBIT_SPEED
      group.position.x = currentEarthPos.x + Math.cos(orbitAngle) * orbitRadius
      group.position.y = currentEarthPos.y
      group.position.z = currentEarthPos.z + Math.sin(orbitAngle) * orbitRadius

      // 2. Tidal Lock: Synchronous rotation so near side always faces Earth!
      const dx = currentEarthPos.x - group.position.x
      const dz = currentEarthPos.z - group.position.z
      const faceEarthAngle = Math.atan2(dx, dz)
      moonMesh.rotation.y = faceEarthAngle
    },
    dispose() {
      moonMat.dispose()
      lunarBumpTex.dispose()
      lunarNormalTex.dispose()
      outerGlowMat.dispose()
      farGlowMat.dispose()
      orbitGeo.dispose()
      orbitMat.dispose()
    },
  }
}
