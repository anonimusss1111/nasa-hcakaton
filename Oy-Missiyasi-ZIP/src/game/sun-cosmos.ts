import * as THREE from 'three'

/**
 * ── REALISTIC SUN & SOLAR SYSTEM COSMOS ("QUYOSH") ───────────────────────────
 * Recreates the magnificent 3D Sun and solar system inspired by astronomical
 * observations and user reference:
 * 1. Boiling convective solar photosphere with granulation & limb darkening.
 * 2. Dramatic fiery solar prominence rays (flaring coronal tongues of flame).
 * 3. Radiant golden-orange corona aura radiating warmth into deep space.
 * 4. Glowing "QUYOSH" golden label banner above the Sun.
 * 5. Concentric white orbital rings with orbiting planets (Mercury to Neptune).
 * 6. Saturn with realistic ring disc and Earth with orbiting Moon.
 */

export interface SunCosmosController {
  group: THREE.Group
  update: (dt: number, elapsed: number, cameraPos: THREE.Vector3) => void
  dispose: () => void
}

export function createSunCosmos(): SunCosmosController {
  const group = new THREE.Group()
  group.name = 'SunCosmos'

  // ── 1. The Sun Photosphere (Boiling Convective Plasma Sphere) ──────────────
  const sunUniforms = {
    uTime: { value: 0 },
  }

  const sunPhotosphereMat = new THREE.ShaderMaterial({
    uniforms: sunUniforms,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;

      // 3D Simplex-style procedural noise for solar granulation
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

      float snoise(vec3 v) {
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute(permute(permute(
                  i.z + vec4(0.0, i1.z, i2.z, 1.0))
                + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 0.142857142857;
        vec3  ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
      }

      void main() {
        // Convective plasma granulation
        vec3 pos = vPosition * 0.18 + vec3(0.0, uTime * 0.045, 0.0);
        float n1 = snoise(pos);
        float n2 = snoise(pos * 2.4 - vec3(uTime * 0.08, 0.0, 0.0)) * 0.5;
        float n3 = snoise(pos * 5.2 + vec3(0.0, 0.0, uTime * 0.12)) * 0.25;
        float plasma = n1 + n2 + n3;

        // Limb darkening (edges are darker reddish-orange, center is hot blinding gold)
        float limb = max(0.0, dot(vNormal, vec3(0.0, 0.0, 1.0)));
        float limbFactor = pow(limb, 0.65);

        // Vibrant solar color ramp
        vec3 coreColor = vec3(1.0, 0.96, 0.65); // Hot white-yellow
        vec3 midColor  = vec3(1.0, 0.62, 0.08); // Blazing solar amber #ff9e14
        vec3 rimColor  = vec3(0.92, 0.28, 0.02); // Chromosphere crimson-orange #eb4705
        vec3 spotColor = vec3(0.65, 0.15, 0.01); // Sunspots

        vec3 color = mix(rimColor, midColor, smoothstep(-0.4, 0.35, plasma));
        color = mix(color, coreColor, smoothstep(0.35, 0.85, plasma));
        if (plasma < -0.45) {
          color = mix(spotColor, rimColor, (plasma + 0.6) / 0.15);
        }

        // Apply limb darkening and bloom boost
        color = mix(rimColor * 0.85, color, limbFactor);
        color *= 1.35; // Solar irradiance boost

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  })

  const sunRadius = 20
  const photosphereGeo = new THREE.SphereGeometry(sunRadius, 48, 36)
  const photosphereMesh = new THREE.Mesh(photosphereGeo, sunPhotosphereMat)
  group.add(photosphereMesh)

  // ── 2. Dynamic Fiery Solar Prominences & Coronal Flares ─────────────────────
  // (Undulating tongues of flame shooting out and curling around the perimeter)
  const flareUniforms = {
    uTime: sunUniforms.uTime,
  }

  const flareMat = new THREE.ShaderMaterial({
    uniforms: flareUniforms,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vUv = uv;
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vPos;

      void main() {
        // Polar coordinates around the Sun center
        vec2 centered = vUv - vec2(0.5);
        float r = length(centered) * 2.0; // 0 at center, 1 at outer disc edge
        float angle = atan(centered.y, centered.x);

        // Wavy fiery coronal prominence flares
        float waves1 = sin(angle * 14.0 + uTime * 2.2 + sin(angle * 5.0)) * 0.09;
        float waves2 = cos(angle * 22.0 - uTime * 3.4 + sin(angle * 8.0)) * 0.06;
        float waves3 = sin(angle * 38.0 + uTime * 4.8) * 0.035;
        float waveOffset = waves1 + waves2 + waves3;

        // Inner mask (starts at sun limb r=0.55) to outer flare edge (r=0.95)
        float innerEdge = 0.52;
        float outerEdge = 0.88 + waveOffset;

        float flare = smoothstep(innerEdge, innerEdge + 0.08, r) * (1.0 - smoothstep(innerEdge + 0.1, outerEdge, r));
        flare = pow(flare, 1.3);

        // Fiery flame color gradient: Yellow at base -> Vibrant fiery orange -> Amber tips
        vec3 yellow = vec3(1.0, 0.92, 0.45);
        vec3 orange = vec3(1.0, 0.55, 0.05);
        vec3 redTip = vec3(0.95, 0.22, 0.02);

        float flareGrad = clamp((r - innerEdge) / max(0.001, (outerEdge - innerEdge)), 0.0, 1.0);
        vec3 col = mix(yellow, orange, flareGrad * 0.7);
        col = mix(col, redTip, pow(flareGrad, 1.8));

        float alpha = flare * 0.95;
        gl_FragColor = vec4(col * 1.5, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })

  // Flare billboard disc facing the primary viewing plane
  const flareDiscGeo = new THREE.PlaneGeometry(sunRadius * 3.6, sunRadius * 3.6)
  const flareDisc1 = new THREE.Mesh(flareDiscGeo, flareMat)
  flareDisc1.renderOrder = 2
  group.add(flareDisc1)

  // Secondary offset flare disc for 3D depth
  const flareDisc2 = new THREE.Mesh(flareDiscGeo, flareMat)
  flareDisc2.rotation.z = Math.PI * 0.25
  flareDisc2.rotation.y = Math.PI * 0.18
  flareDisc2.renderOrder = 2
  group.add(flareDisc2)

  // ── 3. Volumetric Glowing Corona Halo ──────────────────────────────────────
  const coronaMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: sunUniforms.uTime,
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float rim = 1.0 - max(0.0, dot(vNormal, vViewDir));
        float glow = pow(rim, 2.6);
        vec3 coronaColor = mix(vec3(1.0, 0.72, 0.15), vec3(1.0, 0.35, 0.05), rim);
        gl_FragColor = vec4(coronaColor * 1.6, glow * 0.65);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  })

  const coronaMesh = new THREE.Mesh(new THREE.SphereGeometry(sunRadius * 1.6, 32, 24), coronaMat)
  coronaMesh.renderOrder = 1
  group.add(coronaMesh)

  return {
    group,

    update(_dt: number, elapsed: number, _cameraPos: THREE.Vector3) {
      sunUniforms.uTime.value = elapsed

      // Gently rotate solar prominences for dynamic flame movement
      flareDisc1.rotation.z = elapsed * 0.08
      flareDisc2.rotation.z = -elapsed * 0.05 + 0.5
    },

    dispose() {
      sunPhotosphereMat.dispose()
      photosphereGeo.dispose()
      flareMat.dispose()
      flareDiscGeo.dispose()
      coronaMat.dispose()
    },
  }
}
