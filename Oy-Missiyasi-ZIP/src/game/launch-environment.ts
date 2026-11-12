import * as THREE from 'three'

export interface LaunchEnvironment {
  group: THREE.Group
  waterRings: THREE.Mesh[]
  update: (dt: number, elapsed: number, camera?: THREE.Camera) => void
  setAltitudeKm: (altitudeKm: number) => void
  dispose: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function V3(x = 0, y = 0, z = 0): THREE.Vector3 {
  return new THREE.Vector3(x, y, z)
}

function mat(color: string, roughness = 0.6, metalness = 0.2): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness })
}

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position = V3(),
  parent?: THREE.Group,
  castShadow = true,
  receiveShadow = true,
): THREE.Mesh {
  const item = new THREE.Mesh(geometry, material)
  item.position.copy(position)
  item.castShadow = castShadow
  item.receiveShadow = receiveShadow
  if (parent) parent.add(item)
  return item
}

function box(
  parent: THREE.Group,
  size: [number, number, number],
  pos: [number, number, number],
  material: THREE.Material,
  castShadow = true,
): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(...size), material, V3(...pos), parent, castShadow)
}

// ── Procedural Canvas Textures ───────────────────────────────────────────────
function createConcretePadTexture(): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Weathered aerospace reinforced concrete
  ctx.fillStyle = '#687077'
  ctx.fillRect(0, 0, size, size)

  // Concrete slabs expansion grid
  ctx.strokeStyle = '#43494f'
  ctx.lineWidth = 2.5
  const step = size / 8
  for (let i = 0; i <= size; i += step) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke()
  }

  // Circular blast deck hazard ring (NASA/ESA style safety border)
  ctx.save()
  ctx.translate(size / 2, size / 2)
  const padRadius = size * 0.38
  ctx.lineWidth = 16
  ctx.strokeStyle = '#22252a'
  ctx.beginPath()
  ctx.arc(0, 0, padRadius, 0, Math.PI * 2)
  ctx.stroke()

  // Radial hazard hash marks (safety yellow & dark anthracite)
  const numStripes = 36
  for (let i = 0; i < numStripes; i++) {
    const angle = (i / numStripes) * Math.PI * 2
    ctx.save()
    ctx.rotate(angle)
    ctx.fillStyle = i % 2 === 0 ? '#e5a828' : '#22252a'
    ctx.fillRect(-padRadius - 8, -5, 16, 10)
    ctx.restore()
  }

  // Heavy rocket blast scorch & refractory soot gradient at center
  const scorch = ctx.createRadialGradient(0, 0, 8, 0, 0, padRadius * 0.72)
  scorch.addColorStop(0, 'rgba(25, 27, 29, 0.95)')
  scorch.addColorStop(0.35, 'rgba(42, 45, 48, 0.72)')
  scorch.addColorStop(0.7, 'rgba(75, 82, 88, 0.32)')
  scorch.addColorStop(1, 'rgba(104, 112, 119, 0)')
  ctx.fillStyle = scorch
  ctx.beginPath()
  ctx.arc(0, 0, padRadius * 0.72, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Fine concrete aggregate grain noise
  const imgData = ctx.getImageData(0, 0, size, size)
  const d = imgData.data
  let seed = 0x24a8f
  for (let i = 0; i < d.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const n = ((seed / 4294967296) - 0.5) * 28
    d[i] = Math.min(255, Math.max(0, d[i] + n))
    d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n))
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n))
  }
  ctx.putImageData(imgData, 0, 0)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
  return texture
}

function createTerrainTexture(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const bCanvas = document.createElement('canvas')
  bCanvas.width = size
  bCanvas.height = size
  const bCtx = bCanvas.getContext('2d')!
  const colorData = ctx.createImageData(size, size)
  const bumpData = bCtx.createImageData(size, size)
  let seed = 0x51c9d
  for (let i = 0; i < colorData.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const pixel = i / 4
    const x = pixel % size
    const y = Math.floor(pixel / size)

    // Multi-frequency sand dune waves & soil stratification
    const broad = Math.sin(x * 0.018 + Math.sin(y * 0.012) * 2.0) * 0.55
      + Math.cos(y * 0.022 - x * 0.010) * 0.35
    const midDune = Math.sin(x * 0.045 + y * 0.038) * 0.25
    const grit = (seed / 4294967296 - 0.5) * 24

    // Scrub vegetation / dry coastal steppe moss specks
    const scrubNoise = Math.sin(x * 0.08 - y * 0.07) * Math.cos(x * 0.06 + y * 0.09)
    const isScrub = scrubNoise > 0.62

    let r = 168 + broad * 18 + midDune * 14 + grit
    let g = 136 + broad * 15 + midDune * 11 + grit * 0.8
    let b = 104 + broad * 12 + midDune * 8 + grit * 0.6

    if (isScrub) {
      r = THREE.MathUtils.lerp(r, 118, 0.45)
      g = THREE.MathUtils.lerp(g, 128, 0.45)
      b = THREE.MathUtils.lerp(b, 94, 0.45)
    }

    colorData.data[i] = THREE.MathUtils.clamp(r, 0, 255)
    colorData.data[i + 1] = THREE.MathUtils.clamp(g, 0, 255)
    colorData.data[i + 2] = THREE.MathUtils.clamp(b, 0, 255)
    colorData.data[i + 3] = 255

    const relief = 128 + broad * 36 + midDune * 18 + grit * 0.8
    bumpData.data[i] = relief
    bumpData.data[i + 1] = relief
    bumpData.data[i + 2] = relief
    bumpData.data[i + 3] = 255
  }
  ctx.putImageData(colorData, 0, 0)
  bCtx.putImageData(bumpData, 0, 0)

  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.repeat.set(20, 20)

  const bump = new THREE.CanvasTexture(bCanvas)
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping
  bump.repeat.set(20, 20)

  return { map, bump }
}

