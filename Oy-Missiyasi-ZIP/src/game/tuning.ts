import { CONFIG, DEFAULT_CONFIG } from './config'

type Mode = 'LIVE' | 'NEXT_ACTION' | 'NEXT_RUN'
type Boundary = 'jump' | 'dash' | 'run' | 'mission' | 'landing'
type Control = { id: string; type: 'number'; category: string; label: string; description: string; unit: string;
  default: number; min: number; max: number; step: number; applyMode: Mode; integrity: 'COSMETIC' | 'GAMEPLAY' }
type Binding = { control: Control; boundary?: Boundary; read(): number; write(value: number): void }

const bindings: Binding[] = []
function number<S extends keyof typeof CONFIG>(section: S, key: keyof typeof CONFIG[S] & string,
  label: string, min: number, max: number, step: number, unit: string, boundary?: Boundary, integrity?: Control['integrity']): void {
  const values = CONFIG[section] as Record<string, number>
  const defaults = DEFAULT_CONFIG[section] as Record<string, number>
  bindings.push({ control: Object.freeze({ id: `${section}.${key}`, type: 'number', category: section === 'mission' ? 'Oy missiyasi' : section === 'player' ? 'Movement' : section === 'camera' ? 'Camera' : 'Run',
    label, description: boundary === 'landing' ? 'Keyingi qo‘nish bosqichida qo‘llanadi.' : boundary === 'mission' ? 'Keyingi Oy missiyasi boshlanganda qo‘llanadi.' : boundary === 'jump' ? 'Applies when the next jump starts.' : boundary === 'dash' ? 'Applies when the next dash starts.' : boundary === 'run' ? 'Applies when a new run starts.' : 'Updates this preview immediately.',
    unit, default: defaults[key], min, max, step,
    applyMode: boundary === 'run' ? 'NEXT_RUN' : boundary ? 'NEXT_ACTION' : 'LIVE',
    integrity: integrity ?? (section === 'camera' ? 'COSMETIC' : 'GAMEPLAY') }), boundary,
    read: () => values[key], write: value => { values[key] = value } })
}
number('mission', 'lunarGravity', 'Oy tortish kuchi', 0.2, 2.5, 0.05, 'm/s²', 'landing')
number('mission', 'thrustAcceleration', 'Qo‘nish dvigateli tezlanishi', 2, 9, 0.1, 'm/s²', 'landing')
number('mission', 'landingBurstImpulse', 'Qisqa zarba kuchi', 0.5, 3, 0.05, 'm/s', 'landing')
number('mission', 'safeLandingSpeed', 'Xavfsiz qo‘nish tezligi', 1.2, 5, 0.1, 'm/s', 'landing')
number('mission', 'safeLandingRadius', 'Xavfsiz maydon radiusi', 4, 14, 0.5, 'm', 'landing')
number('mission', 'roverSpeed', 'Rover tezligi', 1.5, 8, 0.25, 'm/s', 'mission')
number('mission', 'interactionRadius', 'Tadqiqot nuqtasiga yaqinlik', 3, 12, 0.5, 'm', 'mission')
number('mission', 'oxygenDrain', 'Kislorod sarfi', 0.03, 0.5, 0.01, '%/s', 'mission')
number('mission', 'cameraFollow', 'Kamera ergashish tezligi', 1, 6, 0.1, '', undefined, 'COSMETIC')

const byId = new Map(bindings.map(binding => [binding.control.id, binding]))
let requested = Object.fromEntries(bindings.map(({ control }) => [control.id, control.default]))
const valid = (values: Record<string, number>) => values['mission.thrustAcceleration'] > values['mission.lunarGravity'] && values['mission.interactionRadius'] > 0

let unranked = false
const gameplayModified = () => bindings.some(binding => binding.control.integrity === 'GAMEPLAY' && binding.read() !== binding.control.default)

export const tuning = {
  get unranked(): boolean { return unranked },
  controls: Object.freeze(bindings.map(binding => binding.control)),
  read() {
    return { requested: { ...requested }, active: Object.fromEntries(bindings.map(binding => [binding.control.id, binding.read()])) }
  },
  apply(patch: unknown): void {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid patch')
    const entries = Object.entries(patch)
    if (entries.length > bindings.length) throw new Error('Invalid patch')
    for (const [id, value] of entries) {
      const control = byId.get(id)?.control
      if (!control || typeof value !== 'number' || !Number.isFinite(value) || value < control.min || value > control.max) throw new Error('Invalid value')
      const steps = (value - control.min) / control.step
      if (value !== control.default && Math.abs(steps - Math.round(steps)) > 1e-7) throw new Error('Invalid increment')
    }
    const candidate = { ...requested, ...patch } as Record<string, number>
    const nextActive = this.read().active
    for (const [id, value] of entries) if (byId.get(id)!.control.applyMode === 'LIVE') nextActive[id] = value
    if (!valid(candidate) || !valid(nextActive)) throw new Error('Missiya sozlamalari o‘zaro mos emas.')
    // All writes are simple assignments, synchronously committed before the next
    // physics/render callback. No engine callbacks run during this transaction.
    requested = candidate
    for (const [id, value] of entries) {
      const binding = byId.get(id)!
      if (binding.control.applyMode === 'LIVE') binding.write(value)
    }
    unranked ||= gameplayModified()
  },
  activate(boundary: Boundary): void {
    for (const binding of bindings) {
      const belongsToMission = boundary === 'mission' && (binding.boundary === 'mission' || binding.boundary === 'landing')
      if (binding.boundary === boundary || belongsToMission) binding.write(requested[binding.control.id])
    }
    // Reset only at a new run; resetting values mid-run cannot restore eligibility.
    unranked = boundary === 'run' || boundary === 'mission' ? gameplayModified() : unranked || gameplayModified()
  },
}
