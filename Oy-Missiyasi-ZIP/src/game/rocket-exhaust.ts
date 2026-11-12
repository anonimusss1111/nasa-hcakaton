import * as THREE from 'three'

/**
 * ── PHOTOREALISTIC SUPERSONIC ROCKET EXHAUST & PROPULSION SYSTEM ────────────
 * Aerospace-accurate fluid propulsion modeled after Saturn V S-IC / SpaceX Falcon 9 & Merlin Vacuum:
 *
 * 1. Hyper-incandescent Supersonic Core Flame:
 *    - Continuous, unified hypersonic fire column originating directly at the engine nozzle exit plane.
 *    - Blackbody Kelvin combustion spectrum: Blinding white-hot core (>3,500K) -> solar gold -> roaring fire orange -> dissipating smoky crimson tail.
 *    - Supersonic standing Mach shock diamond nodes along the central thrust axis.
 *    - High-frequency fluid turbulence and vortex shedding (45–60 Hz).
 *    - Quadratic tail dissipation with zero geometric cutoffs or solid cylinder rods.
 *
 * 2. Ethereal Vacuum Expansion Plume ("Space Jellyfish" / Vacuum Bell):
 *    - Translucent, soft, billowing gas envelope in the mesosphere and vacuum of space (30 km – 180 km).
 *    - Delicate volumetric Fresnel rim, transparent through center, soft golden-amber and faint cyan/violet outer ionization.
 *    - Never forms a solid opaque plastic cone!
 *
 * 3. Exact Multi-Stage Engine Nozzle Alignment:
 *    - Stage 0 (Boosters + Core): 5 active engine nozzle exit bells (1 center core + 4 booster pods).
 *    - Stage 1/2 (Upper stage): Single large vacuum engine bell plume with expanded vacuum bell.
 *    - Rigid quaternion orientation locking the flame perfectly to the rocket's longitudinal thrust axis in all 3D camera angles.
 *
 * 4. High-velocity Fire Sparks (1,800 count) & Launch-pad Deluge Steam.
 * 5. Dynamic High-frequency Combustion Lighting.
 */

export interface RocketExhaustSystem {
  group: THREE.Group
  plumeGroup: THREE.Group
  update: (
    dt: number,
    rocketPos: THREE.Vector3,
    rocketRot: THREE.Euler | THREE.Quaternion,
    throttle: number,
    altitudeM: number,
    speedMps: number,
    elapsed: number,
    stageIndex?: number,
    nozzleBaseY?: number,
  ) => void
  setActive: (active: boolean) => void
  setCryoVenting?: (active: boolean) => void
  dispose: () => void
}

// 4-engine cluster layout aligned cleanly with central core + 3 real boosters (43°, 156°, 291°)
const STAGE_0_NOZZLE_OFFSETS: readonly [number, number, number][] = [
  [0, 0.12, 0],         // Center core engine
  [1.28, 0.12, 1.20],   // Booster 1 (~43°)
  [-1.55, 0.12, 0.70],  // Booster 2 (~156°)
  [0.58, 0.12, -1.55],  // Booster 3 (~291°)
]

const STAGE_1_NOZZLE_OFFSETS: readonly [number, number, number][] = [
  [0, 0.12, 0], // Single upper-stage vacuum engine
]

