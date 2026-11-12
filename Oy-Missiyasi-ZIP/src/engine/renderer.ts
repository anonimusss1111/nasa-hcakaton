import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { Quality } from './save'

type Preset = { pixelRatio: number; shadows: boolean; shadowMap: number; bloom: boolean; antialias: boolean }
export const QUALITY_PRESETS: Record<Quality, Preset> = {
  low: { pixelRatio: 1, shadows: false, shadowMap: 512, bloom: false, antialias: false },
  medium: { pixelRatio: 1.25, shadows: false, shadowMap: 1024, bloom: false, antialias: true },
  high: { pixelRatio: 1.75, shadows: true, shadowMap: 1536, bloom: true, antialias: true },
}

/** Pick a starting quality from device hints; the player can override it in Settings. */
export function suggestQuality(): Quality {
  const coarse = matchMedia('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency ?? 4
  if (coarse || cores <= 4) return 'low'
  return 'medium'
}

/**
 * Owns the WebGL renderer, the optional post-processing chain and resize handling.
 * Scenes call `render(scene, camera)`; they never touch the composer directly.
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer
  private composer?: EffectComposer
  private bloom?: UnrealBloomPass
  private preset: Preset
  private activeQuality: Quality
  private slowFrameSeconds = 0
  private scene?: THREE.Scene
  private readonly shadowLights = new Set<THREE.DirectionalLight>()
  private composerScene?: THREE.Scene
  private composerCamera?: THREE.PerspectiveCamera

  constructor(readonly canvas: HTMLCanvasElement, quality: Quality) {
    this.activeQuality = quality
    this.preset = QUALITY_PRESETS[quality]
    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: this.preset.antialias,
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance',
    })
    this.gl.outputColorSpace = THREE.SRGBColorSpace
    this.gl.toneMapping = THREE.ACESFilmicToneMapping
    this.gl.toneMappingExposure = 1
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap
    this.applyQuality(quality)
    window.addEventListener('resize', () => this.resize())
  }

  get shadowMapSize(): number {
    return this.preset.shadowMap
  }

  applyQuality(quality: Quality): void {
    this.activeQuality = quality
    this.slowFrameSeconds = 0
    this.applyPreset(quality)
  }

  adaptQuality(frameSeconds: number): void {
    if (frameSeconds > 0.04) this.slowFrameSeconds += Math.min(frameSeconds, 0.1)
    else this.slowFrameSeconds = Math.max(0, this.slowFrameSeconds - frameSeconds * 0.5)
    if (this.slowFrameSeconds < 1.5 || this.activeQuality === 'low') return

    this.activeQuality = this.activeQuality === 'high' ? 'medium' : 'low'
    this.slowFrameSeconds = 0
    this.applyPreset(this.activeQuality)
    console.info(`Grafika sekin ishlayotgani uchun sifat ${this.activeQuality === 'medium' ? 'o‘rta' : 'past'} darajaga moslandi.`)
  }

  private applyPreset(quality: Quality): void {
    this.preset = QUALITY_PRESETS[quality]
    this.gl.shadowMap.enabled = this.preset.shadows
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.preset.pixelRatio))
    this.applyShadowQuality()
    this.bloom?.dispose()
    this.composer?.dispose()
    this.composer = undefined
    this.bloom = undefined
    this.composerScene = undefined
    this.composerCamera = undefined
    this.resize()
  }

  private applyShadowQuality(): void {
    for (const light of this.shadowLights) {
      light.castShadow = this.preset.shadows
      if (!this.preset.shadows) {
        light.shadow.map?.dispose()
        light.shadow.map = null
        continue
      }
      light.shadow.mapSize.set(this.preset.shadowMap, this.preset.shadowMap)
      light.shadow.needsUpdate = true
    }
  }

  private ensureComposer(scene: THREE.Scene, camera: THREE.PerspectiveCamera): EffectComposer | undefined {
    if (!this.preset.bloom) return undefined
    if (this.composer && this.composerScene === scene && this.composerCamera === camera) return this.composer
    this.composerScene = scene
    this.composerCamera = camera
    const size = this.gl.getSize(new THREE.Vector2())
    this.composer = new EffectComposer(this.gl)
    this.composer.addPass(new RenderPass(scene, camera))
    this.bloom = new UnrealBloomPass(size, 0.45, 0.3, 1.6)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.composer.setSize(size.x, size.y)
    return this.composer
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.gl.setSize(w, h, false)
    this.composer?.setSize(w, h)
    if (this.composerCamera) {
      this.composerCamera.aspect = w / h
      this.composerCamera.updateProjectionMatrix()
    }
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    if (this.scene !== scene) {
      this.scene = scene
      scene.traverse(object => {
        const light = object as THREE.DirectionalLight
        if (light.isDirectionalLight && light.castShadow) this.shadowLights.add(light)
      })
      this.applyShadowQuality()
    }
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    if (Math.abs(camera.aspect - w / h) > 1e-3) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const composer = this.ensureComposer(scene, camera)
    if (composer) composer.render()
    else this.gl.render(scene, camera)
  }
}
