import * as THREE from 'three'

/**
 * ── PHOTOREALISTIC PROCEDURAL TROPOSPHERE CLOUD CANOPY & UNDERCAST ──────────
 * High-fidelity atmospheric cloud system replacing primitive 2D billboard cards:
 *
 * 1. Troposphere Cloud Canopy Dome (Viewed from Ground & Ascent, 0 km – 4.5 km):
 *    - Expansive celestial hemisphere canopy (14,000m radius) hugging the atmospheric boundary.
 *    - Domain-Warped Fractal Brownian Motion (FBM) with organic Inigo Quilez turbulence.
 *    - Real-world atmospheric perspective foreshortening: clouds naturally compress toward the horizon.
 *    - Authentic solar rim lighting: morning sunlight gilds cloud crests with warm gold;
 *      shaded bases exhibit natural cool atmospheric ambient sky occlusion.
 *    - Natural open sky clearings: twilight indigo zenith, sunrise apricots, and stars show through.
 *    - Continuous fluid wind drift: slow, majestic tropospheric motion.
 *    - ZERO flat 2D card billboards, ZERO HTML div smudges, 100% continuous celestial sky.
 *
 * 2. Planetary Undercast Sea of Clouds (Viewed from Above, 2.5 km – 22 km):
 *    - Expansive cloud blanket stretching to the planetary horizon.
 *    - FrontSide only: strictly invisible from below ground, perfectly visible when climbing aloft.
 *    - Seamlessly transitions into the NASA orbital Earth globe in the upper stratosphere.
 */

export interface TroposphereCloudSystem {
  group: THREE.Group
  update: (dt: number, altitudeKm: number, rocketPos: THREE.Vector3, elapsed: number) => void
  dispose: () => void
}