export function createRocketExhaustSystem(scene: THREE.Scene): RocketExhaustSystem {
  const group = new THREE.Group()
  group.name = 'RocketExhaustSystem'
  scene.add(group)

  let active = false

  // ── 1. PROCEDURAL ORGANIC PARTICLE TEXTURE ─────────────────────────────────
  function createParticleTexture(): THREE.CanvasTexture {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    const img = ctx.createImageData(size, size)

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x - 63.5) / 63.5
        const dy = (y - 63.5) / 63.5
        const r = Math.sqrt(dx * dx + dy * dy)
        const turb = 0.88 + 0.08 * Math.sin(x * 0.18 + y * 0.24) + 0.04 * Math.sin(x * 0.38 - y * 0.22)
        const edge = Math.max(0, Math.min(1, (1 - r * turb) * 3.2))
        const alpha = Math.pow(edge, 1.6) * Math.exp(-r * r * 1.6)
        const idx = (y * size + x) * 4
        img.data[idx] = 255
        img.data[idx + 1] = 255
        img.data[idx + 2] = 255
        img.data[idx + 3] = Math.round(alpha * 255)
      }
    }
    ctx.putImageData(img, 0, 0)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  const puffTex = createParticleTexture()

  // ── 2. SHARED UNIFORMS ──────────────────────────────────────────────────────
  const plumeUniforms = {
    uTime: { value: 0 },
    uThrottle: { value: 1.0 },
    uVacuum: { value: 0.0 }, // 0.0 at sea level, 1.0 in deep space
  }

  // ── 3. HYPER-INCANDESCENT MAIN PLUME SHADER (THE ROARING THRUST COLUMN) ─────
  const mainPlumeShader = {
    uniforms: plumeUniforms,
    vertexShader: `
      uniform float uTime;
      uniform float uVacuum;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec3 p = position;

        // High-frequency supersonic aerodynamic flutter & vortex ripples
        float flutter1 = sin(p.y * 3.2 - uTime * 54.0) * cos(p.x * 4.2 + p.z * 4.2) * 0.06;
        float flutter2 = cos(p.y * 7.5 - uTime * 82.0 + sin(p.x * 5.0)) * 0.04;
        float flutter = (flutter1 + flutter2) * (0.08 + pow(vUv.y, 0.8) * 0.92);
        p.xz += vNormal.xz * flutter;

        // Graceful supersonic expansion:
        // Supersonic flow gently swells in the mixing shear layer
        float swell = sin(vUv.y * 3.14159 * 0.82) * (0.18 + uVacuum * 0.45);
        p.xz *= (1.0 + swell);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uThrottle;
      uniform float uVacuum;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        if (uThrottle <= 0.01) discard;

        float y = vUv.y; // 0.0 at nozzle base, 1.0 at tail tip

        // 1. Soft optical depth: intense molten core, feathered atmospheric edges (never a hard solid plastic cone!)
        float ndv = abs(dot(normalize(vNormal), normalize(vViewDir)));
        float limb = pow(ndv, 1.45);
        float coreBeam = pow(ndv, 3.2);

        // 2. High-speed fluid combustion turbulence
        float flow = uTime * 46.0;
        float turb = sin(y * 12.0 - flow) * 0.16 + cos(y * 28.0 - flow * 1.4 + vUv.x * 6.28) * 0.12 + 0.72;

        // 3. Supersonic Standing Mach Shock Diamond Compression Nodes
        float shockFreq = mix(28.0, 18.0, uVacuum);
        float diamondWave = sin(y * shockFreq - uTime * 2.2);
        float diamondPulse = pow(max(0.0, diamondWave), 8.0) * coreBeam;
        diamondPulse *= (1.0 - smoothstep(0.02, 0.72, y));

        // 4. Authentic Aerospace Kelvin Combustion Spectrum
        vec3 coreWhite   = vec3(2.4, 2.35, 2.15);
        vec3 solarGold   = vec3(1.9, 1.28, 0.34);
        vec3 flameOrange = vec3(1.45, 0.50, 0.08);
        vec3 deepCrimson = vec3(0.75, 0.14, 0.02);

        vec3 col;
        if (y < 0.16) {
          float t = y / 0.16;
          col = mix(coreWhite, solarGold, smoothstep(0.0, 1.0, t));
        } else if (y < 0.52) {
          float t = (y - 0.16) / 0.36;
          col = mix(solarGold, flameOrange, smoothstep(0.0, 1.0, t));
        } else {
          float t = (y - 0.52) / 0.48;
          col = mix(flameOrange, deepCrimson, smoothstep(0.0, 1.0, t));
        }

        // Add concentrated central Mach diamond nodes
        col += vec3(2.4, 2.25, 1.95) * diamondPulse * 2.0;

        // Smooth feathering right at engine nozzle lip (y=0..0.06) and quadratic tail fade (ZERO hard rim!)
        float nozzleBlend = smoothstep(0.0, 0.055, y);
        float tailFade = pow(1.0 - smoothstep(0.42, 1.0, y), 2.1);
        float alpha = limb * turb * nozzleBlend * tailFade * uThrottle * 0.88;

        gl_FragColor = vec4(col, alpha);
      }
    `,
  }

  // ── 4. ETHEREAL TRANSLUCENT VACUUM EXPANSION PLUME (SPACE JELLYFISH) ────────
  // Delicately expands behind the rocket in vacuum without ever turning into an opaque solid
  const vacuumPlumeShader = {
    uniforms: plumeUniforms,
    vertexShader: `
      uniform float uTime;
      uniform float uVacuum;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec3 p = position;

        // Parabolic expansion in vacuum: gently bell-flares outward behind the nozzle without oversize halo
        float flare = pow(vUv.y, 1.45) * (0.22 + uVacuum * 0.55);
        p.xz *= (1.0 + flare);

        // Fluid wave ripples
        float wave = sin(p.y * 1.5 - uTime * 24.0) * cos(p.x * 2.0 + p.z * 2.0) * 0.04 * uVacuum;
        p.xz += vNormal.xz * wave;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uThrottle;
      uniform float uVacuum;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        if (uThrottle <= 0.01 || uVacuum <= 0.04) discard;

        float y = vUv.y;

        // Core-weighted feathery gas (edges fade to 0 cleanly — zero murky rim shell!)
        float ndv = abs(dot(normalize(vNormal), normalize(vViewDir)));
        float softBody = pow(ndv, 1.85);

        // Subtle high-frequency combustion shimmer
        float flow = uTime * 24.0;
        float wave = sin(y * 8.0 - flow + vUv.x * 6.28) * 0.14 + 0.86;

        // Luminous warm peach-gold vacuum glow tapering smoothly into thin space wake
        vec3 innerGold  = vec3(1.65, 0.96, 0.38);
        vec3 outerPeach = vec3(1.05, 0.52, 0.32);

        vec3 col = mix(innerGold, outerPeach, smoothstep(0.08, 0.85, y));

        float nozzleBlend = smoothstep(0.0, 0.12, y);
        float tailFade = pow(1.0 - smoothstep(0.28, 1.0, y), 1.9);

        float alpha = softBody * wave * nozzleBlend * tailFade * uThrottle * uVacuum * 0.14;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  }

  // ── 5. ENGINE NOZZLE THROAT EXIT DISCS (BLINDING WHITE-CYAN THROAT GLOW) ────
  const throatShader = {
    uniforms: plumeUniforms,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uThrottle;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        if (uThrottle <= 0.01) discard;
        vec2 p = (vUv - vec2(0.5)) * 2.0;
        float r = length(p);
        if (r > 1.0) discard;

        float core = pow(max(0.0, 1.0 - r), 1.4);
        vec3 throatCol = mix(vec3(3.6, 3.5, 3.3), vec3(1.8, 1.4, 0.4), r);
        float alpha = core * uThrottle * 0.99;
        gl_FragColor = vec4(throatCol, alpha);
      }
    `,
  }

  const plumeGroup = new THREE.Group()
  plumeGroup.name = 'RocketPlumeGeometry'
  group.add(plumeGroup)

  // 1. Incandescent Main Supersonic Jet Flame
  const mainPlumeMat = new THREE.ShaderMaterial({
    uniforms: plumeUniforms,
    vertexShader: mainPlumeShader.vertexShader,
    fragmentShader: mainPlumeShader.fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })

  // Slender hypersonic spindle geometry: length 30m, base radius 1.45m tapering to 0.18m
  const mainPlumeLength = 30.0
  const mainPlumeGeo = new THREE.CylinderGeometry(0.20, 1.45, mainPlumeLength, 32, 24, true)
  // Orient so base (1.45m) is at y = 0, tapering down to 0.20m at y = -30m
  mainPlumeGeo.rotateX(Math.PI)
  mainPlumeGeo.translate(0, -mainPlumeLength * 0.5, 0)
  const mainPlumeMesh = new THREE.Mesh(mainPlumeGeo, mainPlumeMat)
  plumeGroup.add(mainPlumeMesh)

  // 2. Translucent Ethereal Vacuum Plume (Space Bell)
  const vacuumPlumeMat = new THREE.ShaderMaterial({
    uniforms: plumeUniforms,
    vertexShader: vacuumPlumeShader.vertexShader,
    fragmentShader: vacuumPlumeShader.fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })

  const vacuumPlumeLength = 30.0
  const vacuumPlumeGeo = new THREE.CylinderGeometry(0.68, 2.35, vacuumPlumeLength, 36, 20, true)
  vacuumPlumeGeo.translate(0, -vacuumPlumeLength * 0.5, 0)
  const vacuumPlumeMesh = new THREE.Mesh(vacuumPlumeGeo, vacuumPlumeMat)
  vacuumPlumeMesh.visible = false
  plumeGroup.add(vacuumPlumeMesh)

  // 3. Engine Nozzle Throat Plasma Discs (At mouth of engine bells)
  const throatMat = new THREE.ShaderMaterial({
    uniforms: plumeUniforms,
    vertexShader: throatShader.vertexShader,
    fragmentShader: throatShader.fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })

  const throatGeo = new THREE.PlaneGeometry(0.85, 0.85)
  throatGeo.rotateX(Math.PI * 0.5) // Facing downward along thrust axis

  const stage0ThroatMeshes: THREE.Mesh[] = []
  STAGE_0_NOZZLE_OFFSETS.forEach(([nx, ny, nz]) => {
    const mesh = new THREE.Mesh(throatGeo, throatMat)
    mesh.position.set(nx, ny, nz)
    stage0ThroatMeshes.push(mesh)
    plumeGroup.add(mesh)
  })

  const stage1ThroatMeshes: THREE.Mesh[] = []
  STAGE_1_NOZZLE_OFFSETS.forEach(([nx, ny, nz]) => {
    const mesh = new THREE.Mesh(throatGeo, throatMat)
    mesh.position.set(nx, ny, nz)
    mesh.scale.setScalar(1.55) // Larger upper-stage vacuum engine bell
    mesh.visible = false
    stage1ThroatMeshes.push(mesh)
    plumeGroup.add(mesh)
  })

  // ── 6. HIGH-VELOCITY FIRE & SPARK PARTICLES (1,800 count) ───────────────────
  const FIRE_COUNT = 1800
  const firePos = new Float32Array(FIRE_COUNT * 3).fill(-9999)
  const fireVel = new Float32Array(FIRE_COUNT * 3)
  const fireLife = new Float32Array(FIRE_COUNT)
  const fireMaxLife = new Float32Array(FIRE_COUNT)
  const fireColor = new Float32Array(FIRE_COUNT * 3)
  const fireSize = new Float32Array(FIRE_COUNT)

  const fireGeo = new THREE.BufferGeometry()
  const firePosAttr = new THREE.BufferAttribute(firePos, 3).setUsage(THREE.DynamicDrawUsage)
  const fireColAttr = new THREE.BufferAttribute(fireColor, 3).setUsage(THREE.DynamicDrawUsage)
  const fireSizeAttr = new THREE.BufferAttribute(fireSize, 1).setUsage(THREE.DynamicDrawUsage)
  fireGeo.setAttribute('position', firePosAttr)
  fireGeo.setAttribute('color', fireColAttr)
  fireGeo.setAttribute('size', fireSizeAttr)

  const fireMat = new THREE.PointsMaterial({
    map: puffTex,
    vertexColors: true,
    size: 2.2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const firePoints = new THREE.Points(fireGeo, fireMat)
  group.add(firePoints)

  // ── 7. VOLUMETRIC SMOKE BILLOWS (Launch & Low Atmosphere) ───────────────────
  const SMOKE_COUNT = 2000
  const smokePos = new Float32Array(SMOKE_COUNT * 3).fill(-9999)
  const smokeVel = new Float32Array(SMOKE_COUNT * 3)
  const smokeLife = new Float32Array(SMOKE_COUNT)
  const smokeMaxLife = new Float32Array(SMOKE_COUNT)
  const smokeSize = new Float32Array(SMOKE_COUNT)
  const smokeBaseSize = new Float32Array(SMOKE_COUNT)
  const smokeOpacity = new Float32Array(SMOKE_COUNT)

  const smokeGeo = new THREE.BufferGeometry()
  const smokePosAttr = new THREE.BufferAttribute(smokePos, 3).setUsage(THREE.DynamicDrawUsage)
  const smokeSizeAttr = new THREE.BufferAttribute(smokeSize, 1).setUsage(THREE.DynamicDrawUsage)
  const smokeOpacityAttr = new THREE.BufferAttribute(smokeOpacity, 1).setUsage(THREE.DynamicDrawUsage)
  smokeGeo.setAttribute('position', smokePosAttr)
  smokeGeo.setAttribute('size', smokeSizeAttr)
  smokeGeo.setAttribute('opacity', smokeOpacityAttr)

  const smokeShaderMat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: puffTex },
      uSunDir: { value: new THREE.Vector3(-0.68, 0.28, -0.68).normalize() },
      uSunColor: { value: new THREE.Color('#ffe8cc') },
      uAmbientColor: { value: new THREE.Color('#38404a') },
    },
    vertexShader: `
      attribute float size;
      attribute float opacity;
      varying float vOpacity;
      void main() {
        vOpacity = opacity;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (280.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uSunColor;
      uniform vec3 uAmbientColor;
      varying float vOpacity;
      void main() {
        if (vOpacity <= 0.01) discard;
        vec4 tex = texture2D(uMap, gl_PointCoord);
        vec3 col = mix(uAmbientColor, uSunColor, 0.35);
        gl_FragColor = vec4(col, tex.a * vOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
  })

  const smokePoints = new THREE.Points(smokeGeo, smokeShaderMat)
  group.add(smokePoints)

  // ── 8. LAUNCH-PAD WATER DELUGE STEAM BURST (600 count) ─────────────────────
  // Enormous billowing steam clouds rolling across the pad table and flame trench
  const STEAM_COUNT = 600
  const steamPos = new Float32Array(STEAM_COUNT * 3).fill(-9999)
  const steamVel = new Float32Array(STEAM_COUNT * 3)
  const steamLife = new Float32Array(STEAM_COUNT)
  const steamMaxLife = new Float32Array(STEAM_COUNT)
  const steamSize = new Float32Array(STEAM_COUNT)
  const steamBaseSize = new Float32Array(STEAM_COUNT)
  const steamOpacity = new Float32Array(STEAM_COUNT)

  const steamGeo = new THREE.BufferGeometry()
  const steamPosAttr = new THREE.BufferAttribute(steamPos, 3).setUsage(THREE.DynamicDrawUsage)
  const steamSizeAttr = new THREE.BufferAttribute(steamSize, 1).setUsage(THREE.DynamicDrawUsage)
  const steamOpacityAttr = new THREE.BufferAttribute(steamOpacity, 1).setUsage(THREE.DynamicDrawUsage)
  steamGeo.setAttribute('position', steamPosAttr)
  steamGeo.setAttribute('size', steamSizeAttr)
  steamGeo.setAttribute('opacity', steamOpacityAttr)

  const steamShaderMat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: puffTex },
      uSteamColor: { value: new THREE.Color('#f2f7fc') },
    },
    vertexShader: `
      attribute float size;
      attribute float opacity;
      varying float vOpacity;
      void main() {
        vOpacity = opacity;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (320.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uSteamColor;
      varying float vOpacity;
      void main() {
        if (vOpacity <= 0.01) discard;
        vec4 tex = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(uSteamColor, tex.a * vOpacity * 0.48);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  })
  const steamPoints = new THREE.Points(steamGeo, steamShaderMat)
  group.add(steamPoints)

  // ── 8B. CRYOGENIC LOX BOIL-OFF CONDENSATION VAPOR PLUMES (160 count) ────────
  // Cold oxygen vapor venting from the interstage and tank relief valves
  const CRYO_COUNT = 160
  const cryoPos = new Float32Array(CRYO_COUNT * 3).fill(-9999)
  const cryoVel = new Float32Array(CRYO_COUNT * 3)
  const cryoLife = new Float32Array(CRYO_COUNT)
  const cryoMaxLife = new Float32Array(CRYO_COUNT)
  const cryoSize = new Float32Array(CRYO_COUNT)
  const cryoBaseSize = new Float32Array(CRYO_COUNT)
  const cryoOpacity = new Float32Array(CRYO_COUNT)

  const cryoGeo = new THREE.BufferGeometry()
  const cryoPosAttr = new THREE.BufferAttribute(cryoPos, 3).setUsage(THREE.DynamicDrawUsage)
  const cryoSizeAttr = new THREE.BufferAttribute(cryoSize, 1).setUsage(THREE.DynamicDrawUsage)
  const cryoOpacityAttr = new THREE.BufferAttribute(cryoOpacity, 1).setUsage(THREE.DynamicDrawUsage)
  cryoGeo.setAttribute('position', cryoPosAttr)
  cryoGeo.setAttribute('size', cryoSizeAttr)
  cryoGeo.setAttribute('opacity', cryoOpacityAttr)

  const cryoShaderMat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: puffTex },
      uVaporColor: { value: new THREE.Color('#ffffff') },
    },
    vertexShader: `
      attribute float size;
      attribute float opacity;
      varying float vOpacity;
      void main() {
        vOpacity = opacity;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (260.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uVaporColor;
      varying float vOpacity;
      void main() {
        if (vOpacity <= 0.01) discard;
        vec4 tex = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(uVaporColor, tex.a * vOpacity * 0.55);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  })
  const cryoPoints = new THREE.Points(cryoGeo, cryoShaderMat)
  group.add(cryoPoints)

  let cryoVenting = false

  // ── 9. DYNAMIC COMBUSTION FLAME LIGHTING ────────────────────────────────────
  const exhaustLight = new THREE.PointLight('#ffa233', 0, 58)
  group.add(exhaustLight)

  const secondaryGlowLight = new THREE.PointLight('#ff4800', 0, 44)
  group.add(secondaryGlowLight)

  // Reusable thrust & offset caches
  const thrustDir = new THREE.Vector3()
  const localBaseOffset = new THREE.Vector3()
  const localNozzleOffset = new THREE.Vector3()

  return {
    group,
    plumeGroup,

    setActive(v: boolean) {
      active = v
      if (!v) {
        plumeGroup.visible = false
        exhaustLight.intensity = 0
        secondaryGlowLight.intensity = 0
      }
    },

    setCryoVenting(v: boolean) {
      cryoVenting = v
    },

    update(
      dt: number,
      rocketPos: THREE.Vector3,
      rocketRot: THREE.Euler | THREE.Quaternion,
      throttle: number,
      altitudeM: number,
      _speedMps: number,
      elapsed: number,
      stageIndex = 0,
      nozzleBaseY = 0,
    ) {
      const effectiveThrottle = active ? Math.max(0.85, throttle) : throttle
      const isFiring = active && effectiveThrottle > 0.01
      const altitudeKm = altitudeM / 1000
      const isUpperStage = stageIndex > 0 || altitudeKm > 72.0
      const vacuumFactor = THREE.MathUtils.clamp((altitudeKm - 25.0) / 45.0, 0.0, 1.0)

      if (rocketRot instanceof THREE.Quaternion) {
        plumeGroup.quaternion.copy(rocketRot)
      } else {
        plumeGroup.quaternion.setFromEuler(rocketRot)
      }
      if (Math.abs(nozzleBaseY) > 0.001) {
        localBaseOffset.set(0, nozzleBaseY, 0).applyQuaternion(plumeGroup.quaternion)
        plumeGroup.position.copy(rocketPos).add(localBaseOffset)
      } else {
        plumeGroup.position.copy(rocketPos)
      }

      // Calculate downward thrust direction vector in world space
      thrustDir.set(0, -1, 0).applyQuaternion(plumeGroup.quaternion).normalize()

      if (!isFiring) {
        plumeGroup.visible = false
        exhaustLight.intensity = 0
        secondaryGlowLight.intensity = 0
      } else {
        plumeGroup.visible = true

        plumeUniforms.uTime.value = elapsed
        plumeUniforms.uThrottle.value = effectiveThrottle
        plumeUniforms.uVacuum.value = vacuumFactor

        // Tighten plume footprint once upper stage is active or side boosters have jettisoned (> 30 km)
        const plumeRadiusScale = (!isUpperStage && altitudeKm < 30.0) ? 1.0 : 0.62
        mainPlumeMesh.scale.set(plumeRadiusScale, 1.0, plumeRadiusScale)

        // Subtle translucent warm vacuum expansion glow in thin upper atmosphere/space
        vacuumPlumeMesh.visible = vacuumFactor > 0.35
        vacuumPlumeMesh.scale.setScalar(0.55 + vacuumFactor * 0.25)

        // Stage-specific nozzle configuration
        stage0ThroatMeshes.forEach(m => { m.visible = !isUpperStage && altitudeKm < 30.0 })
        stage1ThroatMeshes.forEach(m => { m.visible = isUpperStage || altitudeKm >= 30.0 })

        // Dynamic Flame Light Flickering (60 Hz high-frequency turbulent flicker)
        const flicker = 0.88 + Math.sin(elapsed * 58.0) * 0.08 + Math.random() * 0.12
        exhaustLight.position.copy(plumeGroup.position).addScaledVector(thrustDir, 1.4)
        exhaustLight.intensity = 34 * effectiveThrottle * flicker

        secondaryGlowLight.position.copy(plumeGroup.position).addScaledVector(thrustDir, 5.8)
        if (secondaryGlowLight.position.y < 0.2) secondaryGlowLight.position.y = 0.2
        secondaryGlowLight.intensity = 22 * effectiveThrottle * flicker
      }

      // ── UPDATE FIRE PARTICLES ──
      const fireToSpawn = isFiring ? Math.round(dt * 750 * effectiveThrottle) : 0
      let fireSpawned = 0
      const isVacuum = altitudeKm > 55
      const activeOffsets = (isUpperStage || altitudeKm >= 30.0) ? STAGE_1_NOZZLE_OFFSETS : STAGE_0_NOZZLE_OFFSETS

      for (let i = 0; i < FIRE_COUNT; i++) {
        if (fireLife[i] > 0) {
          fireLife[i] -= dt * (isVacuum ? 4.8 : 2.8)
          firePos[i * 3] += fireVel[i * 3] * dt
          firePos[i * 3 + 1] += fireVel[i * 3 + 1] * dt
          firePos[i * 3 + 2] += fireVel[i * 3 + 2] * dt

          const age = 1 - fireLife[i] / fireMaxLife[i]

          if (age < 0.20) {
            fireColor[i * 3] = 1.0
            fireColor[i * 3 + 1] = 0.98 - age * 0.3
            fireColor[i * 3 + 2] = 0.90 - age * 1.6
          } else if (age < 0.60) {
            fireColor[i * 3] = 1.0
            fireColor[i * 3 + 1] = Math.max(0.2, 0.78 - (age - 0.20) * 1.2)
            fireColor[i * 3 + 2] = Math.max(0, 0.35 - (age - 0.20) * 0.9)
          } else {
            const redFade = 1 - (age - 0.60) / 0.40
            fireColor[i * 3] = 0.88 * redFade
            fireColor[i * 3 + 1] = 0.10 * redFade
            fireColor[i * 3 + 2] = 0.02 * redFade
          }

          if (fireLife[i] <= 0) {
            firePos[i * 3 + 1] = -9999
          }
        } else if (fireSpawned < fireToSpawn && isFiring) {
          const n = activeOffsets[Math.floor(Math.random() * activeOffsets.length)]!
          localNozzleOffset.set(n[0], n[1] + nozzleBaseY, n[2]).applyQuaternion(plumeGroup.quaternion)

          firePos[i * 3] = rocketPos.x + localNozzleOffset.x
          firePos[i * 3 + 1] = rocketPos.y + localNozzleOffset.y
          firePos[i * 3 + 2] = rocketPos.z + localNozzleOffset.z

          const exitSpeed = 65 + Math.random() * 30
          const spreadFactor = 0.04 * (1.0 + vacuumFactor * 1.5)
          const spreadX = (Math.random() - 0.5) * exitSpeed * spreadFactor
          const spreadZ = (Math.random() - 0.5) * exitSpeed * spreadFactor

          fireVel[i * 3] = thrustDir.x * exitSpeed + spreadX
          fireVel[i * 3 + 1] = thrustDir.y * exitSpeed
          fireVel[i * 3 + 2] = thrustDir.z * exitSpeed + spreadZ

          fireLife[i] = 0.30 + Math.random() * 0.24
          fireMaxLife[i] = fireLife[i]
          fireSize[i] = 2.0 + Math.random() * 1.5

          fireColor[i * 3] = 1.0
          fireColor[i * 3 + 1] = 0.98
          fireColor[i * 3 + 2] = 0.92
          fireSpawned++
        }
      }

      // ── UPDATE SMOKE PARTICLES (Lower atmosphere < 28 km) ──
      const smokeAtmosphereFade = Math.max(0, 1 - altitudeKm / 28)
      const smokeToSpawn = isFiring && smokeAtmosphereFade > 0.02
        ? Math.round(dt * 550 * effectiveThrottle * smokeAtmosphereFade)
        : 0
      let smokeSpawned = 0

      for (let i = 0; i < SMOKE_COUNT; i++) {
        if (smokeLife[i] > 0) {
          smokeLife[i] -= dt * 0.72
          smokePos[i * 3] += smokeVel[i * 3] * dt
          smokePos[i * 3 + 1] += smokeVel[i * 3 + 1] * dt
          smokePos[i * 3 + 2] += smokeVel[i * 3 + 2] * dt

          smokeVel[i * 3] *= (1 - dt * 0.28)
          smokeVel[i * 3 + 1] += dt * 0.52
          smokeVel[i * 3 + 2] *= (1 - dt * 0.28)

          const age = 1 - smokeLife[i] / smokeMaxLife[i]
          const fadeIn = THREE.MathUtils.clamp(age / 0.1, 0, 1)
          const fadeOut = THREE.MathUtils.clamp((1 - age) / 0.45, 0, 1)
          smokeOpacity[i] = fadeIn * fadeOut * 0.72
          smokeSize[i] = (1.0 + age * 2.8) * smokeBaseSize[i]

          if (smokeLife[i] <= 0) {
            smokePos[i * 3 + 1] = -9999
            smokeOpacity[i] = 0
          }
        } else if (smokeSpawned < smokeToSpawn && isFiring) {
          smokePos[i * 3] = rocketPos.x + (Math.random() - 0.5) * 1.8
          smokePos[i * 3 + 1] = Math.max(0.1, rocketPos.y - 1.5)
          smokePos[i * 3 + 2] = rocketPos.z + (Math.random() - 0.5) * 1.8

          smokeVel[i * 3] = (Math.random() - 0.5) * 16.0
          smokeVel[i * 3 + 1] = -3.0 + Math.random() * 4.0
          smokeVel[i * 3 + 2] = (Math.random() - 0.5) * 16.0

          smokeLife[i] = 1.4 + Math.random() * 1.2
          smokeMaxLife[i] = smokeLife[i]
          smokeBaseSize[i] = 3.6 + Math.random() * 2.8
          smokeSize[i] = smokeBaseSize[i]
          smokeOpacity[i] = 0.0
          smokeSpawned++
        }
      }

      // ── UPDATE LAUNCH-PAD WATER DELUGE STEAM BURST (When near pad < 45m) ──
      const onPadFactor = Math.max(0, 1 - altitudeM / 45.0)
      const steamToSpawn = isFiring && onPadFactor > 0.01
        ? Math.round(dt * 360 * effectiveThrottle * onPadFactor)
        : 0
      let steamSpawned = 0

      for (let i = 0; i < STEAM_COUNT; i++) {
        if (steamLife[i] > 0) {
          steamLife[i] -= dt * 0.45
          steamPos[i * 3] += steamVel[i * 3] * dt
          steamPos[i * 3 + 1] += steamVel[i * 3 + 1] * dt
          steamPos[i * 3 + 2] += steamVel[i * 3 + 2] * dt

          // Radial drag on pad surface + gentle upward thermal billowing
          steamVel[i * 3] *= (1 - dt * 0.55)
          steamVel[i * 3 + 1] += dt * 1.8
          steamVel[i * 3 + 2] *= (1 - dt * 0.55)

          const age = 1 - steamLife[i] / steamMaxLife[i]
          const fadeIn = THREE.MathUtils.clamp(age / 0.15, 0, 1)
          const fadeOut = THREE.MathUtils.clamp((1 - age) / 0.55, 0, 1)
          steamOpacity[i] = fadeIn * fadeOut * 0.65
          steamSize[i] = (1.0 + age * 3.4) * steamBaseSize[i]

          if (steamLife[i] <= 0) {
            steamPos[i * 3 + 1] = -9999
            steamOpacity[i] = 0
          }
        } else if (steamSpawned < steamToSpawn && isFiring) {
          // Radial explosive blast across pad concrete surface
          const steamAngle = Math.random() * Math.PI * 2
          const spawnDist = 1.6 + Math.random() * 2.2
          const speed = 16 + Math.random() * 12

          steamPos[i * 3] = rocketPos.x + Math.cos(steamAngle) * spawnDist
          steamPos[i * 3 + 1] = 0.25 + Math.random() * 0.6
          steamPos[i * 3 + 2] = rocketPos.z + Math.sin(steamAngle) * spawnDist

          steamVel[i * 3] = Math.cos(steamAngle) * speed
          steamVel[i * 3 + 1] = 1.0 + Math.random() * 2.5
          steamVel[i * 3 + 2] = Math.sin(steamAngle) * speed

          steamLife[i] = 2.2 + Math.random() * 1.4
          steamMaxLife[i] = steamLife[i]
          steamBaseSize[i] = 5.2 + Math.random() * 3.4
          steamSize[i] = steamBaseSize[i]
          steamOpacity[i] = 0.0
          steamSpawned++
        }
      }

      // ── UPDATE CRYOGENIC LOX BOIL-OFF VENTING PLUMES ──
      const cryoToSpawn = cryoVenting ? Math.round(dt * 70) : 0
      let cryoSpawned = 0

      for (let i = 0; i < CRYO_COUNT; i++) {
        if (cryoLife[i] > 0) {
          cryoLife[i] -= dt * 0.75
          cryoPos[i * 3] += cryoVel[i * 3] * dt
          cryoPos[i * 3 + 1] += cryoVel[i * 3 + 1] * dt
          cryoPos[i * 3 + 2] += cryoVel[i * 3 + 2] * dt

          // Atmospheric drift & downward cold vapor tumble
          cryoVel[i * 3] *= (1 - dt * 0.4)
          cryoVel[i * 3 + 1] -= dt * 1.5 // Cold cryogenic vapor is denser than air
          cryoVel[i * 3 + 2] *= (1 - dt * 0.4)

          const age = 1 - cryoLife[i] / cryoMaxLife[i]
          const fadeIn = THREE.MathUtils.clamp(age / 0.12, 0, 1)
          const fadeOut = THREE.MathUtils.clamp((1 - age) / 0.50, 0, 1)
          cryoOpacity[i] = fadeIn * fadeOut * 0.58
          cryoSize[i] = (1.0 + age * 2.2) * cryoBaseSize[i]

          if (cryoLife[i] <= 0) {
            cryoPos[i * 3 + 1] = -9999
            cryoOpacity[i] = 0
          }
        } else if (cryoSpawned < cryoToSpawn && cryoVenting) {
          // Choose vent: 0 = interstage LOX relief vent (y ~ 9.6), 1 = upper tank vent (y ~ 14.5)
          const ventIdx = Math.random() < 0.5 ? 0 : 1
          const ventY = ventIdx === 0 ? 9.6 : 14.5
          const ventX = ventIdx === 0 ? 1.25 : -1.15
          const ventDirX = ventIdx === 0 ? 1 : -1

          cryoPos[i * 3] = rocketPos.x + ventX
          cryoPos[i * 3 + 1] = rocketPos.y + ventY
          cryoPos[i * 3 + 2] = rocketPos.z + (Math.random() - 0.5) * 0.2

          cryoVel[i * 3] = ventDirX * (3.5 + Math.random() * 2.5)
          cryoVel[i * 3 + 1] = -0.6 + (Math.random() - 0.5) * 0.8
          cryoVel[i * 3 + 2] = (Math.random() - 0.5) * 1.8

          cryoLife[i] = 1.3 + Math.random() * 0.8
          cryoMaxLife[i] = cryoLife[i]
          cryoBaseSize[i] = 0.55 + Math.random() * 0.45
          cryoSize[i] = cryoBaseSize[i]
          cryoOpacity[i] = 0.0
          cryoSpawned++
        }
      }

      // Mark attribute updates
      firePosAttr.needsUpdate = true
      fireColAttr.needsUpdate = true
      fireSizeAttr.needsUpdate = true
      smokePosAttr.needsUpdate = true
      smokeSizeAttr.needsUpdate = true
      smokeOpacityAttr.needsUpdate = true
      steamPosAttr.needsUpdate = true
      steamSizeAttr.needsUpdate = true
      steamOpacityAttr.needsUpdate = true
      cryoPosAttr.needsUpdate = true
      cryoSizeAttr.needsUpdate = true
      cryoOpacityAttr.needsUpdate = true
    },

    dispose() {
      puffTex.dispose()
      mainPlumeMat.dispose()
      mainPlumeGeo.dispose()
      vacuumPlumeMat.dispose()
      vacuumPlumeGeo.dispose()
      throatMat.dispose()
      throatGeo.dispose()
      fireGeo.dispose()
      fireMat.dispose()
      smokeGeo.dispose()
      smokeShaderMat.dispose()
      steamGeo.dispose()
      steamShaderMat.dispose()
      cryoGeo.dispose()
      cryoShaderMat.dispose()
      scene.remove(group)
    },
  }
}
