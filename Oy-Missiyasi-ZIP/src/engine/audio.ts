/**
 * Web Audio mixer with music and SFX buses. Browsers only allow audio after a user gesture, so
 * call `unlock()` from the first click/key press (the title screen does this).
 *
 * The starter ships no audio files: SFX are synthesized and the music is a generative ambient
 * pad. To use recorded assets, `load(url)` an AudioBuffer and `playBuffer()` it on either bus.
 */
export type Sfx = 'pickup' | 'jump' | 'land' | 'hurt' | 'ui' | 'win' | 'lose' | 'dash' | 'stage' | 'radio'

export class Audio {
  readonly ctx: AudioContext
  private master: GainNode
  private music: GainNode
  private sfx: GainNode
  private musicTimer = 0
  private musicOn = false
  private buffers = new Map<string, AudioBuffer>()
  private readonly engineOscillator: OscillatorNode
  private readonly engineGain: GainNode
  private readonly engineFilter: BiquadFilterNode
  private readonly engineSubOscillator: OscillatorNode
  private readonly engineSubGain: GainNode
  private readonly engineNoiseFilter: BiquadFilterNode
  private readonly engineNoiseGain: GainNode
  private lastEngineThrottle = -1

  constructor() {
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.music = this.ctx.createGain()
    this.sfx = this.ctx.createGain()
    this.music.connect(this.master)
    this.sfx.connect(this.master)
    this.master.connect(this.ctx.destination)
    this.engineOscillator = this.ctx.createOscillator()
    this.engineGain = this.ctx.createGain()
    this.engineFilter = this.ctx.createBiquadFilter()
    this.engineSubOscillator = this.ctx.createOscillator()
    this.engineSubGain = this.ctx.createGain()
    this.engineNoiseFilter = this.ctx.createBiquadFilter()
    this.engineNoiseGain = this.ctx.createGain()
    this.engineOscillator.type = 'sawtooth'
    this.engineOscillator.frequency.value = 42
    this.engineGain.gain.value = 0
    this.engineFilter.type = 'lowpass'
    this.engineFilter.frequency.value = 180
    this.engineFilter.Q.value = 0.7
    this.engineSubOscillator.type = 'sine'
    this.engineSubOscillator.frequency.value = 18
    this.engineSubGain.gain.value = 0
    this.engineNoiseFilter.type = 'lowpass'
    this.engineNoiseFilter.frequency.value = 90
    this.engineNoiseGain.gain.value = 0
    this.engineOscillator.connect(this.engineFilter).connect(this.engineGain).connect(this.sfx)
    this.engineSubOscillator.connect(this.engineSubGain).connect(this.sfx)

    const noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate)
    const noiseSamples = noiseBuffer.getChannelData(0)
    for (let i = 0; i < noiseSamples.length; i += 1) noiseSamples[i] = Math.random() * 2 - 1
    const engineNoise = this.ctx.createBufferSource()
    engineNoise.buffer = noiseBuffer
    engineNoise.loop = true
    engineNoise.connect(this.engineNoiseFilter).connect(this.engineNoiseGain).connect(this.sfx)
    this.engineOscillator.start()
    this.engineSubOscillator.start()
    engineNoise.start()
  }

  unlock(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  /** Volumes in 0..1. */
  setVolumes(music: number, sfx: number, muted = false): void {
    const t = this.ctx.currentTime
    const musicGain = Math.min(1, Math.max(0, music) * 1.65)
    const sfxGain = Math.min(1, Math.max(0, sfx) * 1.6)
    this.music.gain.setTargetAtTime(muted ? 0 : musicGain, t, 0.05)
    this.sfx.gain.setTargetAtTime(muted ? 0 : sfxGain, t, 0.05)
  }

  async load(url: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(url)
    if (cached) return cached
    const data = await (await fetch(url)).arrayBuffer()
    const buffer = await this.ctx.decodeAudioData(data)
    this.buffers.set(url, buffer)
    return buffer
  }

  playBuffer(buffer: AudioBuffer, bus: 'music' | 'sfx' = 'sfx', loop = false): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.loop = loop
    src.connect(bus === 'music' ? this.music : this.sfx)
    src.start()
    return src
  }

  play(name: Sfx): void {
    if (this.ctx.state !== 'running') return
    const t = this.ctx.currentTime
    const tone = (freq: number, end: number, dur: number, type: OscillatorType, vol: number, delay = 0) => {
      const o = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      o.type = type
      o.frequency.setValueAtTime(freq, t + delay)
      o.frequency.exponentialRampToValueAtTime(Math.max(end, 20), t + delay + dur)
      g.gain.setValueAtTime(0.0001, t + delay)
      g.gain.exponentialRampToValueAtTime(vol, t + delay + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur)
      o.connect(g).connect(this.sfx)
      o.start(t + delay)
      o.stop(t + delay + dur + 0.05)
    }
    switch (name) {
      case 'pickup': tone(880, 1320, 0.12, 'triangle', 0.35); tone(1320, 1760, 0.16, 'sine', 0.25, 0.06); break
      case 'jump': tone(300, 620, 0.14, 'square', 0.12); break
      case 'land': tone(160, 70, 0.1, 'sine', 0.25); break
      case 'hurt': tone(220, 90, 0.28, 'sawtooth', 0.22); break
      case 'ui': tone(660, 700, 0.06, 'triangle', 0.18); break
      case 'dash': tone(500, 180, 0.18, 'sawtooth', 0.1); break
      case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.01, 0.3, 'triangle', 0.25, i * 0.11)); break
      case 'lose': [392, 330, 262].forEach((f, i) => tone(f, f * 0.98, 0.38, 'sine', 0.25, i * 0.16)); break
      case 'stage': tone(112, 52, 0.22, 'triangle', 0.34); tone(420, 170, 0.14, 'square', 0.08, 0.025); break
      case 'radio': tone(920, 680, 0.055, 'sine', 0.1); break
    }
  }

  setEngineRumble(throttle: number): void {
    const level = Math.max(0, Math.min(1, throttle))
    if (Math.abs(level - this.lastEngineThrottle) < 0.025) return
    this.lastEngineThrottle = level
    const now = this.ctx.currentTime
    this.engineOscillator.frequency.setTargetAtTime(34 + level * 54, now, 0.12)
    this.engineFilter.frequency.setTargetAtTime(150 + level * 310, now, 0.12)
    this.engineGain.gain.setTargetAtTime(level * 0.075, now, 0.12)
    this.engineSubOscillator.frequency.setTargetAtTime(18 + level * 26, now, 0.12)
    this.engineSubGain.gain.setTargetAtTime(level * 0.05, now, 0.12)
    this.engineNoiseFilter.frequency.setTargetAtTime(90 + level * 330, now, 0.12)
    this.engineNoiseGain.gain.setTargetAtTime(level * 0.022, now, 0.12)
  }

  /** Generative ambient pad: slow chord changes on a pentatonic set, scheduled ahead of time. */
  startMusic(): void {
    if (this.musicOn) return
    this.musicOn = true
    const chords = [[220, 277.2, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [196, 261.6, 329.6]]
    let bar = 0
    const schedule = () => {
      if (!this.musicOn) return
      const t = this.ctx.currentTime + 0.05
      const chord = chords[bar % chords.length]
      for (const f of chord) {
        for (const detune of [-6, 6]) {
          const o = this.ctx.createOscillator()
          const g = this.ctx.createGain()
          o.type = 'sine'
          o.frequency.value = f / 2
          o.detune.value = detune
          g.gain.setValueAtTime(0.0001, t)
          g.gain.linearRampToValueAtTime(0.05, t + 1.2)
          g.gain.linearRampToValueAtTime(0.0001, t + 4.2)
          o.connect(g).connect(this.music)
          o.start(t)
          o.stop(t + 4.4)
        }
      }
      bar += 1
      this.musicTimer = window.setTimeout(schedule, 3600)
    }
    schedule()
  }

  stopMusic(): void {
    this.musicOn = false
    clearTimeout(this.musicTimer)
  }

  /** Speaks with authentic cosmonaut / robotic onboard computer cadence */
  speakRobotic(text: string, lang = 'ru-RU'): void {
    try {
      this.play('radio')
    } catch {
      // AudioContext play fallback
    }
    speakRobotic(text, lang)
  }
}

/** Standalone speech synthesis with authentic cosmonaut robotic cadence */
export function speakRobotic(text: string, lang = 'ru-RU'): void {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.pitch = 0.62 // Deep robotic pitch
    utterance.rate = 0.88  // Methodical robotic cadence
    utterance.volume = 1.0

    const voices = window.speechSynthesis.getVoices()
    const ruVoice = voices.find(v => v.lang.startsWith('ru') || v.lang.includes('RU'))
    if (ruVoice) utterance.voice = ruVoice

    window.speechSynthesis.speak(utterance)
  } catch {
    // Audio speech gracefully ignored if browser restricts
  }
}