export function createTroposphereCloudSystem(): TroposphereCloudSystem {
  const group = new THREE.Group()
  group.name = 'TroposphereClouds'

  // ── 1. PROCEDURAL DOMAIN-WARPED TROPOSPHERIC CLOUD CANOPY SHADER ──────────
  const canopyUniforms = {
    uSunDir: { value: new THREE.Vector3(-0.68, 0.22, -0.70).normalize() },
    uSunColor: { value: new THREE.Color('#ffe8c8') },
    uSkyZenith: { value: new THREE.Color('#081426') },
    uSkyHorizon: { value: new THREE.Color('#78382c') },
    uAltitudeKm: { value: 0 },
    uTime: { value: 0 },
  }

  const canopyMat = new THREE.ShaderMaterial({
    uniforms: canopyUniforms,
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyZenith;
      uniform vec3 uSkyHorizon;
      uniform float uAltitudeKm;
      uniform float uTime;
      varying vec3 vWorldPos;

      // Fast, artifact-free 2D Simplex/Gradient Noise
      vec2 hash2(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
      }

      float gnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
              dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
          mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
              dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      // 4-octave Fractional Brownian Motion (FBM)
      float fbm(vec2 p) {
        float f = 0.0;
        mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
        f += 0.5000 * gnoise(p); p = m * p;
        f += 0.2500 * gnoise(p); p = m * p;
        f += 0.1250 * gnoise(p); p = m * p;
        f += 0.0625 * gnoise(p);
        return f * 0.5 + 0.5; // Normalized to 0.0 .. 1.0
      }

      // Domain-warped cloud synthesis (Inigo Quilez natural fluid turbulence)
      float cloudDensity(vec2 p) {
        vec2 q = vec2(fbm(p + vec2(0.0, 0.0)), fbm(p + vec2(5.2, 1.3)));
        vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2)), fbm(p + 3.0 * q + vec2(8.3, 2.8)));
        return fbm(p + 2.5 * r);
      }

      void main() {
        vec3 dir = normalize(vWorldPos);
        float y = dir.y;

        // Render upper hemisphere (above horizon)
        if (y < 0.012) discard;

        // Altitude fade: canopy smoothly fades out as vehicle passes through cloud layer into stratosphere
        float altFade = smoothstep(4.2, 1.6, uAltitudeKm);
        if (altFade <= 0.005) discard;

        // Natural stereographic sky projection:
        // As y approaches horizon, coordinates expand smoothly, creating true natural perspective foreshortening
        vec2 skyUv = (dir.xz / (y + 0.18)) * 0.36;
        vec2 wind = vec2(uTime * 0.0016, uTime * 0.0008);
        vec2 p = skyUv * 2.6 + wind;

        // Domain-warped cumulus density
        float density = cloudDensity(p);

        // Natural cumulus threshold: sharp billowing cauliflower edges with generous open sky gaps
        float cloudMask = smoothstep(0.44, 0.74, density);
        if (cloudMask <= 0.005) discard;

        // Directional sunlight self-shadowing & rim lighting on sunward crests
        vec2 sunStep = normalize(uSunDir.xz) * 0.055;
        float densityOffset = cloudDensity(p - sunStep);
        float sunFacing = max(0.0, density - densityOffset) * 2.8;

        // Forward Mie scattering (silver lining glint when looking toward sunrise)
        float sunDot = max(0.0, dot(dir, uSunDir));
        float forwardGlow = pow(sunDot, 5.0) * 0.45;

        // Authentic atmospheric color palette:
        // Warm golden-white on sunlit tops
        vec3 sunLit = uSunColor * (1.08 + sunFacing * 0.90 + forwardGlow);
        // Cool ambient sky tint on shadowed bases
        vec3 ambientShade = mix(uSkyHorizon, uSkyZenith, smoothstep(0.05, 0.65, y)) * 1.35;
        // Body color
        vec3 cloudColor = mix(ambientShade, sunLit, smoothstep(0.08, 0.62, density + sunFacing * 0.35));

        // Atmospheric Rayleigh haze blending near the distant horizon
        float horizonHaze = 1.0 - smoothstep(0.03, 0.28, y);
        cloudColor = mix(cloudColor, uSkyHorizon * 1.15, horizonHaze * 0.70);

        // Smooth natural alpha envelope
        float horizonFade = smoothstep(0.015, 0.10, y);
        float alpha = cloudMask * horizonFade * altFade * 0.94;

        gl_FragColor = vec4(cloudColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
  })

  // Atmospheric Cloud Canopy Dome (14,000m radius hemisphere)
  const canopyGeo = new THREE.SphereGeometry(14000, 64, 32)
  const canopyMesh = new THREE.Mesh(canopyGeo, canopyMat)
  canopyMesh.renderOrder = 0
  group.add(canopyMesh)

  // ── 2. PLANETARY UNDERCAST SEA OF CLOUDS (VIEWED ONLY FROM ABOVE, > 2.2 km) ─
  const undercastMat = new THREE.ShaderMaterial({
    uniforms: {
      uAltitudeKm: canopyUniforms.uAltitudeKm,
      uTime: canopyUniforms.uTime,
      uSunDir: canopyUniforms.uSunDir,
      uSunColor: canopyUniforms.uSunColor,
      uSkyHorizon: canopyUniforms.uSkyHorizon,
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uAltitudeKm;
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyHorizon;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      // 2D Simplex/Gradient Noise
      vec2 hash2(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
      }

      float gnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
              dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
          mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
              dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float f = 0.0;
        mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
        f += 0.5000 * gnoise(p); p = m * p;
        f += 0.2500 * gnoise(p); p = m * p;
        f += 0.1250 * gnoise(p); p = m * p;
        f += 0.0625 * gnoise(p);
        return f * 0.5 + 0.5;
      }

      void main() {
        // Appears smoothly as the rocket climbs above the cloud tops (> 2.0 km)
        float aboveFade = smoothstep(2.0, 4.2, uAltitudeKm);
        if (aboveFade <= 0.005) discard;

        // Fades smoothly into deep space (> 22 km) where orbital Earth globe takes over
        float spaceFade = smoothstep(22.0, 12.0, uAltitudeKm);
        float visibleAlpha = aboveFade * spaceFade;
        if (visibleAlpha <= 0.005) discard;

        // Continuous world-coordinate planetary cloud coordinates
        vec2 p = (vWorldPos.xz + vec2(uTime * 1.8, uTime * 0.9)) * 0.00016;

        // Multi-scale procedural cloud blanket billows
        float b1 = fbm(p * 2.2);
        float b2 = fbm(p * 5.4 + vec2(2.4, 1.7));
        float cloudDensity = b1 * 0.70 + b2 * 0.30;

        if (cloudDensity < 0.22) discard;

        // Sunlit cloud tops vs shaded valleys
        vec3 sunLit = uSunColor * 1.15;
        vec3 valleyShade = vec3(0.52, 0.62, 0.76);
        vec3 col = mix(valleyShade, sunLit, smoothstep(0.28, 0.72, cloudDensity));

        // Distant planetary horizon haze
        float distToCam = length(vWorldPos - cameraPosition);
        float rimHaze = smoothstep(8000.0, 32000.0, distToCam);
        col = mix(col, vec3(0.24, 0.56, 0.94), rimHaze * 0.68);

        float alpha = smoothstep(0.22, 0.58, cloudDensity) * 0.88 * visibleAlpha;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide, // Strictly visible ONLY from above
  })

  // Planetary Undercast Plane (80,000m x 80,000m at cloud top altitude 2,400m)
  const undercastGeo = new THREE.PlaneGeometry(80000, 80000, 32, 32)
  const undercastMesh = new THREE.Mesh(undercastGeo, undercastMat)
  undercastMesh.rotation.x = -Math.PI / 2
  undercastMesh.position.set(0, 2400, 0)
  undercastMesh.renderOrder = 0
  group.add(undercastMesh)

  return {
    group,

    update(_dt: number, altitudeKm: number, rocketPos: THREE.Vector3, elapsed: number) {
      canopyUniforms.uAltitudeKm.value = altitudeKm
      canopyUniforms.uTime.value = elapsed
      undercastMat.uniforms.uAltitudeKm.value = altitudeKm
      undercastMat.uniforms.uTime.value = elapsed

      // Keep canopy and undercast smoothly anchored beneath the ascending rocket
      canopyMesh.position.x = rocketPos.x * 0.45
      canopyMesh.position.z = rocketPos.z * 0.45
      undercastMesh.position.x = rocketPos.x * 0.85
      undercastMesh.position.z = rocketPos.z * 0.85
    },

    dispose() {
      canopyMat.dispose()
      canopyGeo.dispose()
      undercastMat.dispose()
      undercastGeo.dispose()
    },
  }
}