function createSteamPuffTexture(): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const cx = size / 2
  const cy = size / 2
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2)
  grad.addColorStop(0, 'rgba(242, 248, 255, 0.55)')
  grad.addColorStop(0.3, 'rgba(230, 242, 255, 0.32)')
  grad.addColorStop(0.65, 'rgba(215, 232, 250, 0.12)')
  grad.addColorStop(1, 'rgba(200, 220, 245, 0.0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function createHexMirrorTexture(): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Deep indigo/navy optical substrate coating
  ctx.fillStyle = '#061324'
  ctx.fillRect(0, 0, size, size)

  // Hexagonal segment lines resembling the ELT 798-segment primary mirror (M1)
  ctx.strokeStyle = 'rgba(75, 155, 235, 0.45)'
  ctx.lineWidth = 1.6
  const hexRadius = 16
  const hexHeight = hexRadius * Math.sqrt(3)
  for (let y = -hexHeight; y < size + hexHeight * 2; y += hexHeight) {
    for (let x = -hexRadius * 2; x < size + hexRadius * 3; x += hexRadius * 3) {
      drawHexagon(ctx, x, y, hexRadius)
      drawHexagon(ctx, x + hexRadius * 1.5, y + hexHeight / 2, hexRadius)
    }
  }

  // Specular celestial glare highlight
  const grad = ctx.createRadialGradient(size / 2, size / 2, 8, size / 2, size / 2, size * 0.46)
  grad.addColorStop(0, 'rgba(140, 215, 255, 0.55)')
  grad.addColorStop(0.35, 'rgba(65, 130, 210, 0.28)')
  grad.addColorStop(0.75, 'rgba(20, 50, 95, 0.12)')
  grad.addColorStop(1, 'rgba(6, 19, 36, 0.0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function drawHexagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3
    const x = cx + r * Math.cos(angle)
    const y = cy + r * Math.sin(angle)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.stroke()
}

function createPanoramicMountainRidge(
  innerRadius: number,
  outerRadius: number,
  radialSegments: number,
  crossSegments: number,
  heightScale: number,
  seed: number,
): THREE.BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []

  const spanCount = crossSegments + 1

  for (let rIdx = 0; rIdx <= radialSegments; rIdx++) {
    const angle = (rIdx / radialSegments) * Math.PI * 2
    // Multi-octave natural mountain peak elevation profile
    const h1 = Math.sin(angle * 3.0 + seed * 1.7) * 0.32
    const h2 = Math.cos(angle * 7.0 - seed * 2.1) * 0.22
    const h3 = Math.sin(angle * 13.0 + seed * 0.8) * 0.14
    const h4 = Math.cos(angle * 27.0 - seed * 3.4) * 0.08
    const h5 = Math.sin(angle * 53.0 + seed * 1.1) * 0.04
    // Natural broad valley passes
    const pass = Math.pow(Math.sin(angle * 1.5 + seed * 0.4) * 0.5 + 0.5, 0.9) * 0.72 + 0.28
    const peakHeight = Math.max(8.0, (0.44 + h1 + h2 + h3 + h4 + h5) * heightScale * pass)

    // Ragged, natural mountain crest radius line
    const peakRadius = innerRadius + (outerRadius - innerRadius) * 0.52
      + Math.sin(angle * 5.0 - seed) * 16.0
      + Math.cos(angle * 11.0 + seed) * 9.0

    for (let cIdx = 0; cIdx <= crossSegments; cIdx++) {
      const t = cIdx / crossSegments
      let radius: number
      let y: number

      if (t <= 0.5) {
        // Inner slope (foothills to mountain peak)
        const s = t / 0.5
        radius = THREE.MathUtils.lerp(innerRadius, peakRadius, s)
        const x = Math.cos(angle) * radius
        const z = Math.sin(angle) * radius
        const baseH = launchTerrainHeight(x, z)
        // Natural concave scree slope & craggy rock ridges
        const crag = (Math.sin(angle * 43.0 + s * 14.0) * 0.04 + Math.cos(angle * 21.0) * 0.06) * peakHeight
        y = THREE.MathUtils.lerp(baseH, peakHeight, Math.pow(s, 1.42)) + crag * s
      } else {
        // Outer slope (crest down to perimeter)
        const s = (t - 0.5) / 0.5
        radius = THREE.MathUtils.lerp(peakRadius, outerRadius, s)
        const falloff = 1.0 - Math.pow(s, 0.85)
        y = peakHeight * falloff * 0.85
      }

      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
    }
  }

  for (let rIdx = 0; rIdx < radialSegments; rIdx++) {
    for (let cIdx = 0; cIdx < crossSegments; cIdx++) {
      const a = rIdx * spanCount + cIdx
      const b = a + spanCount
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function launchTerrainHeight(x: number, z: number): number {
  const distance = Math.hypot(x, z)
  if (distance <= 28) return 0
  const blend = Math.min(1, (distance - 28) / 50)
  return (
    Math.sin(x * 0.028) * Math.cos(z * 0.024) * 2.8
    + Math.sin((x + z) * 0.048) * 1.5
    + Math.cos(x * 0.012 - z * 0.016) * 3.2
    + Math.sin(x * 0.09 + z * 0.07) * 0.55
    + Math.cos(z * 0.14 - x * 0.11) * 0.25
  ) * blend
}

// ── Launch Environment Builder ───────────────────────────────────────────────
export function createLaunchEnvironment(_scene?: THREE.Scene): LaunchEnvironment {
  const group = new THREE.Group()
  const waterRings: THREE.Mesh[] = []
  const beacons: THREE.Mesh[] = []
  const generatedGeometries: THREE.BufferGeometry[] = []
  const cloudMeshes: { mesh: THREE.Mesh; speedX: number; speedZ: number; bound: number }[] = []
  const hexMirrorTex = createHexMirrorTexture()
  const rotatingObservatoryDomes: {
    pivot: THREE.Group
    baseAzimuth: number
    trackSpeed: number
    phaseOffset: number
  }[] = []

  // 1. SKY: Dramatic Dawn/Sunrise Gradient Sky Dome with Stars & Glow
  const skyAltitude = { value: 0 }
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { uAltitudeKm: skyAltitude },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uAltitudeKm;
      varying vec3 vWorldPosition;
      void main() {
        vec3 dir = normalize(vWorldPosition - cameraPosition);
        float y = dir.y;

        // Rich twilight dawn gradient
        vec3 zenith   = vec3(0.025, 0.065, 0.15); // Deep twilight indigo
        vec3 upper    = vec3(0.11, 0.15, 0.30);  // Twilight blue-violet
        vec3 midSky   = vec3(0.46, 0.20, 0.24);  // Dusty rose/crimson
        vec3 horizon  = vec3(0.78, 0.36, 0.19);  // Fiery apricot-orange
        vec3 hazeGlow = vec3(0.82, 0.53, 0.30);  // Golden sunrise horizon glow
        vec3 ground   = vec3(0.18, 0.14, 0.16);  // Ground baseline

        vec3 col;
        if (y > 0.0) {
          float t1 = smoothstep(0.0, 0.07, y);
          float t2 = smoothstep(0.05, 0.24, y);
          float t3 = smoothstep(0.20, 0.85, y);

          col = mix(hazeGlow, horizon, t1);
          col = mix(col, midSky, t2);
          col = mix(col, upper, t3);
          col = mix(col, zenith, smoothstep(0.7, 1.0, y));
        } else {
          col = mix(ground, hazeGlow, smoothstep(-0.2, 0.0, y));
        }

        // Low morning Sun Disc & radiant atmospheric glare
        vec3 sunDir = normalize(vec3(-0.68, 0.20, -0.71));
        float sunDot = max(0.0, dot(dir, sunDir));
        float sunDisc = smoothstep(0.99994, 0.999985, sunDot);
        float sunCorona = pow(sunDot, 72.0) * 0.35;
        float sunAura = pow(sunDot, 20.0) * 0.18;

        vec3 sunColor = vec3(1.0, 0.92, 0.78) * sunDisc * 2.2
                      + vec3(1.0, 0.70, 0.38) * sunCorona
                      + vec3(0.95, 0.50, 0.28) * sunAura;

        float spaceBlend = smoothstep(6.0, 22.0, uAltitudeKm);
        col = mix(col, vec3(0.0015, 0.003, 0.009), spaceBlend);
        col += sunColor * (1.0 - spaceBlend * 0.72);

        // Pinpoint stars in the upper stratosphere before deep-space starfield takes over (> 30 km)
        float starVisibility = smoothstep(12.0, 26.0, uAltitudeKm) * (1.0 - smoothstep(29.0, 36.0, uAltitudeKm));
        if (y > 0.32 && starVisibility > 0.0) {
          vec3 grid = dir * 260.0;
          vec3 p = floor(grid);
          vec3 f = fract(grid) - 0.5;
          float starVal = fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
          if (starVal > 0.993) {
            float brightness = (starVal - 0.993) / 0.007;
            float dotShape = smoothstep(0.28, 0.05, length(f));
            col += vec3(0.88, 0.94, 1.0) * brightness * dotShape * smoothstep(0.32, 0.72, y) * starVisibility * 0.75;
          }
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  })
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(680, 40, 24), skyMat)
  skyDome.scale.setScalar(1_000)
  skyDome.renderOrder = -1
  group.add(skyDome)

  // 2. BULUTLAR: Atmospheric clouds are handled by TroposphereCloudSystem at realistic altitudes (1.8km - 4km)
  const cloudShaderMat = new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0 },
    },
    vertexShader: `void main() { gl_Position = vec4(0.0); }`,
    fragmentShader: `void main() { discard; }`,
  })

  // 3. YER (ZAMIN): Realistic Concrete Launch Pad, Surrounding Coastal/Desert Terrain & Distant Mountains
  const concreteTex = createConcretePadTexture()
  const { map: terrainMap, bump: terrainBump } = createTerrainTexture()

  // Heavy elevated concrete launch berm / mount
  const bermMat = new THREE.MeshStandardMaterial({
    map: concreteTex,
    roughness: 0.82,
    metalness: 0.18,
  })
  // Main octagonal/circular platform (height 0.45, centered at y = -0.05, top surface at y = 0.175)
  mesh(new THREE.CylinderGeometry(15, 17, 0.45, 36), bermMat, V3(0, -0.05, 0), group)

  // Chamfered concrete ramp leading from crawlerway to pad
  const rampMat = mat('#525a62', 0.85, 0.15)
  const padRamp = box(group, [10, 0.35, 18], [0, -0.02, 20], rampMat)
  padRamp.rotation.x = -0.025

  // Central launch table & flame deflector ring (top at y = 0.25)
  mesh(new THREE.CylinderGeometry(6.2, 6.45, 0.28, 48), mat('#5a636a', 0.78, 0.25), V3(0, 0.1, 0), group)

  // Deep Flame Trench (Recessed blast pit underneath the rocket table)
  const trenchPitMat = mat('#1c1e22', 0.95, 0.05)
  box(group, [5.2, 1.4, 13], [0, -0.5, -2], trenchPitMat, false)

  // Flame deflector wedge (diverting rocket exhaust)
  const deflectorMat = mat('#32373e', 0.65, 0.45)
  const deflector = mesh(new THREE.ConeGeometry(3.6, 1.8, 4), deflectorMat, V3(0, 0.05, -2.5), group)
  deflector.rotation.y = Math.PI / 4

  // Safety Hazard Rings & Guidance Rings
  const padRing = mesh(new THREE.TorusGeometry(5.4, 0.07, 8, 72), mat('#d8a93a', 0.45, 0.4), V3(0, 0.26, 0), group, false)
  padRing.rotation.x = Math.PI / 2
  const innerRing = mesh(new THREE.TorusGeometry(4.2, 0.038, 6, 64), mat('#8da1a8', 0.7, 0.25), V3(0, 0.27, 0), group, false)
  innerRing.rotation.x = Math.PI / 2

  // Deluge water sound suppression rings (retained for launch sequence)
  for (const [radius, tube] of [[2.3, 0.12], [3.1, 0.08], [4, 0.045]]) {
    const waterRing = mesh(
      new THREE.TorusGeometry(radius, tube, 8, 64),
      new THREE.MeshBasicMaterial({ color: '#b8f5ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
      V3(0, 0.34, 0),
      group,
      false,
    )
    waterRing.rotation.x = Math.PI / 2
    waterRing.visible = false
    waterRings.push(waterRing)
  }

  // Large Undulating Terrain (Natural desert & coastal spaceport ground)
  const terrainGeo = new THREE.PlaneGeometry(840, 840, 140, 140)
  generatedGeometries.push(terrainGeo)
  const pos = terrainGeo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    pos.setZ(i, launchTerrainHeight(x, y))
  }
  terrainGeo.rotateX(-Math.PI / 2)
  terrainGeo.computeVertexNormals()

  const terrainMaterial = new THREE.MeshStandardMaterial({
    map: terrainMap,
    bumpMap: terrainBump,
    bumpScale: 0.28,
    roughness: 0.92,
    metalness: 0.05,
  })
  mesh(terrainGeo, terrainMaterial, V3(0, -0.22, 0), group, false, true)

  // 3B. Majestic Panoramic Horizon Mountain Ranges (Replacing primitive cones)
  // Layer 1: Primary Mountain Range with crags, gullies and ridges
  const mountainGeo1 = createPanoramicMountainRidge(260, 460, 160, 16, 68, 1)
  generatedGeometries.push(mountainGeo1)
  const mountainMat1 = new THREE.MeshStandardMaterial({
    color: '#7e614d',
    emissive: '#2c1e16',
    emissiveIntensity: 0.28,
    roughness: 0.94,
    metalness: 0.06,
  })
  mesh(mountainGeo1, mountainMat1, V3(0, -0.22, 0), group, false, false)

  // Layer 2: Distant Alpine Horizon Range (Towering background silhouette)
  const mountainGeo2 = createPanoramicMountainRidge(480, 680, 120, 12, 118, 7)
  generatedGeometries.push(mountainGeo2)
  const mountainMat2 = new THREE.MeshStandardMaterial({
    color: '#8e6c55',
    emissive: '#362118',
    emissiveIntensity: 0.35,
    roughness: 0.96,
    metalness: 0.04,
  })
  mesh(mountainGeo2, mountainMat2, V3(0, -0.22, 0), group, false, false)

  // 3C. Desert Boulders & Coastal Scrub Clusters
  const rockGeometry = new THREE.DodecahedronGeometry(1, 0)
  generatedGeometries.push(rockGeometry)
  const rockMaterial = new THREE.MeshStandardMaterial({ color: '#8f7762', roughness: 0.95, metalness: 0.05 })
  const rockCount = 140
  const rockScatter = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockCount)
  rockScatter.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  const rockMatrix = new THREE.Matrix4()
  const rockPosition = new THREE.Vector3()
  const rockScale = new THREE.Vector3()
  const rockRotation = new THREE.Quaternion()
  const rockColor = new THREE.Color()
  let rockSeed = 0x7a11ce
  const randomRock = () => {
    rockSeed = (rockSeed * 1664525 + 1013904223) >>> 0
    return rockSeed / 4294967296
  }
  for (let index = 0; index < rockCount; index += 1) {
    const angle = randomRock() * Math.PI * 2
    const radius = 38 + randomRock() * 220
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    const size = 0.6 + randomRock() * 1.8
    rockPosition.set(x, -0.22 + launchTerrainHeight(x, -z) + size * 0.28, z)
    rockScale.set(size * (0.8 + randomRock() * 0.6), size * (0.35 + randomRock() * 0.45), size * (0.7 + randomRock() * 0.6))
    rockRotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, randomRock() * Math.PI * 2)
    rockMatrix.compose(rockPosition, rockRotation, rockScale)
    rockScatter.setMatrixAt(index, rockMatrix)
    rockColor.setHSL(0.08 + randomRock() * 0.035, 0.18 + randomRock() * 0.12, 0.32 + randomRock() * 0.18)
    rockScatter.setColorAt(index, rockColor)
  }
  group.add(rockScatter)

  // Desert scrub & coastal sawgrass clumps
  const scrubCount = 80
  const scrubScatter = new THREE.InstancedMesh(rockGeometry, new THREE.MeshStandardMaterial({ color: '#526140', roughness: 0.96, metalness: 0.02 }), scrubCount)
  scrubScatter.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  for (let sIdx = 0; sIdx < scrubCount; sIdx++) {
    const angle = randomRock() * Math.PI * 2
    const radius = 32 + randomRock() * 190
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    const sz = 0.5 + randomRock() * 0.8
    rockPosition.set(x, -0.22 + launchTerrainHeight(x, -z) + sz * 0.3, z)
    rockScale.set(sz * 1.4, sz * 0.45, sz * 1.3)
    rockRotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, randomRock() * Math.PI * 2)
    rockMatrix.compose(rockPosition, rockRotation, rockScale)
    scrubScatter.setMatrixAt(sIdx, rockMatrix)
  }
  group.add(scrubScatter)

  // 4. ATROF-MUHIT: Realistic Cosmodrome Infrastructure (Floodlight Towers, Propellant Tanks, Hangar Facility, Antenna)
  const steelMat = mat('#697682', 0.55, 0.5)
  const steelDark = mat('#434e56', 0.7, 0.35)
  const whiteInsulated = mat('#e8ecef', 0.45, 0.15)
  const hazardChevronMat = mat('#e5a828', 0.45, 0.3)
  const beaconMat = new THREE.MeshBasicMaterial({ color: '#ff2222' })

  // 4A. 4 High-tech Floodlight / Lightning Mast Towers around Pad
  const towerPositions = [
    [-24, -22],
    [24, -22],
    [-24, 24],
    [24, 24],
  ]

  for (const [tx, tz] of towerPositions) {
    const lightTower = new THREE.Group()
    lightTower.position.set(tx, 0, tz)
    group.add(lightTower)

    // 4 Corner vertical steel legs
    const towerH = 24
    const legSpread = 2.2
    for (const lx of [-legSpread / 2, legSpread / 2]) {
      for (const lz of [-legSpread / 2, legSpread / 2]) {
        box(lightTower, [0.24, towerH, 0.24], [lx, towerH / 2, lz], steelMat)
      }
    }

    // Cross brace tiers
    for (let y = 3; y <= towerH; y += 3.5) {
      box(lightTower, [legSpread, 0.14, 0.14], [0, y, -legSpread / 2], steelDark)
      box(lightTower, [legSpread, 0.14, 0.14], [0, y, legSpread / 2], steelDark)
      box(lightTower, [0.14, 0.14, legSpread], [-legSpread / 2, y, 0], steelDark)
      box(lightTower, [0.14, 0.14, legSpread], [legSpread / 2, y, 0], steelDark)
    }

    // Overhead service platform & floodlight bank
    box(lightTower, [legSpread + 1.2, 0.22, legSpread + 1.2], [0, towerH, 0], steelDark)
    // Lightning arrestor needle tip
    box(lightTower, [0.08, 3.2, 0.08], [0, towerH + 1.6, 0], steelMat)

    // Red flashing aviation warning beacon
    const beacon = mesh(new THREE.SphereGeometry(0.24, 12, 8), beaconMat, V3(0, towerH + 3.2, 0), lightTower, false, false)
    beacons.push(beacon)

    // High-intensity LED spotlight angled towards rocket launch pad
    const spot = new THREE.SpotLight('#fff2d4', 24, 65, Math.PI / 4, 0.45, 1.2)
    spot.position.set(0, towerH - 0.5, 0)
    spot.target.position.set(-tx * 0.85, 6, -tz * 0.85)
    lightTower.add(spot)
    lightTower.add(spot.target)

    // Subtle floodlight flare glow
    mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff5e0' }), V3(0, towerH - 0.2, 0), lightTower, false, false)
  }

  // 4A-1. Pad Surface Aerospace Uplights (Dramatic rocket illumination from below)
  const upSpots = [
    [-7.5, 0.3, 7.5],
    [7.5, 0.3, 7.5],
    [-7.5, 0.3, -7.5],
    [7.5, 0.3, -7.5],
  ]
  for (const [gx, gy, gz] of upSpots) {
    box(group, [0.7, 0.5, 0.7], [gx, gy, gz], steelDark)
    const upLight = new THREE.SpotLight('#fff5e0', 16, 42, Math.PI / 5, 0.45, 1.2)
    upLight.position.set(gx, gy + 0.4, gz)
    upLight.target.position.set(0, 11, 0)
    group.add(upLight)
    group.add(upLight.target)
    mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff8ea' }), V3(gx, gy + 0.4, gz), group, false, false)
  }

  // 4B. Twin ESO ELT Astronomical Observatories (Extremely Large Telescope Complex)
  // Replaces propellant storage spheres with photorealistic lunar/deep-space tracking observatories matching Image 2
  const observatoryGroup = new THREE.Group()
  observatoryGroup.position.set(-48, 0, -32)
  group.add(observatoryGroup)

  // Architectural materials for the ELT Observatory campus
  const plazaConcreteMat = mat('#626b74', 0.88, 0.12)
  const terracottaMat = mat('#8e3c29', 0.88, 0.12)    // Warm desert terracotta concrete plinth
  const bronzeTrimMat = mat('#463028', 0.6, 0.4)      // Architectural expansion reveal rings
  const annexFasciaMat = mat('#262b32', 0.7, 0.25)    // Operations building fascia trim
  const annexRoofMat = mat('#1a1e24', 0.92, 0.1)      // Waterproof bitumen composite roof
  const louverWallMat = mat('#121518', 0.95, 0.05)    // Recessed dark ventilation wall
  const louverMullionMat = mat('#58626c', 0.45, 0.55) // Vertical structural ventilation louvers
  const bearingMat = mat('#282e36', 0.4, 0.6)         // Azimuthal rotating turntable track
  const domeShellMat = mat('#bdc5ce', 0.30, 0.84)     // Brushed titanium calotte shell
  const bevelFlangeMat = mat('#9eaab8', 0.24, 0.88)   // Satin alloy aperture collar flange
  const opticalBlackMat = mat('#07090c', 0.98, 0.02)  // Ultra-black anti-reflective light baffle
  const cavityFloorMat = mat('#040507', 1.0, 0.0)     // Optical chamber rear bulkhead
  const primaryMirrorMat = new THREE.MeshStandardMaterial({
    map: hexMirrorTex,
    color: '#72ade2',
    roughness: 0.05,
    metalness: 0.98,
  })
  const spiderStrutMat = mat('#1e2228', 0.35, 0.75)   // Carbon steel secondary mirror struts
  const secondaryHubMat = mat('#2e343c', 0.3, 0.7)    // Secondary mirror (M2) focal hub
  const m2GoldMat = mat('#dec67c', 0.08, 0.96)        // Gold optical coating on secondary reflector
  const lgsCyanMat = new THREE.MeshBasicMaterial({ color: '#00f0ff' }) // Laser Guide Star projection lenses
  const chillerMat = mat('#505a64', 0.65, 0.35)

  // Leveled desert terrace concrete plaza foundation
  box(observatoryGroup, [46, 0.42, 30], [0, 0.21, 0], plazaConcreteMat)
  // Stepped foundation retaining wall
  box(observatoryGroup, [47.2, 0.3, 31.2], [0, 0.08, 0], mat('#3c444c', 0.92, 0.08))

  // Common geometries for both observatories (reused and registered for clean disposal)
  const plinthGeo = new THREE.CylinderGeometry(5.9, 6.35, 3.8, 36)
  const plinthRing1 = new THREE.TorusGeometry(6.12, 0.06, 6, 36)
  const plinthRing2 = new THREE.TorusGeometry(6.01, 0.06, 6, 36)
  const louverInnerGeo = new THREE.CylinderGeometry(5.45, 5.45, 1.5, 36)
  const mullionGeo = new THREE.BoxGeometry(0.16, 1.5, 0.35)
  const trackRingGeo = new THREE.TorusGeometry(5.72, 0.12, 8, 48)
  const turntableGeo = new THREE.CylinderGeometry(5.68, 5.68, 0.3, 40)
  const domeShellGeo = new THREE.SphereGeometry(5.6, 48, 36, 0, Math.PI * 2, 0, Math.PI * 0.72)
  const archGeo = new THREE.TorusGeometry(5.68, 0.08, 8, 48, Math.PI)
  const cowlGeo = new THREE.CylinderGeometry(2.9, 3.7, 0.95, 36, 1, true)
  const bevelGeo = new THREE.TorusGeometry(2.95, 0.28, 16, 48)
  const baffleGeo = new THREE.CylinderGeometry(2.8, 2.8, 2.2, 36, 1, true)
  const backplateGeo = new THREE.CircleGeometry(2.78, 36)
  const mirrorGeo = new THREE.CircleGeometry(2.7, 48)
  const strutGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8)
  const hubGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.45, 24)
  const m2ReflectorGeo = new THREE.CircleGeometry(0.5, 24)
  const lgsCanGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.45, 12)
  const lgsLensGeo = new THREE.CircleGeometry(0.11, 12)
  const beaconSphereGeo = new THREE.SphereGeometry(0.24, 12, 10)

  generatedGeometries.push(
    plinthGeo, plinthRing1, plinthRing2, louverInnerGeo, mullionGeo,
    trackRingGeo, turntableGeo, domeShellGeo, archGeo, cowlGeo,
    bevelGeo, baffleGeo, backplateGeo, mirrorGeo, strutGeo,
    hubGeo, m2ReflectorGeo, lgsCanGeo, lgsLensGeo, beaconSphereGeo
  )

  // Twin ESO ELT Observatory stations (Alpha and Beta Deep-Space Tracking Nodes)
  const eltStations = [
    { ox: -11.5, oz: 1.5, baseAzimuth: -0.42, speed: 0.034, phase: 0.0 },
    { ox: 11.5, oz: -3.5, baseAzimuth: -0.26, speed: 0.030, phase: 1.85 },
  ]

  for (const { ox, oz, baseAzimuth, speed, phase } of eltStations) {
    // 1. Stationary Terracotta Concrete Plinth Base
    mesh(plinthGeo, terracottaMat, V3(ox, 2.1, oz), observatoryGroup)

    const r1 = mesh(plinthRing1, bronzeTrimMat, V3(ox, 1.45, oz), observatoryGroup, false)
    r1.rotation.x = Math.PI / 2
    const r2 = mesh(plinthRing2, bronzeTrimMat, V3(ox, 2.75, oz), observatoryGroup, false)
    r2.rotation.x = Math.PI / 2

    // Operations & Science Annex Facility (attached rectangular laboratory block)
    const annexX = ox + 4.5
    const annexZ = oz + 4.2
    box(observatoryGroup, [7.0, 2.5, 9.2], [annexX, 1.45, annexZ], terracottaMat)
    box(observatoryGroup, [7.12, 0.35, 9.32], [annexX, 2.85, annexZ], annexFasciaMat)
    box(observatoryGroup, [6.9, 0.15, 9.1], [annexX, 3.05, annexZ], annexRoofMat)
    // Airlock personnel entrance with warm doorway light
    box(observatoryGroup, [1.3, 2.0, 0.25], [annexX, 1.2, annexZ + 4.65], mat('#222830', 0.6, 0.4))
    mesh(new THREE.BoxGeometry(0.5, 0.1, 0.25), new THREE.MeshBasicMaterial({ color: '#ffe6a8' }), V3(annexX, 2.35, annexZ + 4.75), observatoryGroup, false, false)
    // Rooftop HVAC chiller condensers
    box(observatoryGroup, [1.3, 0.75, 1.8], [annexX - 1.5, 3.55, annexZ - 1.0], chillerMat)
    box(observatoryGroup, [1.3, 0.75, 1.8], [annexX + 1.2, 3.55, annexZ + 0.8], chillerMat)

    // 2. Stationary Louver Gallery (Ventilation ring between base plinth and rotating dome)
    mesh(louverInnerGeo, louverWallMat, V3(ox, 4.75, oz), observatoryGroup, false)
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2
      const mx = ox + Math.cos(a) * 5.6
      const mz = oz + Math.sin(a) * 5.6
      const m = mesh(mullionGeo, louverMullionMat, V3(mx, 4.75, mz), observatoryGroup, false)
      m.rotation.y = -a
    }
    const trackRing = mesh(trackRingGeo, bearingMat, V3(ox, 5.52, oz), observatoryGroup, false)
    trackRing.rotation.x = Math.PI / 2

    // 3. Rotating Calotte Dome Assembly (Azimuth tracking around Y axis)
    const domePivot = new THREE.Group()
    domePivot.position.set(ox, 5.55, oz)
    observatoryGroup.add(domePivot)
    rotatingObservatoryDomes.push({ pivot: domePivot, baseAzimuth, trackSpeed: speed, phaseOffset: phase })

    // Azimuth turntable flange
    mesh(turntableGeo, bearingMat, V3(0, 0.15, 0), domePivot, false)

    // Spherical Brushed Titanium Dome Shell
    mesh(domeShellGeo, domeShellMat, V3(0, 2.2, 0), domePivot)

    // Curved Shutter Arch Rails over dome apex
    const arch = mesh(archGeo, steelMat, V3(0, 2.2, 0), domePivot, false)
    arch.rotation.y = Math.PI / 2

    // 4. Iconic Inclined Circular Observing Aperture Assembly (Tilted 38° upward into the sky)
    const tiltAngle = 38 * (Math.PI / 180)
    const apDist = 5.4
    const apY = 2.2 + apDist * Math.sin(tiltAngle)
    const apZ = apDist * Math.cos(tiltAngle)
    const apertureGroup = new THREE.Group()
    apertureGroup.position.set(0, apY, apZ)
    apertureGroup.rotation.x = -(Math.PI / 2 - tiltAngle)
    domePivot.add(apertureGroup)

    // Aerodynamic Cowling & Bevel Flange Ring
    mesh(cowlGeo, domeShellMat, V3(0, 0, 0), apertureGroup, false)
    mesh(bevelGeo, bevelFlangeMat, V3(0, 0.45, 0), apertureGroup, false)

    // Recessed Optical-Black Baffle Tube & Backplate
    mesh(baffleGeo, opticalBlackMat, V3(0, -0.65, 0), apertureGroup, false)
    const bp = mesh(backplateGeo, cavityFloorMat, V3(0, -1.72, 0), apertureGroup, false)
    bp.rotation.x = Math.PI / 2

    // Giant Segmented Primary Mirror (M1) with Hexagonal Segments & Specular Blue Glare
    const mirror = mesh(mirrorGeo, primaryMirrorMat, V3(0, -1.58, 0), apertureGroup, false)
    mirror.rotation.x = Math.PI / 2

    // 4-leg Spider Truss Struts supporting Secondary Mirror (M2)
    const strutAngles = [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]
    for (const sa of strutAngles) {
      const strut = new THREE.Mesh(strutGeo, spiderStrutMat)
      const rx = Math.cos(sa) * 1.35
      const rz = Math.sin(sa) * 1.35
      strut.position.set(rx, -0.9, rz)
      strut.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(-Math.cos(sa) * 2.6, 1.25, -Math.sin(sa) * 2.6).normalize()
      )
      apertureGroup.add(strut)
    }

    // Secondary Mirror (M2) Focal Hub & Polished Gold Reflector Face
    mesh(hubGeo, secondaryHubMat, V3(0, -0.3, 0), apertureGroup, false)
    const m2Face = mesh(m2ReflectorGeo, m2GoldMat, V3(0, -0.53, 0), apertureGroup, false)
    m2Face.rotation.x = -Math.PI / 2

    // 4 Laser Guide Star (LGS) Projection Telescopes with Glowing Cyan Optics
    for (const lgsAngle of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
      const lx = Math.cos(lgsAngle) * 2.95
      const lz = Math.sin(lgsAngle) * 2.95
      mesh(lgsCanGeo, bearingMat, V3(lx, 0.5, lz), apertureGroup, false)
      const lens = mesh(lgsLensGeo, lgsCyanMat, V3(lx, 0.73, lz), apertureGroup, false, false)
      lens.rotation.x = -Math.PI / 2
    }

    // Flashing Aviation Obstacle Beacon at the Dome Summit
    mesh(beaconSphereGeo, beaconMat, V3(0, 7.85, 0), domePivot, false, false)
    box(domePivot, [0.06, 0.9, 0.06], [0, 8.4, 0], steelMat)
  }

  // Warm architectural ground floodlights illuminating the observatories
  const obsSpot1 = new THREE.SpotLight('#fff2d4', 18, 38, Math.PI / 3.5, 0.5, 1.2)
  obsSpot1.position.set(-11.5, 0.8, 12)
  obsSpot1.target.position.set(-11.5, 6, 1.5)
  observatoryGroup.add(obsSpot1, obsSpot1.target)

  const obsSpot2 = new THREE.SpotLight('#fff2d4', 18, 38, Math.PI / 3.5, 0.5, 1.2)
  obsSpot2.position.set(11.5, 0.8, 9)
  obsSpot2.target.position.set(11.5, 6, -3.5)
  observatoryGroup.add(obsSpot2, obsSpot2.target)

  // 4C. Modern Aerospace Vehicle Assembly / Integration Facility (HIF / VAB)
  const facility = new THREE.Group()
  facility.position.set(54, 0, -44)
  group.add(facility)

  // Materials for facility
  const titaniumPanelMat = mat('#c8d0d8', 0.58, 0.35) // High-bay titanium white cladding
  const facilityBaseMat = mat('#2c343c', 0.82, 0.25)  // Concrete & steel plinth
  const hangarDoorMat = mat('#20252b', 0.65, 0.35)    // Dark anthracite segmented door

  // Plinth foundation
  box(facility, [34, 2.2, 50], [0, 1.1, 0], facilityBaseMat)
  // Main high-bay superstructure
  box(facility, [32.8, 17.5, 48.8], [0, 10.85, 0], titaniumPanelMat)
  // Parapet roof rim
  box(facility, [33.6, 0.9, 49.6], [0, 19.8, 0], mat('#1e242a', 0.8, 0.2))

  // Exterior vertical structural steel I-beams along the walls (architectural depth)
  for (const sx of [-16.7, 16.7]) {
    for (let sz = -20; sz <= 20; sz += 10) {
      box(facility, [0.5, 18.5, 0.5], [sx, 10.3, sz], steelDark)
    }
  }

  // Giant roll-up launch vehicle hangar door facing the crawlerway (-Z/pad side)
  box(facility, [18, 13.5, 0.4], [0, 7.8, 24.6], hangarDoorMat)
  // Horizontal panel seams on the rollup door
  for (let dy = 3; dy <= 13; dy += 2.2) {
    box(facility, [18, 0.08, 0.5], [0, dy, 24.65], mat('#15181c', 0.9, 0.1))
  }
  // Safety hazard chevron bar above the door
  box(facility, [19.2, 0.7, 0.6], [0, 14.8, 24.7], hazardChevronMat)
  box(facility, [0.6, 14.2, 0.6], [-9.3, 8.1, 24.7], hazardChevronMat)
  box(facility, [0.6, 14.2, 0.6], [9.3, 8.1, 24.7], hazardChevronMat)

  // Door illuminated protective canopy
  box(facility, [20.5, 0.4, 2.4], [0, 15.3, 25.8], steelDark)

  // Wall-mounted industrial gooseneck floodlights
  for (const lx of [-6, 0, 6]) {
    const doorSpot = new THREE.SpotLight('#fff0d0', 14, 28, Math.PI / 3, 0.5, 1.4)
    doorSpot.position.set(lx, 15.1, 26.6)
    doorSpot.target.position.set(lx, 0, 32)
    facility.add(doorSpot)
    facility.add(doorSpot.target)
    mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff6e4' }), V3(lx, 15.1, 26.6), facility, false, false)
  }

  // Rooftop industrial HVAC chillers and exhaust ducts
  box(facility, [4.5, 2.4, 6], [-8, 20.8, 6], steelDark)
  box(facility, [4.5, 2.4, 6], [8, 20.8, 6], steelDark)
  box(facility, [3.2, 1.8, 4], [0, 20.5, -10], steelDark)

  // Satellite communication radome dish on roof
  mesh(new THREE.SphereGeometry(2.4, 16, 12), whiteInsulated, V3(0, 22.2, 8), facility)
  box(facility, [0.8, 1.8, 0.8], [0, 20.6, 8], steelMat)

  // Rooftop aviation obstruction beacon
  const roofBeacon = mesh(new THREE.SphereGeometry(0.3, 10, 8), beaconMat, V3(0, 24.8, 8), facility, false, false)
  beacons.push(roofBeacon)

  // Concrete staging apron in front of the hangar
  box(facility, [30, 0.16, 26], [0, 0.05, 37], mat('#58626c', 0.88, 0.12), false)

  // Aerospace equipment storage containers on the apron
  box(facility, [2.5, 2.7, 6.2], [12, 1.4, 34], mat('#22446a', 0.65, 0.25)) // Industrial blue container
  box(facility, [2.5, 2.7, 6.2], [12, 1.4, 42], mat('#7a3428', 0.65, 0.25)) // Industrial terracotta container
  box(facility, [2.2, 1.8, 3.2], [-11, 0.95, 36], mat('#3e4852', 0.7, 0.3)) // Power transformer unit

  // 4D. Deep Space Tracking Radar Antenna
  const radarGroup = new THREE.Group()
  radarGroup.position.set(42, 0, 38)
  group.add(radarGroup)

  // Concrete pedestal
  mesh(new THREE.CylinderGeometry(3.2, 3.8, 4.5, 16), mat('#727d85', 0.88, 0.12), V3(0, 2.25, 0), radarGroup)
  // Parabolic tracking dish
  const dishMat = mat('#dce2e6', 0.5, 0.3)
  const dish = mesh(new THREE.SphereGeometry(4.5, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.45), dishMat, V3(0, 6.2, 0), radarGroup)
  dish.rotation.x = Math.PI * 0.72
  dish.rotation.y = 0.4
  // Central feed horn probe
  box(radarGroup, [0.18, 3.2, 0.18], [0, 6.6, -1.2], steelMat)

  // 4E. Heavy Transporter Dual-Track Crawlerway (Authentic NASA Apollo / Artemis crushed river-stone tracks)
  const crawlerGroup = new THREE.Group()
  group.add(crawlerGroup)

  const gravelMat = mat('#6d5e4f', 0.94, 0.06) // Crushed Alabama river rock ballast
  const asphaltMat = mat('#32373c', 0.9, 0.1)  // Central service asphalt road

  // Central asphalt road
  box(crawlerGroup, [3.2, 0.14, 58], [0, -0.15, 47], asphaltMat, false)
  // Left and Right heavy crawler tracks
  box(crawlerGroup, [4.4, 0.16, 58], [-4.2, -0.14, 47], gravelMat, false)
  box(crawlerGroup, [4.4, 0.16, 58], [4.2, -0.14, 47], gravelMat, false)
  // Concrete borders
  box(crawlerGroup, [0.3, 0.22, 58], [-6.5, -0.12, 47], mat('#7b838c', 0.85, 0.15), false)
  box(crawlerGroup, [0.3, 0.22, 58], [6.5, -0.12, 47], mat('#7b838c', 0.85, 0.15), false)

  // Amber road markers along the crawlerway
  for (let z = 22; z <= 72; z += 8) {
    box(crawlerGroup, [0.12, 0.65, 0.12], [-6.5, 0.25, z], mat('#e2a528', 0.4, 0.3), false)
    box(crawlerGroup, [0.12, 0.65, 0.12], [6.5, 0.25, z], mat('#e2a528', 0.4, 0.3), false)
  }

  // 4E-1. Parked Aerospace Logistics Tanker Truck (Adds authentic human scale to the spaceport)
  const truckGroup = new THREE.Group()
  truckGroup.position.set(24, 0, 38)
  truckGroup.rotation.y = -0.35
  group.add(truckGroup)

  const truckRed = mat('#c23224', 0.45, 0.35)
  const truckChrome = mat('#e8ecef', 0.2, 0.85)
  const tireMat = mat('#181a1d', 0.92, 0.08)
  const glassMat = new THREE.MeshStandardMaterial({ color: '#1a2430', roughness: 0.1, metalness: 0.9 })

  // Cab chassis
  box(truckGroup, [2.4, 2.6, 4.2], [0, 1.7, 3.2], truckRed)
  // Windshield & side windows
  box(truckGroup, [2.2, 1.0, 0.1], [0, 2.1, 5.25], glassMat)
  box(truckGroup, [0.1, 0.85, 1.4], [-1.22, 2.05, 3.8], glassMat)
  box(truckGroup, [0.1, 0.85, 1.4], [1.22, 2.05, 3.8], glassMat)
  // Front grille and bumper
  box(truckGroup, [2.3, 0.7, 0.4], [0, 0.8, 5.35], truckChrome)

  // Tanker trailer (insulated cylindrical stainless steel vessel)
  const tankerVessel = mesh(new THREE.CylinderGeometry(1.25, 1.25, 8.2, 24), truckChrome, V3(0, 2.1, -2.8), truckGroup)
  tankerVessel.rotation.x = Math.PI / 2
  mesh(new THREE.SphereGeometry(1.25, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), truckChrome, V3(0, 2.1, 1.3), truckGroup).rotation.x = -Math.PI / 2
  mesh(new THREE.SphereGeometry(1.25, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), truckChrome, V3(0, 2.1, -6.9), truckGroup).rotation.x = Math.PI / 2

  // Trailer chassis & wheels
  box(truckGroup, [2.1, 0.45, 8.5], [0, 0.7, -2.8], steelDark)
  for (const wz of [4.2, 2.2, -4.5, -6.0]) {
    for (const wx of [-1.15, 1.15]) {
      const tire = mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.32, 16), tireMat, V3(wx, 0.48, wz), truckGroup)
      tire.rotation.z = Math.PI / 2
    }
  }

  // 4F. Far-side service & lightning-protection mast (infrastructure depth on far side of pad)
  const farMast = new THREE.Group()
  farMast.position.set(-24, 0, 34)
  const mastSteel = mat('#8a3424', 0.7, 0.3)
  const mastLeg = 0.22
  const mastH = 16
  const half = 1.7
  for (const lx of [-half, half]) {
    for (const lz of [-half, half]) {
      box(farMast, [mastLeg, mastH, mastLeg], [lx, mastH / 2, lz], mastSteel)
    }
  }
  box(farMast, [1.0, mastH, 1.0], [0, mastH / 2, 0], mat('#4a5560', 0.75, 0.25))
  for (let i = 1; i <= 5; i++) {
    const y = (i / 6) * mastH
    box(farMast, [half * 2, 0.14, 0.14], [0, y, -half], mastSteel)
    box(farMast, [half * 2, 0.14, 0.14], [0, y, half], mastSteel)
    box(farMast, [0.14, 0.14, half * 2], [-half, y, 0], mastSteel)
    box(farMast, [0.14, 0.14, half * 2], [half, y, 0], mastSteel)
  }
  // Aviation lightning beacon tip
  const beaconTip = mesh(new THREE.SphereGeometry(0.32, 12, 10), beaconMat, V3(0, mastH + 0.32, 0), farMast, false)
  farMast.add(beaconTip)
  group.add(farMast)

  // 4G. Procedural Cryogenic LOX Boiloff Steam System
  // Vents gentle swirling white vapor from the rocket interstage umbilical and base LOX dump
  const steamTex = createSteamPuffTexture()
  const steamMat = new THREE.MeshBasicMaterial({
    map: steamTex,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.NormalBlending,
  })

  const steamPuffs: {
    mesh: THREE.Mesh
    origin: THREE.Vector3
    vel: THREE.Vector3
    life: number
    maxLife: number
    rotSpeed: number
    baseScale: number
  }[] = []

  const steamGroup = new THREE.Group()
  group.add(steamGroup)

  const steamOrigins = [
    { pos: V3(1.85, 14.2, 0.15), count: 18, maxLife: 3.2, baseScale: 1.1 }, // Second stage umbilical vent
    { pos: V3(-1.6, 2.2, -0.6), count: 10, maxLife: 2.4, baseScale: 0.9 },   // Launch table LOX drain
  ]

  for (const { pos, count, maxLife, baseScale } of steamOrigins) {
    for (let pIdx = 0; pIdx < count; pIdx++) {
      const puffGeo = new THREE.PlaneGeometry(1.4, 1.4)
      generatedGeometries.push(puffGeo)
      const puffMesh = new THREE.Mesh(puffGeo, steamMat.clone())
      puffMesh.position.copy(pos)
      steamGroup.add(puffMesh)

      steamPuffs.push({
        mesh: puffMesh,
        origin: pos.clone(),
        vel: V3(
          0.45 + (Math.random() - 0.5) * 0.3,
          0.22 + Math.random() * 0.28,
          0.38 + (Math.random() - 0.5) * 0.3,
        ),
        life: pIdx / count, // Staggered initial life phase
        maxLife,
        rotSpeed: (Math.random() - 0.5) * 0.4,
        baseScale,
      })
    }
  }

  const surfaceGroup = new THREE.Group()
  for (const child of [...group.children]) {
    if (child === skyDome) continue
    group.remove(child)
    surfaceGroup.add(child)
  }
  group.add(surfaceGroup)

  const surfaceMaterials = new Map<THREE.Material, { opacity: number; transparent: boolean; depthWrite: boolean }>()
  surfaceGroup.traverse(object => {
    const item = object as THREE.Mesh
    if (!item.isMesh) return
    const materials = Array.isArray(item.material) ? item.material : [item.material]
    for (const material of materials) {
      if (!surfaceMaterials.has(material)) {
        surfaceMaterials.set(material, {
          opacity: material.opacity,
          transparent: material.transparent,
          depthWrite: material.depthWrite,
        })
      }
    }
  })
  let lastSurfaceFade = 1

  // Return Launch Environment controller
  return {
    group,
    waterRings,
    setAltitudeKm(altitudeKm: number) {
      skyAltitude.value = altitudeKm
      const surfaceFade = 1 - THREE.MathUtils.smoothstep(altitudeKm, 6, 18)
      if (Math.abs(surfaceFade - lastSurfaceFade) < 0.005) return
      lastSurfaceFade = surfaceFade
      surfaceGroup.visible = surfaceFade > 0.001
      cloudShaderMat.uniforms.uOpacity.value = 0.28 * surfaceFade
      for (const [material, original] of surfaceMaterials) {
        const transparent = original.transparent || surfaceFade < 0.999
        if (material.transparent !== transparent) {
          material.transparent = transparent
          material.needsUpdate = true
        }
        material.opacity = original.opacity * surfaceFade
        material.depthWrite = surfaceFade < 0.999 ? false : original.depthWrite
      }
      // Fade low-altitude haze/rocks as the rocket leaves the atmosphere
      group.traverse(object => {
        const item = object as THREE.Mesh
        if (!item.isMesh || !item.userData.fadeWithAltitude) return
        const mats = Array.isArray(item.material) ? item.material : [item.material]
        for (const m of mats) {
          m.opacity = THREE.MathUtils.clamp(item.userData.baseOpacity * surfaceFade, 0, 1)
          m.needsUpdate = true
        }
      })
    },
    update(dt: number, elapsed: number, camera?: THREE.Camera) {
      // 1. Drifting cloud parallax
      for (const item of cloudMeshes) {
        item.mesh.position.x += item.speedX * dt * 2.8
        item.mesh.position.z += item.speedZ * dt * 2.8
        if (item.mesh.position.x > item.bound) {
          item.mesh.position.x = -item.bound
        }
        if (item.mesh.position.z > item.bound) {
          item.mesh.position.z = -item.bound
        }
      }

      // 2. Flashing red aviation beacons (1.2 Hz pulse)
      const flash = Math.sin(elapsed * 4.8) > 0.2 ? 1 : 0.05
      beaconMat.color.setRGB(flash, 0.02, 0.02)

      // 3. Animate cryogenic LOX boiloff steam puffs
      for (const puff of steamPuffs) {
        puff.life += dt / puff.maxLife
        if (puff.life >= 1) {
          puff.life = 0
          puff.mesh.position.copy(puff.origin).add(V3(
            (Math.random() - 0.5) * 0.15,
            (Math.random() - 0.5) * 0.15,
            (Math.random() - 0.5) * 0.15,
          ))
        }
        puff.mesh.position.addScaledVector(puff.vel, dt)
        if (camera) {
          puff.mesh.quaternion.copy(camera.quaternion)
        } else {
          puff.mesh.rotation.y = elapsed * 0.1
        }
        puff.mesh.rotation.z += puff.rotSpeed * dt
        const progress = puff.life
        const scale = puff.baseScale * (1.0 + progress * 2.6)
        puff.mesh.scale.set(scale, scale, scale)
        const alpha = Math.sin(progress * Math.PI) * 0.38
        ;(puff.mesh.material as THREE.MeshBasicMaterial).opacity = alpha
      }

      // 4. Smooth celestial Moon tracking for twin ESO ELT Observatories
      for (const dome of rotatingObservatoryDomes) {
        const trackAngle = dome.baseAzimuth + elapsed * dome.trackSpeed + Math.sin(elapsed * 0.08 + dome.phaseOffset) * 0.06
        dome.pivot.rotation.y = trackAngle
      }
    },
    dispose() {
      hexMirrorTex.dispose()
      steamTex.dispose()
      concreteTex.dispose()
      terrainMap.dispose()
      terrainBump.dispose()
      generatedGeometries.forEach(geometry => geometry.dispose())
      mountainMat1.dispose()
      mountainMat2.dispose()
      terrainMaterial.dispose()
      rockMaterial.dispose()
    },
  }
}
