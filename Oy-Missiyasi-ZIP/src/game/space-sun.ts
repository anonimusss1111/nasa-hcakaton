import * as THREE from 'three'

/**
 * ── PHOTOREALISTIC DEEP-SPACE SUN, CORONA & SOLAR RAYS ("QUYOSH NURI") ──────
 * Authentic astrophysical solar rendering for orbital and upper-atmospheric flight:
 * 1. Blinding Incandescent Solar Disc: Pure white photosphere with high-intensity emissive core.
 * 2. Multi-spectral Solar Corona: Exponential coronal halo (blinding white-gold -> amber -> outer peach).
 * 3. Cinematic 8-Point Diffraction Spikes: Telescopic / camera aperture starburst rays radiating into space.
 * 4. Horizontal Anamorphic Solar Streak: High-end aerospace camera lens flare line across the cosmos.
 * 5. Dynamic Crepuscular Light Shafts: Radiant solar beams ("quyosh nuri") illuminating the vacuum.
 */

export interface SpaceSunController {
  group: THREE.Group
  update: (
    camera: THREE.Camera,
    altitudeKm: number,
    sunDir: THREE.Vector3,
    elapsed: number,
  ) => void
  dispose: () => void
}

export function createSpaceSun(scene: THREE.Scene): SpaceSunController {
  const group = new THREE.Group()
  group.name = 'SpaceSunSystem'
  group.visible = false
  scene.add(group)

  // ── 1. BLINDING SOLAR PHOTOSPHERE DISC ──────────────────────────────────────
  const discGeo = new THREE.SphereGeometry(180, 32, 16)
  const discMat = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.99,
    depthWrite: false,
  })
  const solarDisc = new THREE.Mesh(discGeo, discMat)
  solarDisc.renderOrder = -50
  group.add(solarDisc)

  // ── 2. MULTI-LAYERED VOLUMETRIC CORONA HALO SHADER ──────────────────────────
  const coronaMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uIntensity;
      varying vec2 vUv;

      void main() {
        if (uIntensity <= 0.01) discard;

        vec2 center = vUv - vec2(0.5);
        float r = length(center) * 2.0;
        if (r > 1.0) discard;

        // Core exponential falloff
        float core = exp(-r * 4.8) * 2.2;
        float innerCorona = exp(-r * 2.4) * 1.4;
        float outerCorona = pow(max(0.0, 1.0 - r), 2.2) * 0.65;

        // Subtle dynamic coronal streamers (solar wind turbulence)
        float angle = atan(center.y, center.x);
        float streamer1 = sin(angle * 7.0 + uTime * 0.4) * 0.12;
        float streamer2 = cos(angle * 13.0 - uTime * 0.7) * 0.08;
        float streamers = 1.0 + (streamer1 + streamer2) * (1.0 - r);

        vec3 coreWhite  = vec3(3.2, 3.1, 2.9); // Blinding core
        vec3 innerGold  = vec3(2.5, 2.0, 1.1); // Warm solar yellow
        vec3 outerAmber = vec3(1.8, 1.0, 0.35); // Coronal amber
        vec3 edgePeach  = vec3(1.1, 0.45, 0.12); // Dissipating outer halo

        vec3 col = mix(coreWhite, innerGold, smoothstep(0.0, 0.35, r));
        col = mix(col, outerAmber, smoothstep(0.35, 0.75, r));
        col = mix(col, edgePeach, smoothstep(0.75, 1.0, r));

        float alpha = (core + innerCorona + outerCorona) * streamers * uIntensity;
        alpha = clamp(alpha, 0.0, 1.0);

        gl_FragColor = vec4(col * alpha, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })

  const coronaGeo = new THREE.PlaneGeometry(3600, 3600)
  const coronaMesh = new THREE.Mesh(coronaGeo, coronaMat)
  coronaMesh.renderOrder = -49
  group.add(coronaMesh)

  // ── 3. CINEMATIC 8-POINT DIFFRACTION SPIKES (TELESCOPIC STARBURST) ──────────
  const spikeMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uIntensity;
      varying vec2 vUv;

      void main() {
        if (uIntensity <= 0.01) discard;

        vec2 p = (vUv - vec2(0.5)) * 2.0;
        float r = length(p);
        if (r > 1.0) discard;

        // 8-point diffraction starburst pattern (4 primary axes + 4 diagonal axes)
        float ax1 = 1.0 / (abs(p.x) * 45.0 + 1.0) * (1.0 - abs(p.x));
        float ay1 = 1.0 / (abs(p.y) * 45.0 + 1.0) * (1.0 - abs(p.y));
        float primary = (ax1 + ay1) * pow(max(0.0, 1.0 - r), 1.4);

        // 45-degree diagonal secondary spikes
        vec2 d = vec2(p.x + p.y, p.x - p.y) * 0.7071;
        float ad1 = 1.0 / (abs(d.x) * 65.0 + 1.0) * (1.0 - abs(d.x));
        float ad2 = 1.0 / (abs(d.y) * 65.0 + 1.0) * (1.0 - abs(d.y));
        float secondary = (ad1 + ad2) * pow(max(0.0, 1.0 - r), 1.8) * 0.65;

        float totalSpikes = (primary + secondary) * uIntensity;
        vec3 spikeCol = mix(vec3(2.5, 2.4, 2.2), vec3(1.8, 1.4, 0.9), r);

        gl_FragColor = vec4(spikeCol * totalSpikes, clamp(totalSpikes, 0.0, 1.0));
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })

  const spikeGeo = new THREE.PlaneGeometry(5400, 5400)
  const spikeMesh = new THREE.Mesh(spikeGeo, spikeMat)
  spikeMesh.renderOrder = -48
  group.add(spikeMesh)

  // ── 4. HORIZONTAL ANAMORPHIC SOLAR FLARE STREAK ("QUYOSH NURI") ────────────
  const anamorphicMat = new THREE.ShaderMaterial({
    uniforms: {
      uIntensity: { value: 1.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uIntensity;
      varying vec2 vUv;

      void main() {
        if (uIntensity <= 0.01) discard;

        vec2 p = (vUv - vec2(0.5)) * 2.0;
        float beamX = max(0.0, 1.0 - abs(p.x));
        float beamY = 1.0 / (abs(p.y) * 35.0 + 1.0);
        float streak = beamY * pow(beamX, 1.6) * uIntensity;

        // Delicate electric cyan-white anamorphic beam with warm solar center
        vec3 beamCol = mix(vec3(2.8, 2.6, 2.2), vec3(0.4, 1.2, 2.5), abs(p.x) * 0.85);

        gl_FragColor = vec4(beamCol * streak, clamp(streak * 0.85, 0.0, 1.0));
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })

  const anamorphicGeo = new THREE.PlaneGeometry(12000, 480)
  const anamorphicMesh = new THREE.Mesh(anamorphicGeo, anamorphicMat)
  anamorphicMesh.renderOrder = -47
  group.add(anamorphicMesh)

  return {
    group,

    update(
      camera: THREE.Camera,
      altitudeKm: number,
      sunDir: THREE.Vector3,
      elapsed: number,
    ) {
      // Direct deep-space positioning: placed at 48,000m along sunDir from camera
      // This ensures the Sun stays fixed in astronomical infinity regardless of rocket flight
      group.position.copy(camera.position).addScaledVector(sunDir, 48_000)

      // Billboards orient directly towards the camera
      coronaMesh.lookAt(camera.position)
      spikeMesh.lookAt(camera.position)
      anamorphicMesh.lookAt(camera.position)

      // Slight rotation of diffraction spikes for dynamic lens aperture shimmer
      spikeMesh.rotation.z = Math.sin(elapsed * 0.12) * 0.04

      // Dynamic solar intensity based on altitude:
      // Below 15 km, troposphere obscures direct space spikes.
      // Above 20 km (stratosphere -> space), the Sun bursts into brilliant cosmic glory!
      const spaceFade = THREE.MathUtils.clamp((altitudeKm - 14.0) / 30.0, 0.0, 1.0)
      const baseIntensity = spaceFade * 1.25

      coronaMat.uniforms.uTime.value = elapsed
      coronaMat.uniforms.uIntensity.value = baseIntensity
      spikeMat.uniforms.uTime.value = elapsed
      spikeMat.uniforms.uIntensity.value = baseIntensity * 0.92
      anamorphicMat.uniforms.uIntensity.value = baseIntensity * 0.75
      discMat.opacity = Math.min(1.0, 0.3 + spaceFade * 0.7)

      group.visible = altitudeKm > 10.0
    },

    dispose() {
      discGeo.dispose()
      discMat.dispose()
      coronaGeo.dispose()
      coronaMat.dispose()
      spikeGeo.dispose()
      spikeMat.dispose()
      anamorphicGeo.dispose()
      anamorphicMat.dispose()
      scene.remove(group)
    },
  }
}
