import * as THREE from 'three'

/**
 * ── PHOTOREALISTIC EARTH ATMOSPHERE STRATA & OZONE LAYER BREAKTHROUGH SYSTEM ──
 *
 * Authentic multi-layered aerospace phenomenon of puncturing the Earth's
 * Stratospheric Ozone Barrier (Ozonosfera, ~24 km) at hypersonic velocity:
 *
 * 1. Dual Fixed-Altitude Stratospheric Ozone Canopies (world space):
 *    - Anchored to real Earth curvature altitude (Primary O3 barrier at 24.0 km,
 *      Upper Ionization Veil at 26.5 km) rather than floating along with the rocket.
 *    - Rocket visibly closes in from below (16–23 km), PHYSICALLY PUNCHES THROUGH
 *      the glowing cyan-sapphire photochemical layer at 24 km, tears open an expanding
 *      circulation rupture aperture right around the nosecone, and leaves the pierced
 *      layer falling away beneath its exhaust plume!
 *
 * 2. Expanding Supersonic Sonic-Boom Shockwave Discs:
 *    - Smooth Gaussian-profile luminous pressure wavefronts (NO hard geometric edges)
 *      erupting radially across the ozone stratum along Earth's tangent horizon.
 *
 * 3. Vehicle Nose Bow-Shock & Prandtl-Glauert Vapor Cones (Rocket-aligned 0..18m):
 *    - Stagnation point plasma bow-shock cap fitted cleanly to the 18.0m fairing apex.
 *    - Turbulent Mach shock cone veil wrapping the payload fairing & core shoulder.
 *    - Feathered Prandtl-Glauert vapor collars at fairing shoulder (13.6m) & booster nose (8.2m).
 *
 * 4. Total Deep-Space Clearance (> 32 km):
 *    - Every ozone layer mesh and glow dissolves completely above 32 km, leaving
 *      100% crisp black deep space, stars, Earth globe below, and distant Moon.
 */

export interface AtmosphereStrataController {
  group: THREE.Group
  rocketAttachmentGroup: THREE.Group
  update: (
    cameraPosition: THREE.Vector3,
    altitudeKm: number,
    speedMps: number,
    dt: number,
    elapsed: number,
    rocketPos?: THREE.Vector3,
    rocketQuat?: THREE.Quaternion,
  ) => void
  getCurrentLayerName: (altitudeKm: number) => { name: string; detail: string; color: string }
  dispose: () => void
}

const EARTH_RADIUS_M = 6_371_000
const OZONE_LAYER_ALTS_M = [19_500, 21_800, 24_000, 26_200, 28_500] as const
const MEMBRANE_HALF_SIZE = 7_500 // 15 km wide stratospheric canopy per stratum

export function createAtmosphereStrata(): AtmosphereStrataController {
  const group = new THREE.Group()
  group.name = 'AtmosphereStrata'
  group.visible = false

  const rocketAttachmentGroup = new THREE.Group()
  rocketAttachmentGroup.name = 'RocketAerodynamicFX'
  rocketAttachmentGroup.visible = false

  // Shared shader uniforms
  const strataUniforms = {
    uTime: { value: 0 },
    uIntensity: { value: 0 },
    uAltitudeKm: { value: 0 },
    uMach: { value: 1.0 },
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. VEHICLE BOW-SHOCK, MACH CONE & PRANDTL-GLAUERT COLLARS (y = 0..18.2m)
  // ═══════════════════════════════════════════════════════════════════════════

  // A. Hypersonic Stagnation Bow-Shock Plasma Cap at real nosecone apex (y = 18.05m)
  const bowShockMat = new THREE.ShaderMaterial({
    uniforms: strataUniforms,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vLocalPos;
      void main() {
        vLocalPos = position;
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vLocalPos;
      void main() {
        if (uIntensity <= 0.01) discard;
        // Hemisphere falloff: hot nose cap tapering smoothly downward
        float topMask = smoothstep(-0.35, 0.75, vLocalPos.y);
        float limb = pow(max(0.0, dot(vNormal, vViewDir)), 1.35);
        float rim = pow(1.0 - max(0.0, abs(dot(vNormal, vViewDir))), 1.8);
        float flicker = 0.88 + sin(uTime * 52.0) * 0.12;

        vec3 cyanCore = vec3(0.05, 0.95, 1.0);
        vec3 violetIon = vec3(0.58, 0.35, 1.0);
        vec3 whiteHot = vec3(1.0, 0.99, 1.0);

        vec3 col = mix(violetIon, cyanCore, limb);
        col = mix(col, whiteHot, pow(limb, 2.5) * 0.85);

        float alpha = (limb * 0.72 + rim * 0.45) * topMask * uIntensity * flicker * 0.92;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  })
  const bowShockGeo = new THREE.SphereGeometry(0.92, 24, 18)
  bowShockGeo.scale(1.0, 1.45, 1.0)
  const bowShockMesh = new THREE.Mesh(bowShockGeo, bowShockMat)
  bowShockMesh.position.set(0, 17.65, 0)
  rocketAttachmentGroup.add(bowShockMesh)

  // B. Flared Supersonic Mach Shock Cone Veil (Nose apex y = 18.2m down to y = 2.0m)
  const machConeMat = new THREE.ShaderMaterial({
    uniforms: strataUniforms,
    vertexShader: `
      uniform float uTime;
      uniform float uIntensity;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec3 p = position;

        // Smooth parabolic shockwave boundary away from fairing nose
        float flare = pow(1.0 - uv.y, 1.35) * 0.38;
        p.xz *= (1.0 + flare);

        // Aerodynamic shear flutter flowing downward along body
        float flutter = sin((1.0 - uv.y) * 18.0 - uTime * 42.0) * cos(p.x * 2.5 + p.z * 2.5) * 0.08 * uIntensity;
        p.xz += normalize(p.xz + 0.001) * flutter;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uIntensity;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        if (uIntensity <= 0.01) discard;

        // Cylinder uv.y: 1.0 at top nose apex, 0.0 at skirt base
        float distFromNose = 1.0 - vUv.y;
        float theta = vUv.x * 6.283185;

        // 1. Subtle supersonic shear pulse along Mach envelope (no repetitive zebra stripes)
        float shearPulse = pow(sin(distFromNose * 10.0 - uTime * 22.0 + theta * 2.0) * 0.5 + 0.5, 4.0) * (1.0 - distFromNose);

        // 2. Ionized photochemical ozone slipstream filaments
        float streak1 = sin(theta * 11.0 + sin(distFromNose * 8.0 - uTime * 11.0) * 2.1) * 0.5 + 0.5;
        float streak2 = sin(theta * 23.0 - distFromNose * 6.0 - uTime * 17.0) * 0.5 + 0.5;
        float filaments = pow(streak1 * 0.62 + streak2 * 0.38, 1.8);

        // 3. Soft limb scattering (no hard plastic wall)
        float ndv = abs(dot(normalize(vNormal), normalize(vViewDir)));
        float rimGlow = pow(1.0 - ndv, 1.45) * smoothstep(0.0, 0.28, ndv + 0.12);

        // 4. Photochemical O3* / N2+ Emission Colors
        vec3 whiteHot  = vec3(0.96, 1.0, 1.0);
        vec3 electricCyan = vec3(0.0, 0.92, 1.0);
        vec3 deepSapphire = vec3(0.16, 0.42, 1.0);
        vec3 ozoneViolet  = vec3(0.62, 0.28, 0.96);

        vec3 col = mix(electricCyan, deepSapphire, smoothstep(0.05, 0.85, distFromNose));
        col = mix(col, ozoneViolet, rimGlow * 0.48);
        col = mix(col, whiteHot, shearPulse * 0.55);

        // Feather smoothly at nosecone entry and aft skirt wake
        float noseEntry = smoothstep(0.02, 0.14, distFromNose);
        float tailFade = 1.0 - smoothstep(0.62, 1.0, distFromNose);
        float alpha = (rimGlow * 0.64 + filaments * 0.40 + shearPulse * 0.24) * noseEntry * tailFade * uIntensity * 0.72;

        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
  // Cylinder top radius 0.38 at y = 18.2m, bottom radius 4.1 at y = 2.0m
  const machConeGeo = new THREE.CylinderGeometry(0.38, 4.1, 16.2, 48, 20, true)
  machConeGeo.translate(0, 10.1, 0)
  const machConeMesh = new THREE.Mesh(machConeGeo, machConeMat)
  rocketAttachmentGroup.add(machConeMesh)

  // C. Feathered Prandtl-Glauert Vapor / Ionization Shock Collars (Fairing shoulder y=13.5m & Booster nose y=8.2m)
  function createVaporCollar(yPos: number, diameter: number, tintWeight: number): THREE.Mesh {
    const cMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: strataUniforms.uTime,
        uIntensity: strataUniforms.uIntensity,
        uTint: { value: tintWeight },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uIntensity;
        uniform float uTint;
        varying vec2 vUv;
        void main() {
          if (uIntensity <= 0.01) discard;
          vec2 d = vUv - vec2(0.5);
          float r = length(d) * 2.0; // 0 center, 1 edge
          if (r > 1.0) discard;

          float ang = atan(d.y, d.x);
          float rays = 0.80 + 0.20 * sin(ang * 18.0 + uTime * 22.0) * sin(ang * 11.0 - uTime * 15.0);

          // Gaussian Prandtl-Glauert vapor ring peaked at r ~ 0.42, completely feathered to 0 at edge r=1.0
          float outerMask = 1.0 - smoothstep(0.65, 1.0, r);
          float innerClear = smoothstep(0.14, 0.32, r);
          float shockPeak = exp(-pow((r - 0.42) / 0.18, 2.0));

          vec3 vaporWhite = vec3(0.88, 0.97, 1.0);
          vec3 cyanShock  = vec3(0.05, 0.90, 1.0);
          vec3 col = mix(vaporWhite, cyanShock, uTint * (0.45 + 0.55 * r));

          float pulse = 0.88 + sin(uTime * 34.0) * 0.12;
          float alpha = shockPeak * innerClear * outerMask * rays * pulse * uIntensity * 0.56;
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    const cGeo = new THREE.PlaneGeometry(diameter, diameter)
    cGeo.rotateX(Math.PI / 2)
    cGeo.translate(0, yPos, 0)
    return new THREE.Mesh(cGeo, cMat)
  }

  const fairingCollarMesh = createVaporCollar(13.6, 8.2, 0.55)
  const boosterCollarMesh = createVaporCollar(8.2, 10.6, 0.85)
  rocketAttachmentGroup.add(fairingCollarMesh, boosterCollarMesh)

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. DUAL STRATOSPHERIC OZONE HORIZON CANOPIES & SUPERSONIC RUPTURE DISCS
  // ═══════════════════════════════════════════════════════════════════════════

  function createOzoneCanopyLayer(altM: number, tintShift: number) {
    const uniforms = {
      uTime: strataUniforms.uTime,
      uIntensity: strataUniforms.uIntensity,
      uBreachProgress: { value: 0.0 },
      uHoleOffsetUv: { value: new THREE.Vector2(0, 0) },
      uTintShift: { value: tintShift },
    }

    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vLocalPos;
        void main() {
          vUv = uv;
          vec3 p = position;
          // Subtle spherical Earth curvature droop at outer edges (-x^2 / 2R)
          float distSq = p.x * p.x + p.z * p.z;
          p.y -= distSq / (2.0 * ${EARTH_RADIUS_M.toFixed(1)});
          vLocalPos = p;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uIntensity;
        uniform float uBreachProgress;
        uniform vec2 uHoleOffsetUv;
        uniform float uTintShift;
        varying vec2 vUv;
        varying vec3 vLocalPos;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise2(p);
            p *= 2.05;
            a *= 0.5;
          }
          return v;
        }

        void main() {
          if (uIntensity <= 0.008) discard;

          // World-meter offset relative to exact rocket puncture coordinate
          vec2 dMeters = vLocalPos.xz - uHoleOffsetUv;
          float rMeters = length(dMeters);
          float swirlAng = atan(dMeters.y, dMeters.x);

          // 1. Stratospheric photochemical O3 cloud filaments (organic domain-warped nebula, ZERO repeating bullseye!)
          vec2 uvFlow = vLocalPos.xz * 0.0014 + vec2(uTime * 0.035, -uTime * 0.02);
          float n1 = fbm(uvFlow + fbm(uvFlow * 2.2));
          float n2 = fbm(vLocalPos.xz * 0.0042 - vec2(uTime * 0.05, uTime * 0.03));
          float clouds = clamp(n1 * 0.72 + n2 * 0.36, 0.0, 1.0);

          // 2. Dynamic organic supersonic puncture portal
          // Before piercing: tight glowing compression point (r ~ 4m)
          // At & after piercing: tears open into an organic turbulent vortex hole (120m+)
          float openFactor = smoothstep(0.0, 1.0, uBreachProgress);
          float angWobble = (n2 - 0.5) * 18.0 + sin(swirlAng * 5.0 - uTime * 4.5) * 4.5;
          float baseR = mix(3.5, 118.0, pow(openFactor, 1.05));
          float punctureR = max(2.0, baseR + angWobble * openFactor);
          float holeMask = smoothstep(punctureR * 0.55, punctureR * 1.18, rMeters);

          // Local turbulent vortex collar right around the torn ozone edge
          float rimWidth = mix(12.0, 26.0, openFactor);
          float rimDist = abs(rMeters - punctureR * 1.04);
          float breachRim = exp(-pow(rimDist / rimWidth, 2.0)) * (0.45 + 0.55 * clouds) * (0.65 + 0.35 * sin(openFactor * 3.14159));
          float vortexStreamer = (0.72 + 0.28 * sin(swirlAng * 7.0 - rMeters * 0.045 + uTime * 7.5)) * exp(-rimDist / 45.0);

          // 3. Expansive planetary horizon fade (zero quad edge anywhere)
          float distFromCenter = length(vLocalPos.xz) / ${MEMBRANE_HALF_SIZE.toFixed(1)};
          float horizonFade = 1.0 - smoothstep(0.28, 0.96, distFromCenter);
          if (horizonFade <= 0.005) discard;

          // 4. Photochemical Ozone Emission Palette (Vibrant Cyan -> Deep Stratospheric Blue -> Ultraviolet)
          vec3 sapphireBase = vec3(0.05, 0.38, 0.96);
          vec3 electricCyan = vec3(0.0, 0.95, 1.0);
          vec3 ozoneViolet  = vec3(0.46, 0.24, 0.96);
          vec3 whiteRim     = vec3(0.95, 1.0, 1.0);

          vec3 layerColor = mix(sapphireBase, electricCyan, smoothstep(0.25, 0.78, clouds));
          layerColor = mix(layerColor, ozoneViolet, uTintShift * 0.52 + (1.0 - clouds) * 0.18);
          layerColor = mix(layerColor, electricCyan, exp(-rMeters / 220.0) * 0.55);
          layerColor = mix(layerColor, whiteRim, clamp(breachRim * 0.85, 0.0, 1.0));

          // Middle core stratum (24 km) shines brightest; outer strata provide lush atmospheric depth
          float layerWeight = mix(1.0, 0.68, abs(uTintShift - 0.5) * 2.0);
          float veilDensity = smoothstep(0.18, 0.88, clouds);
          float baseVeilAlpha = (0.28 + veilDensity * 0.72) * horizonFade * holeMask * layerWeight;
          float tearAlpha = (breachRim * 0.92 + vortexStreamer * breachRim * 0.55) * horizonFade;

          float totalAlpha = (baseVeilAlpha * 0.44 + tearAlpha * 0.65) * uIntensity;
          gl_FragColor = vec4(layerColor, clamp(totalAlpha, 0.0, 0.90));
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })

    const geo = new THREE.PlaneGeometry(MEMBRANE_HALF_SIZE * 2, MEMBRANE_HALF_SIZE * 2, 32, 32)
    geo.rotateX(-Math.PI / 2)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.renderOrder = 4
    group.add(mesh)

    return { altM, mesh, geo, mat, uniforms }
  }

  const ozoneLayers = OZONE_LAYER_ALTS_M.map((altM, idx) =>
    createOzoneCanopyLayer(altM, idx / Math.max(1, OZONE_LAYER_ALTS_M.length - 1)),
  )

  // B. Feathered Radial Sonic Boom Shockwave Discs (Clean single-crest Gaussian pressure pulse)
  const RING_COUNT = 2
  interface ShockWaveData {
    mesh: THREE.Mesh
    mat: THREE.ShaderMaterial
    phaseOffset: number
  }
  const shockWaves: ShockWaveData[] = []
  const waveGeo = new THREE.PlaneGeometry(2, 2)
  waveGeo.rotateX(-Math.PI / 2)

  for (let r = 0; r < RING_COUNT; r++) {
    const sMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: strataUniforms.uTime,
        uIntensity: strataUniforms.uIntensity,
        uFade: { value: 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uIntensity;
        uniform float uFade;
        varying vec2 vUv;
        void main() {
          if (uIntensity <= 0.01 || uFade <= 0.01) discard;
          vec2 d = vUv - vec2(0.5);
          float r = length(d) * 2.0; // 0..1
          if (r > 1.0) discard;

          float ang = atan(d.y, d.x);
          float wisp = 0.78 + 0.22 * sin(ang * 9.0 + uTime * 8.0) * cos(ang * 5.0 - uTime * 5.0);

          // Single smooth feathered sonic boom crest peaking at r=0.80 (NO hard inner echo ring!)
          float outerCut = 1.0 - smoothstep(0.86, 1.0, r);
          float shockRing = exp(-pow((r - 0.80) / 0.11, 2.0));

          vec3 cyanWave = vec3(0.05, 0.94, 1.0);
          vec3 whiteCrest = vec3(1.0, 1.0, 1.0);
          vec3 col = mix(cyanWave, whiteCrest, shockRing * 0.75);

          float alpha = shockRing * outerCut * wisp * uFade * uIntensity * 0.44;
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })

    const wMesh = new THREE.Mesh(waveGeo, sMat)
    wMesh.renderOrder = 5
    group.add(wMesh)
    shockWaves.push({
      mesh: wMesh,
      mat: sMat,
      phaseOffset: r / RING_COUNT,
    })
  }

  // Reusable math temporaries (zero per-frame heap allocation)
  const UP_AXIS = new THREE.Vector3(0, 1, 0)
  const tmpUp = new THREE.Vector3()
  const tmpQuat = new THREE.Quaternion()
  const tmpOzonePos = new THREE.Vector3()
  const tmpDelta = new THREE.Vector3()
  const tmpRight = new THREE.Vector3()
  const tmpFwd = new THREE.Vector3()

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. CONTROLLER UPDATE & TRUE PLANETARY-ALTITUDE BREAKTHROUGH SEQUENCING
  // ═══════════════════════════════════════════════════════════════════════════
  return {
    group,
    rocketAttachmentGroup,

    update(
      _cameraPosition: THREE.Vector3,
      altitudeKm: number,
      speedMps: number,
      _dt: number,
      elapsed: number,
      rocketPos?: THREE.Vector3,
      _rocketQuat?: THREE.Quaternion,
    ) {
      strataUniforms.uTime.value = elapsed
      strataUniforms.uAltitudeKm.value = altitudeKm
      strataUniforms.uMach.value = Math.max(1.0, speedMps / 340)

      // Active during Stratospheric Ozone Penetration (14 km .. 32 km)
      if (altitudeKm >= 14.0 && altitudeKm <= 32.0) {
        const progress = (altitudeKm - 14.0) / 18.0
        const intensity = Math.sin(progress * Math.PI)
        strataUniforms.uIntensity.value = intensity

        group.visible = true
        rocketAttachmentGroup.visible = true
        bowShockMesh.visible = intensity > 0.05
        machConeMesh.visible = intensity > 0.04
        fairingCollarMesh.visible = intensity > 0.10
        boosterCollarMesh.visible = intensity > 0.14
        for (const layer of ozoneLayers) layer.mesh.visible = intensity > 0.03

        if (rocketPos) {
          // Local planetary radial up vector at rocket's downrange position
          tmpUp.set(rocketPos.x, rocketPos.y + EARTH_RADIUS_M, rocketPos.z).normalize()
          tmpQuat.setFromUnitVectors(UP_AXIS, tmpUp)

          // Build local tangent basis to track puncture hole directly at rocket's X/Z crossing
          tmpRight.set(1, 0, 0).applyQuaternion(tmpQuat)
          tmpFwd.set(0, 0, 1).applyQuaternion(tmpQuat)

          // Anchor each Stratospheric Ozone canopy at its TRUE planetary altitude
          for (const layer of ozoneLayers) {
            tmpOzonePos
              .copy(tmpUp)
              .multiplyScalar(EARTH_RADIUS_M + layer.altM)
            tmpOzonePos.y -= EARTH_RADIUS_M
            layer.mesh.position.copy(tmpOzonePos)
            layer.mesh.quaternion.copy(tmpQuat)

            tmpDelta.copy(rocketPos).sub(tmpOzonePos)
            layer.uniforms.uHoleOffsetUv.value.set(
              tmpDelta.dot(tmpRight),
              tmpDelta.dot(tmpFwd),
            )
            // Puncture hole begins tearing open as nose touches 1.2 km beneath each stratum
            const breachKmStart = layer.altM / 1_000 - 1.2
            const breach = THREE.MathUtils.clamp((altitudeKm - breachKmStart) / 4.8, 0.0, 1.0)
            layer.uniforms.uBreachProgress.value = breach
          }

          // Expanding Gaussian supersonic sonic-boom discs right at the ozone breach plane!
          // Active most violently between 19 km and 30 km as nose pierces successive strata
          const ringStrength = Math.sin(THREE.MathUtils.clamp((altitudeKm - 18.5) / 12.0, 0, 1) * Math.PI)
          for (let i = 0; i < RING_COUNT; i++) {
            const sr = shockWaves[i]!
            const cycle = (elapsed * 1.45 + sr.phaseOffset) % 1.0
            const currentRadius = 6.0 + cycle * 95.0 // Expands cleanly from 6m to 101m
            const fade = Math.sin(cycle * Math.PI) * ringStrength

            // Track breach altitude cleanly around rocket crossing
            const ringAltM = THREE.MathUtils.clamp(altitudeKm * 1_000, 20_000, 28_500)
            tmpDelta.copy(tmpUp).multiplyScalar(EARTH_RADIUS_M + ringAltM)
            tmpDelta.y -= EARTH_RADIUS_M

            sr.mesh.position.copy(tmpDelta)
            sr.mesh.quaternion.copy(tmpQuat)
            sr.mesh.scale.setScalar(currentRadius)
            sr.mat.uniforms.uFade.value = fade
            sr.mesh.visible = intensity > 0.06 && fade > 0.02
          }
        }
      } else {
        // Above 32 km (Mesosphere & Deep Space): Total atmospheric clearance — zero leftover blue halo!
        strataUniforms.uIntensity.value = 0.0
        group.visible = false
        rocketAttachmentGroup.visible = false
        bowShockMesh.visible = false
        machConeMesh.visible = false
        fairingCollarMesh.visible = false
        boosterCollarMesh.visible = false
        for (const layer of ozoneLayers) layer.mesh.visible = false
        for (const sr of shockWaves) {
          sr.mesh.visible = false
          sr.mat.uniforms.uFade.value = 0.0
        }
      }
    },

    getCurrentLayerName(altitudeKm: number): { name: string; detail: string; color: string } {
      if (altitudeKm < 12) {
        return {
          name: 'TROPOSFERA',
          detail: '0–12 km · Ob-havo, zich bulutlar va Yer manzarasi',
          color: '#38bdf8',
        }
      }
      if (altitudeKm < 35) {
        return {
          name: 'STRATOSFERA & OZON QATLAMI',
          detail: '15–35 km · Ozonosfera (O3) to‘sig‘i gipertovushda yorib o‘tilmoqda',
          color: '#00f0ff',
        }
      }
      if (altitudeKm < 85) {
        return {
          name: 'MEZOSFERA',
          detail: '50–85 km · O‘ta siyrak atmosfera (-90°C), koinot qorong‘uligi',
          color: '#818cf8',
        }
      }
      if (altitudeKm < 120) {
        return {
          name: 'TERMOSFERA & KARMAN CHIZIG‘I',
          detail: '100 km · Rasmiy Koinot chegarasi, vaznsizlik va orbitaga chiqish',
          color: '#c084fc',
        }
      }
      return {
        name: 'YER ATROFI ORBITASI (LEO)',
        detail: '180 km · Gravitatsion orbital muvozanat (28 000 km/soat)',
        color: '#4ade80',
      }
    },

    dispose() {
      bowShockGeo.dispose()
      bowShockMat.dispose()
      machConeGeo.dispose()
      machConeMat.dispose()
      fairingCollarMesh.geometry.dispose()
      ;(fairingCollarMesh.material as THREE.Material).dispose()
      boosterCollarMesh.geometry.dispose()
      ;(boosterCollarMesh.material as THREE.Material).dispose()
      for (const layer of ozoneLayers) {
        layer.geo.dispose()
        layer.mat.dispose()
      }
      waveGeo.dispose()
      for (const sr of shockWaves) sr.mat.dispose()
    },
  }
}
