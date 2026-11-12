import '../styles/mission.css'
import '../styles/boot-error.css'
import { Assets } from '../engine/assets'
import { Audio } from '../engine/audio'
import { I18n } from '../engine/i18n'
import { Input } from '../engine/input'
import { GameLoop } from '../engine/loop'
import { Renderer } from '../engine/renderer'
import { SaveStore } from '../engine/save'
import { MoonMission, RESEARCH_OBJECTIVES } from './mission'
import { CONFIG } from './config'
import { DemoDirector, DEMO_DURATION_SECONDS, DEMO_MAX_DURATION_SECONDS, type DemoPhase } from './demo/director'
import { landingSiteById, LANDING_SITES } from './demo/landing-sites'
import { renderNavigator } from './demo/navigator-ui'
import { DemoDescentController } from './demo/descent-controller'

const ASSET_URLS = {
  rocket: '/models/lunar-launch-rocket.glb',
  rover: '/models/lunar-science-rover.glb',
}

function boot(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const root = document.getElementById('ui')!
  const i18n = new I18n('uz')
  const save = new SaveStore()
  const renderer = new Renderer(canvas, save.data.quality)
  const input = new Input(canvas)
  const audio = new Audio()
  const mission = new MoonMission(renderer)
  const demoDirector = new DemoDirector()
  const demoDescent = new DemoDescentController()
  const assets = new Assets()
  const t = (key: string, vars: Record<string, string | number> = {}) => i18n.t(key, vars)
  let loop!: GameLoop
  let lastStage = mission.stage
  let muted = save.data.muted
  let missionSeconds = 0
  let refreshTimer = 0
  let shownMessage = ''
  let modelsReady = false
  let modelWarning = ''
  let demoStarted = false
  let lastDemoPhase: DemoPhase | '' = ''
  let lastHandledDemoPhase: DemoPhase | '' = ''
  let landingReported = false
  const demoRequested = new URLSearchParams(location.search).get('demo') === '60'
  const activeTouchDirections = new Map<number, string>()
  const activeThrustPointers = new Set<number>()

  audio.setVolumes(save.data.musicVolume, save.data.sfxVolume, muted)
  root.innerHTML = `
    <div class="game-interface">
      <div class="loading-screen" id="loading-screen" role="status"><div class="loading-card"><img class="loading-icon" src="/favicon.png" alt="" /><strong>${t('game.title')}</strong><small>${t('hud.modelLoading')}</small><div class="loading-bar"><i></i></div><span class="loading-status">${t('loading.status')}</span></div></div>
      <header class="topbar">
        <div class="brand-lockup"><span class="brand-mark"><i></i><b></b><em></em></span><span><strong>${t('game.title')}</strong><small>${t('hud.brandTag')}</small></span></div>
        <div class="top-readout"><span class="live-dot"></span><span id="phase-chip">${t('phase.base')}</span><span class="top-divider"></span><span id="mission-clock">T+ 00:00</span></div>
        <div class="top-actions"><button class="icon-btn sound-btn" data-action="sound" aria-label="Ovoz" title="Ovoz"><span id="sound-icon">◖</span></button><button class="icon-btn pause-btn" data-action="pause" aria-label="Pauza" title="Pauza">Ⅱ</button></div>
      </header>
      <aside class="mission-panel" id="mission-panel" aria-live="polite"></aside>
      <aside class="telemetry-panel" aria-live="polite">
        <div class="telemetry-head"><span>${t('hud.telemetry')}</span><span class="telemetry-dot"></span></div>
        <div class="telemetry-row"><span id="metric-a-label">${t('hud.rocket')}</span><b id="metric-a">0 / 5</b></div>
        <div class="meter-track"><i id="metric-a-meter"></i></div>
        <div class="telemetry-row"><span id="metric-b-label">${t('hud.fuel')}</span><b id="metric-b">100%</b></div>
        <div class="meter-track meter-amber"><i id="metric-b-meter"></i></div>
        <div class="telemetry-row"><span>${t('hud.research')}</span><b id="research-count">0 / 3</b></div>
        <div class="mini-objectives" id="mini-objectives"></div>
      </aside>
      <aside class="launch-camera-controls" id="launch-camera-controls" role="group" aria-label="Raketa kamerasi" hidden>
        <span>RAKETA KAMERASI</span>
        <button type="button" data-action="camera-chase" aria-pressed="true">ORTDAN <kbd>1</kbd></button>
        <button type="button" data-action="camera-engine" aria-pressed="false">PASTDAN <kbd>2</kbd></button>
        <button type="button" data-action="camera-cabin" aria-pressed="false">KABINA <kbd>3</kbd></button>
      </aside>
      <div class="mission-steps" id="mission-steps" aria-label="Missiya bosqichlari"></div>
      <aside class="demo-hud" id="demo-hud" hidden>
        <div class="demo-hud-head"><span>${t('demo.clock')} · <i id="demo-current"></i></span><span id="demo-timewarp" class="demo-timewarp" hidden>×10 000</span><b id="demo-clock">00:00</b></div>
        <div class="demo-progress"><i id="demo-progress-fill"></i></div>
        <div class="demo-phase-row" id="demo-phase-row"></div>
        <div class="demo-hud-actions"><button data-action="demo-pause">${t('demo.pause')}</button><button data-action="demo-skip">${t('demo.skip')}</button></div>
      </aside>
      <div class="toast" id="toast" role="status"></div>
      <div class="touch-controls" id="touch-controls" aria-label="Sensorli boshqaruv">
        <div class="touch-pad"><button data-move="forward" aria-label="Oldinga">▲</button><div><button data-move="left" aria-label="Chapga">◀</button><button data-move="back" aria-label="Orqaga">▼</button><button data-move="right" aria-label="O‘ngga">▶</button></div></div>
        <button class="thrust-pad" data-hold="thrust" aria-label="Dvigatelni ushlab turish"><span>↑</span><small>TORTISH</small></button>
      </div>
      <div class="pause-overlay" id="pause-overlay" hidden>
        <div class="pause-card"><span class="panel-kicker">PARVOZ NAZORATI</span><h2>${t('pause.title')}</h2><p>${t('pause.copy')}</p><div class="pause-actions"><button class="button button-primary" data-action="resume">${t('pause.resume')}</button><button class="button button-quiet" data-action="restart">${t('pause.restart')}</button><button class="button button-quiet" data-action="title">${t('pause.titleAction')}</button></div></div>
      </div>
      <footer class="bottom-readout"><span><i class="key-dot"></i><span id="control-hint">${t('controls.default')}</span></span><span id="asset-status">${t('hud.modelLoading')}</span></footer>
    </div>`

  const loadingScreen = root.querySelector<HTMLElement>('#loading-screen')!
  const finishLoading = () => loadingScreen.classList.add('is-hidden')
  window.setTimeout(finishLoading, 1250)
  const panel = root.querySelector<HTMLElement>('#mission-panel')!
  const pauseOverlay = root.querySelector<HTMLElement>('#pause-overlay')!
  const toast = root.querySelector<HTMLElement>('#toast')!
  const phaseLabels: Record<string, string> = {
    title: t('phase.base'), countdown: t('phase.countdown'), launch: t('phase.launch'),
    transit: t('phase.transit'), landing: t('phase.landing'), landingFailed: t('phase.warning'), surface: t('phase.surface'), complete: t('phase.complete'),
  }
  const demoPhaseLabels = {
    countdown: t('demo.countdown'),
    ascent: t('demo.ascent'),
    transit: t('demo.transit'),
    navigator: t('demo.navigator'),
    descent: t('demo.descent'),
    results: t('demo.results'),
  } as const
  const story = (kicker: string, title: string, desc: string, body: string, actions: string) => `
    <div class="panel-topline"><span>${kicker}</span><span class="panel-code">OM · 01</span></div>
    <h1>${title}</h1><p class="panel-description">${desc}</p><div class="panel-body">${body}</div><div class="panel-actions">${actions}</div>`

  function renderSteps(): void {
    const current = mission.stage === 'title' || mission.stage === 'countdown' || mission.stage === 'launch' ? 0
      : mission.stage === 'transit' ? 1 : mission.stage === 'landing' || mission.stage === 'landingFailed' ? 2 : mission.stage === 'surface' ? 3 : 4
    const labels = [t('steps.launch'), t('steps.fly'), t('steps.land'), t('steps.research')]
    root.querySelector<HTMLElement>('#mission-steps')!.innerHTML = labels.map((label, i) => `<div class="step ${i < current ? 'is-done' : ''} ${i === current ? 'is-current' : ''}"><i>${i < current ? '✓' : `0${i + 1}`}</i><span>${label}</span></div>`).join('')
  }

  function renderPanel(): void {
    const stage = mission.stage
    root.dataset.stage = stage
    root.dataset.camera = mission.launchCameraView
    const cameraControls = root.querySelector<HTMLElement>('#launch-camera-controls')!
    cameraControls.hidden = stage !== 'launch'
    cameraControls.querySelectorAll<HTMLButtonElement>('[data-action^="camera-"]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.action === `camera-${mission.launchCameraView}`))
    })
    pauseOverlay.hidden = !mission.paused
    updateDemoHud()
    root.querySelector<HTMLButtonElement>('.pause-btn')!.hidden = stage === 'title' || stage === 'complete'
    let content = ''
    if (demoStarted && demoDirector.phase === 'navigator') {
      panel.innerHTML = renderNavigator(
        LANDING_SITES,
        demoDirector.selectedSiteId,
        demoDirector.recommendedSiteId,
        key => t(key),
        i18n.locale === 'uz',
      )
      panel.dataset.stage = stage
      renderSteps()
      updateTelemetry()
      return
    } else if (stage === 'title') {
      content = `<div class="title-hero">
        <div class="hero-eyebrow"><span class="hero-orbit">◉</span><span>${t('intro.kicker')}</span><i></i><b>${t('intro.status')}</b></div>
        <h1>${t('intro.title')}</h1>
        <p class="panel-description">${t('intro.copy')}</p>
        <div class="brief-stats">
          <div><b>384 400</b><span>${t('intro.distance')}</span></div>
          <div><b>03</b><span>${t('intro.science')}</span></div>
          <div><b>01</b><span>${t('intro.destination')}</span></div>
        </div>
        <div class="mission-brief"><span class="brief-icon">⌖</span><span>${t('intro.brief')}</span></div>
        <div class="hero-route"><span>${t('intro.earth')}</span><i><b></b></i><span>${t('intro.moon')}</span></div>
        <label class="difficulty-control">${t('landing.difficulty')}<select data-action="difficulty"><option value="easy" ${mission.difficulty === 'easy' ? 'selected' : ''}>${t('landing.difficulty.easy')}</option><option value="normal" ${mission.difficulty === 'normal' ? 'selected' : ''}>${t('landing.difficulty.normal')}</option><option value="hard" ${mission.difficulty === 'hard' ? 'selected' : ''}>${t('landing.difficulty.hard')}</option></select></label>
        <button class="button button-primary button-wide hero-launch" data-action="begin"><span>${t('intro.cta')}</span><i>↗</i></button>
        <button class="button button-secondary button-wide" data-action="begin-demo"><span>${t('demo.start')}</span><i>▶</i></button>
        <small class="button-note">${t('intro.controls')}</small>
      </div>`
    } else if (stage === 'countdown') {
      content = story(t('launch.kicker'), t('launch.countdownTitle'), t('launch.countdownCopy'), `<div class="countdown-display"><span>T−</span><b>${demoStarted ? '08' : '04'}</b><small>${t('launch.sequence')}</small></div><div class="flight-ready"><i>✓</i><span>${t('launch.systemsReady')}</span><b>${t('launch.ready')}</b></div>`, `<div class="mission-brief"><span class="brief-icon">●</span><span>${t('launch.noTouch')}</span></div>`)
    } else if (stage === 'launch') {
      content = `
        <div class="launch-speedo-panel">
          <div class="speedo-left">
            <span class="speedo-label">⚡ ELEKTR TEZLIK</span>
            <div class="speedo-value-wrap">
              <b class="speedo-number" id="speedo-value">0</b>
              <small class="speedo-unit">km/soat</small>
            </div>
          </div>
          <div class="speedo-center">
            <div class="speedo-bar-track">
              <i class="speedo-bar-fill" id="speedo-fill" style="width: 0%"></i>
            </div>
            <div class="speedo-ticks">
              <span>0</span>
              <span>7 000</span>
              <span>14 000</span>
              <span>21 000</span>
              <span>28 000 KM/S (ORBITA)</span>
            </div>
          </div>
          <div class="speedo-right">
            <span class="speedo-label">BALANDLIK</span>
            <div class="speedo-alt-wrap">
              <b class="speedo-alt" id="speedo-alt">0</b>
              <small class="speedo-unit">km</small>
            </div>
          </div>
        </div>
        <div class="launch-strata-indicator" id="launch-strata-indicator">
          <span class="strata-badge-dot"></span>
          <div class="strata-badge-text">
            <span class="strata-badge-name" id="strata-name">TROPOSFERA</span>
            <small class="strata-badge-detail" id="strata-detail">0–12 km · Ob-havo, zich bulutlar va Yer manzarasi</small>
          </div>
        </div>
        <div class="ascent-graphs">
          <label><span>BALANDLIK · km</span><canvas id="ascent-altitude-graph" width="180" height="42" aria-label="Balandlik grafigi"></canvas></label>
          <label><span>TEZLIK · km/s</span><canvas id="ascent-velocity-graph" width="180" height="42" aria-label="Tezlik grafigi"></canvas></label>
          <label><span>TEZLANISH · g</span><canvas id="ascent-acceleration-graph" width="180" height="42" aria-label="Tezlanish grafigi"></canvas></label>
        </div>
        <div class="ascent-live-telemetry">
          <span>${t('launch.altitude')} <b id="ascent-alt-live">0 m</b></span>
          <span>${t('launch.speed')} <b id="ascent-speed-live">0 m/s</b></span>
          <span>${t('launch.acceleration')} <b id="ascent-accel-live">0.0 m/s²</b></span>
          <span>${t('hud.fuel')} <b id="ascent-fuel-live">100%</b></span>
          <span>${t('hud.stage')} <b id="ascent-stage-live">1 / 3</b></span>
        </div>
      `
    } else if (stage === 'transit') {
      const ready = mission.transitCaptured
      content = story(t('transit.kicker'), t('transit.title'), t('transit.copy'), `<div class="transfer-readout"><div><span>${t('transit.burn')}</span><b id="burn-value">${Math.round(mission.burnProgress)}%</b></div><div class="meter-track"><i id="burn-meter" style="width:${mission.burnProgress}%"></i></div><div class="transfer-route"><span>${t('transit.routeEarth')}</span><i></i><span>${t('transit.routeMoon')}</span></div><div class="transfer-route"><span>${t('transit.distanceLabel')}</span><i></i><span>${t('transit.distanceValue')}</span></div><div class="transfer-route"><span>${t('transit.travelled')}</span><b id="travelled-distance">${mission.transferDistanceKm.toLocaleString('uz-UZ')} km</b></div><div class="transfer-route"><span>${t('transit.distanceToMoon')}</span><b id="moon-distance">${mission.distanceToMoonKm.toLocaleString('uz-UZ')} km</b></div><div class="transfer-route" style="color:#00f0ff; margin-top:4px;"><span>OYGA YETIB BORISH (ETA)</span><b id="transit-eta">${mission.transitEtaText}</b></div><div class="asteroid-warning" id="asteroid-warning" style="display:none; color:#f59e0b; font-size:12px; font-weight:600; padding:4px 8px; border-radius:4px; background:rgba(245,158,11,0.18); border:1px solid rgba(245,158,11,0.4); margin:6px 0;"></div><div class="meter-track"><i id="distance-meter" style="width:${mission.transferProgress * 100}%"></i></div><div class="timewarp-control"><label for="time-warp">${t('transit.timeScale')}</label><select id="time-warp" data-action="warp">${[1_000, 4_000, 16_000, 32_000, 64_000].map(value => `<option value="${value}" ${mission.timeWarp === value ? 'selected' : ''}>${value >= 16_000 ? `${(value / 1_000).toFixed(0)} 000× (Tezkor)` : `${value.toLocaleString('uz-UZ')}×`}</option>`).join('')}</select><span id="transit-time">${t('transit.time')}: 0:00</span></div><div class="transit-cam-controls" style="display:flex; gap:6px; margin: 8px 0;"><button type="button" class="button button-quiet button-sm" data-action="transit-cam-craft" aria-pressed="${mission.transitCameraView === 'craft'}">KEMA KAMERASI <kbd>1</kbd></button><button type="button" class="button button-quiet button-sm" data-action="transit-cam-overview" aria-pressed="${mission.transitCameraView === 'overview'}">TIZIM KO‘RINISHI <kbd>2</kbd></button></div></div><div class="mission-brief"><span class="brief-icon">⌁</span><span>${t('transit.hint')}</span></div>`, `<button class="button button-primary button-wide" data-action="continue"><span>${ready ? 'OYGA QO‘NISHNI BOSHLASH 🚀' : 'OYGA TEZKOR YAQINLASHISH ⚡'}</span><i>${ready ? '↓' : '⚡'}</i></button><button class="button button-secondary button-wide" data-action="burn"><span>${t('transit.burnButton')}</span><i>↑</i></button><button class="button button-quiet button-wide autopilot-toggle" data-action="autopilot" aria-pressed="${mission.autopilotEnabled}"><span>${t(mission.autopilotEnabled ? 'autopilot.disable' : 'autopilot.enable')}</span><i>${mission.autopilotEnabled ? '●' : '○'}</i></button><small class="button-note">${ready ? 'Oy orbitasidasiz. Qo‘nish modulini ishga tushiring.' : 'Space: Tezlanish · Tugma: Oy orbitasiga tezkor o‘tish'}</small>`)
    } else if (stage === 'landing') {
      content = story(t('landing.kicker'), t('landing.title'), t('landing.copy'), `<div class="landing-stats"><div><span>${t('landing.altitude')}</span><b id="landing-alt">${mission.altitude.toFixed(0)}<small> m</small></b></div><div><span>${t('landing.speed')}</span><b id="landing-speed">${Math.abs(mission.verticalSpeed).toFixed(1)}<small> m/s</small></b></div><div><span>${t('landing.fuel')}</span><b id="landing-fuel">${mission.fuel.toFixed(0)}<small>%</small></b></div></div><div class="attitude-readout"><span>${t('landing.attitude')}</span><b id="landing-attitude">${mission.landingTiltDegrees.toFixed(1)}°</b><i id="attitude-indicator"></i><span>${t('landing.slope')}</span><b id="landing-slope">${mission.landingSlopeDegrees.toFixed(1)}°</b></div><div class="landing-warning" id="landing-warning" hidden></div><div class="landing-marker"><i></i><span>${t('landing.zone')}</span></div><div class="mission-brief"><span class="brief-icon">!</span><span>${t('landing.hint')}</span></div>`, `<button class="button button-primary button-wide" data-action="pulse"><span>${t('landing.burst')}</span><i>↑</i></button><button class="button button-quiet button-wide autopilot-toggle" data-action="autopilot" aria-pressed="${mission.autopilotEnabled}"><span>${t(mission.autopilotEnabled ? 'autopilot.disable' : 'autopilot.enable')}</span><i>${mission.autopilotEnabled ? '●' : '○'}</i></button><small class="button-note">${t('landing.controls')}</small>`)
    } else if (stage === 'landingFailed') {
      content = story(t('landing.kicker'), t('landing.failedTitle'), t('landing.failedCopy'), `<div class="failure-stats"><span>${t('landing.failedSpeed')} <b>${Math.abs(mission.verticalSpeed).toFixed(1)} m/s</b></span><span>${t('landing.failedFuel')} <b>${mission.fuel.toFixed(0)}%</b></span></div><div class="mission-brief warning"><span class="brief-icon">!</span><span>${t('landing.failedHint')}</span></div>`, `<button class="button button-primary button-wide" data-action="retry-land"><span>${t('landing.retry')}</span><i>↻</i></button><button class="button button-quiet button-wide" data-action="restart"><span>${t('pause.restart')}</span></button>`)
    } else if (stage === 'surface') {
      const nearest = mission.nearestResearch()
      const objectives = RESEARCH_OBJECTIVES.map((item, i) => `<div class="research-item ${mission.researched.has(item.id) ? 'is-done' : ''}" data-objective-id="${item.id}"><i>${mission.researched.has(item.id) ? '✓' : `0${i + 1}`}</i><span><b>${item.title}</b><small>${mission.researched.has(item.id) ? t('research.complete') : item.detail}</small></span></div>`).join('')
      const available = Boolean(nearest && nearest.distance <= CONFIG.mission.interactionRadius)
      content = story(t('surface.kicker'), t('surface.title'), t('surface.copy'), `<div class="research-list">${objectives}</div><div class="research-target"><div><span>${t('surface.nearest')}</span><b id="research-nearest">${nearest ? nearest.title : t('surface.allComplete')}</b></div><small id="research-distance">${nearest ? `${nearest.distance.toFixed(0)} m` : ''}</small></div>`, `<button class="button button-primary button-wide" data-action="research" ${available ? '' : 'disabled'}><span>${available ? t('surface.researchNow') : t('surface.driveCloser')}</span><i>⌖</i></button><small class="button-note">${t('surface.controls')}</small>`)
    } else {
      const points = RESEARCH_OBJECTIVES.reduce((sum, item) => sum + (mission.researched.has(item.id) ? item.reward : 0), 0)
      content = story(t('complete.kicker'), t('complete.title'), t('complete.copy'), `<div class="success-emblem"><i>✓</i><span>${t('complete.seal')}</span></div><div class="success-summary"><div><span>${t('complete.samples')}</span><b>${mission.researched.size} / 3</b></div><div><span>${t('complete.science')}</span><b>${points.toLocaleString('uz-UZ')} SP</b></div><div><span>${t('complete.status')}</span><b>${t('complete.statusValue')}</b></div></div><div class="mission-brief"><span class="brief-icon">✦</span><span>${t('complete.thanks')}</span></div>`, `<button class="button button-primary button-wide" data-action="restart"><span>${t('complete.again')}</span><i>↻</i></button><button class="button button-quiet button-wide" data-action="title"><span>${t('pause.titleAction')}</span></button>`)
    }
    if (stage === 'landing' && demoStarted && demoDirector.phase === 'descent') {
      const site = landingSiteById(demoDirector.selectedSiteId)
      const reason = i18n.locale === 'uz' ? site.reasonUz : site.reasonEn
      const body = `<div class="landing-stats"><div><span>${t('landing.altitude')}</span><b id="landing-alt">${mission.altitude.toFixed(0)}<small> m</small></b></div><div><span>${t('landing.speed')}</span><b id="landing-speed">${Math.abs(mission.verticalSpeed).toFixed(1)}<small> m/s</small></b></div><div><span>${t('landing.fuel')}</span><b id="landing-fuel">${mission.fuel.toFixed(0)}<small>%</small></b></div></div><div class="attitude-readout"><span>${t('landing.attitude')}</span><b id="landing-attitude">${mission.landingTiltDegrees.toFixed(1)}°</b><i id="attitude-indicator"></i><span>${t('landing.slope')}</span><b id="landing-slope">${mission.landingSlopeDegrees.toFixed(1)}°</b></div><div class="demo-landing-site"><span>${t('demo.landing.site')}</span><b>${site.name}</b></div><div class="demo-safe-zone"><i></i><span>${t('demo.landing.safeZone')} · ${Math.round(site.safeZoneRadiusM / site.difficultyModifier)} m</span><small>${t('demo.landing.why')}: ${reason}</small></div><div class="demo-flight-readout"><span>${t('demo.landing.horizontal')}<b id="demo-hspeed">0.0 m/s</b></span><span>${t('demo.landing.touchdown')}<b id="demo-touchdown">0 m</b></span></div><div class="demo-mode-label" id="demo-mode-label">${t(demoDescent.autopilot ? 'demo.landing.modeAuto' : 'demo.landing.modeManual')}</div><div class="landing-warning" id="landing-warning" hidden></div><div class="mission-brief"><span class="brief-icon">!</span><span>${t('landing.hint')}</span></div>`
      const actions = `<button class="button button-secondary button-wide" data-action="demo-manual" aria-pressed="${!demoDescent.autopilot}"><span>${t('demo.landing.manual')}</span><i>${demoDescent.autopilot ? '○' : '●'}</i></button><button class="button button-primary button-wide" data-action="demo-auto" aria-pressed="${demoDescent.autopilot}"><span>${t('demo.landing.auto')}</span><i>${demoDescent.autopilot ? '●' : '○'}</i></button><small class="button-note">${t('landing.controls')}</small>`
      content = story(t('landing.kicker'), t('landing.title'), t('landing.copy'), body, actions)
    }
    if (demoStarted && demoDirector.phase === 'results') {
      const site = landingSiteById(demoDirector.selectedSiteId)
      const state = demoDescent.state
      const outcome = mission.landingOutcome ?? state.outcome ?? 'crash'
      const offset = Math.hypot(state.xM, state.zM)
      const safeRadius = site.safeZoneRadiusM / site.difficultyModifier
      const accuracy = Math.round(Math.max(0, Math.min(100, (1 - offset / safeRadius) * 100)))
      const safeZoneHit = offset <= safeRadius
      const outcomeScore = outcome === 'perfect' ? 100 : outcome === 'safe' ? 90 : outcome === 'hard' ? 62 : 15
      const score = Math.round(Math.max(0, Math.min(100, (outcomeScore * 0.58 + accuracy * 0.27 + state.fuelPercent * 0.15) * site.scoreMultiplier)))
      const grade = score >= 95 ? 'S' : score >= 85 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 45 ? 'D' : 'F'
      content = story(t('demo.result.kicker'), t('demo.result.title'), t('demo.result.copy'), `<div class="demo-result-grade grade-${grade.toLowerCase()}"><b>${grade}</b><span>${t(`demo.result.outcome.${outcome}`)}</span></div><div class="demo-result-site">${t('demo.result.site')}<b>${site.name}</b></div><div class="demo-result-grid"><div><span>${t('demo.result.time')}</span><b>${formatClock(demoDirector.elapsedSeconds)}</b></div><div><span>${t('demo.result.fuel')}</span><b>${state.fuelPercent.toFixed(0)}%</b></div><div><span>${t('demo.result.accuracy')}</span><b>${accuracy}%</b></div><div><span>${t('demo.result.safeZone')}</span><b class="${safeZoneHit ? 'is-hit' : 'is-missed'}">${t(safeZoneHit ? 'demo.result.hit' : 'demo.result.missed')}</b></div></div><div class="demo-result-score"><span>${t('demo.result.score')}</span><b>${score}</b><small>×${site.scoreMultiplier.toFixed(2)}</small></div>`, `<button class="button button-primary button-wide" data-action="restart"><span>${t('demo.result.retry')}</span><i>↻</i></button>`)
    }
    panel.innerHTML = content
    panel.dataset.stage = stage
    renderSteps()
    updateTelemetry()
    if (mission.statusMessage && mission.statusMessage !== shownMessage) notify(mission.statusMessage)
  }

  function updateTelemetry(): void {
    const stage = mission.stage
    root.querySelector<HTMLElement>('#phase-chip')!.textContent = phaseLabels[stage]
    root.querySelector<HTMLElement>('#mission-clock')!.textContent = `T+ ${formatClock(missionSeconds)}`
    const aLabel = root.querySelector<HTMLElement>('#metric-a-label')!
    const a = root.querySelector<HTMLElement>('#metric-a')!
    const aMeter = root.querySelector<HTMLElement>('#metric-a-meter')!
    const bLabel = root.querySelector<HTMLElement>('#metric-b-label')!
    const b = root.querySelector<HTMLElement>('#metric-b')!
    const bMeter = root.querySelector<HTMLElement>('#metric-b-meter')!
    if (stage === 'launch') {
      const spdVal = panel.querySelector<HTMLElement>('#speedo-value')
      const spdFill = panel.querySelector<HTMLElement>('#speedo-fill')
      const spdAlt = panel.querySelector<HTMLElement>('#speedo-alt')
      const curSpeed = mission.launchSpeedKmH
      const curAlt = mission.launchAltitudeKm
      if (spdVal) spdVal.textContent = curSpeed.toLocaleString('uz-UZ')
      if (spdFill) spdFill.style.width = `${Math.min(100, (curSpeed / 28080) * 100)}%`
      if (spdAlt) spdAlt.textContent = curAlt.toString()
      const liveAltitude = panel.querySelector<HTMLElement>('#ascent-alt-live')
      const liveSpeed = panel.querySelector<HTMLElement>('#ascent-speed-live')
      const liveAcceleration = panel.querySelector<HTMLElement>('#ascent-accel-live')
      const liveFuel = panel.querySelector<HTMLElement>('#ascent-fuel-live')
      const liveStage = panel.querySelector<HTMLElement>('#ascent-stage-live')
      if (liveAltitude) liveAltitude.textContent = `${mission.launchAltitudeM.toLocaleString('uz-UZ', { maximumFractionDigits: 0 })} m`
      if (liveSpeed) liveSpeed.textContent = `${mission.launchSpeedMps.toLocaleString('uz-UZ', { maximumFractionDigits: 0 })} m/s`
      if (liveAcceleration) liveAcceleration.textContent = `${mission.launchAccelerationMps2.toFixed(1)} m/s²`
      if (liveFuel) liveFuel.textContent = `${mission.launchFuelPercent.toFixed(1)}%`
      if (liveStage) liveStage.textContent = `${mission.launchStageNumber} / 3`
      const strata = mission.currentAtmosphereLayer
      if (strata) {
        const strataName = panel.querySelector<HTMLElement>('#strata-name')
        const strataDetail = panel.querySelector<HTMLElement>('#strata-detail')
        const strataDot = panel.querySelector<HTMLElement>('.strata-badge-dot')
        if (strataName) strataName.textContent = strata.name
        if (strataDetail) strataDetail.textContent = strata.detail
        if (strataDot) strataDot.style.backgroundColor = strata.color
      }
      drawAscentGraph('ascent-altitude-graph', mission.ascentTelemetry.altitudeKm, 100, '#80d8db')
      drawAscentGraph('ascent-velocity-graph', mission.ascentTelemetry.velocityKmps, 8, '#a2e3c2')
      drawAscentGraph('ascent-acceleration-graph', mission.ascentTelemetry.accelerationG, 6, '#e3bd71')
    } else if (stage === 'transit') {
      aLabel.textContent = t('hud.burn')
      a.textContent = `${Math.round(mission.burnProgress)}%`
      aMeter.style.width = `${mission.burnProgress}%`
      bLabel.textContent = t('hud.fuel')
      b.textContent = `${mission.fuel.toFixed(0)}%`
      bMeter.style.width = `${mission.fuel}%`
      const etaEl = panel.querySelector<HTMLElement>('#transit-eta')
      if (etaEl) etaEl.textContent = mission.transitEtaText
      const astEl = panel.querySelector<HTMLElement>('#asteroid-warning')
      if (astEl) {
        if (mission.transitHazardWarning) {
          astEl.style.display = 'block'
          astEl.textContent = mission.transitHazardWarning
        } else {
          astEl.style.display = 'none'
        }
      }
    } else if (stage === 'landing' || stage === 'landingFailed') {
      aLabel.textContent = t('landing.altitude')
      a.textContent = `${Math.max(0, mission.altitude).toFixed(0)} m`
      aMeter.style.width = `${100 - THREE_CLAMP(mission.altitude / 48 * 100)}%`
      bLabel.textContent = t('landing.fuel')
      b.textContent = `${mission.fuel.toFixed(0)}%`
      bMeter.style.width = `${mission.fuel}%`
      const alt = panel.querySelector<HTMLElement>('#landing-alt')
      const speed = panel.querySelector<HTMLElement>('#landing-speed')
      const fuel = panel.querySelector<HTMLElement>('#landing-fuel')
      if (alt) alt.innerHTML = `${Math.max(0, mission.altitude).toFixed(0)}<small> m</small>`
      if (speed) speed.innerHTML = `${Math.abs(mission.verticalSpeed).toFixed(1)}<small> m/s</small>`
      if (fuel) fuel.innerHTML = `${mission.fuel.toFixed(0)}<small>%</small>`
      const attitude = panel.querySelector<HTMLElement>('#landing-attitude')
      const indicator = panel.querySelector<HTMLElement>('#attitude-indicator')
      const slope = panel.querySelector<HTMLElement>('#landing-slope')
      const warning = panel.querySelector<HTMLElement>('#landing-warning')
      if (attitude) attitude.textContent = `${mission.landingTiltDegrees.toFixed(1)}°`
      if (indicator) indicator.style.transform = `rotate(${mission.landingRollRad * 180 / Math.PI}deg)`
      if (slope) slope.textContent = `${mission.landingSlopeDegrees.toFixed(1)}°`
      if (warning) {
        const messages = [
          mission.fuel < 20 ? t('landing.warningFuel') : '',
          mission.verticalSpeed < -5 ? t('landing.warningRate') : '',
          mission.landingTiltDegrees > 8 ? t('landing.warningTilt') : '',
          demoStarted && demoDirector.phase === 'descent'
            && Math.hypot(demoDescent.state.horizontalVelocityXMps, demoDescent.state.horizontalVelocityZMps) > 5
            ? t('landing.warningRate') : '',
          demoStarted && demoDirector.phase === 'descent' && mission.landingSlopeDegrees > 8
            ? t('landing.warningTilt') : '',
        ].filter(Boolean)
        warning.hidden = messages.length === 0
        warning.textContent = messages.join(' · ')
      }
      if (demoStarted && demoDirector.phase === 'descent') {
        const state = demoDescent.state
        const horizontal = panel.querySelector<HTMLElement>('#demo-hspeed')
        const touchdown = panel.querySelector<HTMLElement>('#demo-touchdown')
        const mode = panel.querySelector<HTMLElement>('#demo-mode-label')
        if (horizontal) horizontal.textContent = `${Math.hypot(state.horizontalVelocityXMps, state.horizontalVelocityZMps).toFixed(1)} m/s`
        if (touchdown) {
          const timeToGround = Math.max(0, state.altitudeM / Math.max(Math.abs(state.verticalSpeedMps), 0.1))
          const predictedX = state.xM + state.horizontalVelocityXMps * timeToGround
          const predictedZ = state.zM + state.horizontalVelocityZMps * timeToGround
          touchdown.textContent = `${Math.hypot(predictedX, predictedZ).toFixed(0)} m`
        }
        if (mode) mode.textContent = t(demoDescent.autopilot ? 'demo.landing.modeAuto' : 'demo.landing.modeManual')
      }
    } else if (stage === 'surface' || stage === 'complete') {
      aLabel.textContent = t('hud.research')
      a.textContent = `${mission.researched.size} / ${RESEARCH_OBJECTIVES.length}`
      aMeter.style.width = `${mission.researched.size / RESEARCH_OBJECTIVES.length * 100}%`
      bLabel.textContent = t('hud.oxygen')
      b.textContent = `${mission.oxygen.toFixed(0)}%`
      bMeter.style.width = `${mission.oxygen}%`
    } else {
      aLabel.textContent = t('hud.flight')
      a.textContent = phaseLabels[stage]
      aMeter.style.width = stage === 'countdown' ? '20%' : '0%'
      bLabel.textContent = t('hud.fuel')
      b.textContent = `${mission.fuel.toFixed(0)}%`
      bMeter.style.width = `${mission.fuel}%`
    }
    root.querySelector<HTMLElement>('#research-count')!.textContent = `${mission.researched.size} / ${RESEARCH_OBJECTIVES.length}`
    root.querySelector<HTMLElement>('#mini-objectives')!.innerHTML = RESEARCH_OBJECTIVES.map(item => `<span class="mini-objective ${mission.researched.has(item.id) ? 'is-done' : ''}"><i>${mission.researched.has(item.id) ? '✓' : ''}</i>${item.title}</span>`).join('')
    const nearest = mission.nearestResearch()
    const distance = panel.querySelector<HTMLElement>('#research-distance')
    const nearestLabel = panel.querySelector<HTMLElement>('#research-nearest')
    const researchButton = panel.querySelector<HTMLButtonElement>('[data-action="research"]')
    if (nearestLabel) nearestLabel.textContent = nearest?.title ?? t('surface.allComplete')
    if (distance) distance.textContent = nearest ? `${nearest.distance.toFixed(0)} m` : ''
    panel.querySelectorAll<HTMLElement>('.research-item[data-objective-id]').forEach(row => {
      const index = RESEARCH_OBJECTIVES.findIndex(item => item.id === row.dataset.objectiveId)
      const objective = RESEARCH_OBJECTIVES[index]
      if (!objective) return
      const completed = mission.researched.has(objective.id)
      row.classList.toggle('is-done', completed)
      row.querySelector('i')!.textContent = completed ? '✓' : `0${index + 1}`
      row.querySelector('small')!.textContent = completed ? t('research.complete') : objective.detail
    })
    if (researchButton && nearest) {
      const ready = nearest.distance <= CONFIG.mission.interactionRadius
      researchButton.disabled = !ready
      const label = researchButton.querySelector('span')
      if (label) label.textContent = ready ? t('surface.researchNow') : t('surface.driveCloser')
    }
    if (stage === 'launch') {
      const spdVal = panel.querySelector<HTMLElement>('#speedo-value')
      const spdFill = panel.querySelector<HTMLElement>('#speedo-fill')
      const spdAlt = panel.querySelector<HTMLElement>('#speedo-alt')
      const curSpeed = mission.launchSpeedKmH
      const curAlt = mission.launchAltitudeKm
      if (spdVal) spdVal.textContent = curSpeed.toLocaleString('uz-UZ')
      if (spdFill) spdFill.style.width = `${Math.min(100, (curSpeed / 28080) * 100)}%`
      if (spdAlt) spdAlt.textContent = curAlt.toString()
      drawAscentGraph('ascent-altitude-graph', mission.ascentTelemetry.altitudeKm, 100, '#80d8db')
      drawAscentGraph('ascent-velocity-graph', mission.ascentTelemetry.velocityKmps, 8, '#a2e3c2')
      drawAscentGraph('ascent-acceleration-graph', mission.ascentTelemetry.accelerationG, 6, '#e3bd71')
    } else if (stage === 'transit') {
      const burnValue = panel.querySelector<HTMLElement>('#burn-value')
      const burnMeter = panel.querySelector<HTMLElement>('#burn-meter')
      if (burnValue) burnValue.textContent = `${Math.round(mission.burnProgress)}%`
      if (burnMeter) burnMeter.style.width = `${mission.burnProgress}%`
      const distanceMeter = panel.querySelector<HTMLElement>('#distance-meter')
      if (distanceMeter) distanceMeter.style.width = `${mission.transferProgress * 100}%`
      const travelledDistance = panel.querySelector<HTMLElement>('#travelled-distance')
      if (travelledDistance) travelledDistance.textContent = `${mission.transferDistanceKm.toLocaleString('uz-UZ')} km`
      const continueButton = panel.querySelector<HTMLButtonElement>('[data-action="continue"]')
      if (continueButton) {
        continueButton.disabled = false
        const ready = mission.transitCaptured
        const span = continueButton.querySelector('span')
        const icon = continueButton.querySelector('i')
        if (span) span.textContent = ready ? 'OYGA QO‘NISHNI BOSHLASH 🚀' : 'OYGA TEZKOR YAQINLASHISH ⚡'
        if (icon) icon.textContent = ready ? '↓' : '⚡'
      }
      const moonDistance = panel.querySelector<HTMLElement>('#moon-distance')
      if (moonDistance) moonDistance.textContent = `${mission.distanceToMoonKm.toLocaleString('uz-UZ')} km`
      const transitTime = panel.querySelector<HTMLElement>('#transit-time')
      if (transitTime) transitTime.textContent = `${t('transit.time')}: ${formatTransitClock(mission.transferElapsed)}`
    }
    root.querySelector<HTMLElement>('#asset-status')!.textContent = modelWarning || (modelsReady ? t('hud.modelReady') : t('hud.modelLoading'))
    root.querySelector<HTMLElement>('#touch-controls')!.hidden = stage !== 'landing' && stage !== 'surface'
    root.querySelector<HTMLElement>('#sound-icon')!.textContent = muted ? '×' : '◖'
    pauseOverlay.hidden = !mission.paused
    if (mission.statusMessage && mission.statusMessage !== shownMessage) notify(mission.statusMessage)
  }

  function notify(message: string): void {
    shownMessage = message
    toast.textContent = message
    toast.classList.add('is-visible')
    window.setTimeout(() => toast.classList.remove('is-visible'), 2300)
    if (message.includes('BO‘LINISH')) audio.play('stage')
    else if (message.includes('MAX-Q') || message.includes('MECO') || message.includes('orbitasiga')) audio.play('radio')
  }

  function drawAscentGraph(canvasId: string, values: Float32Array, minimumScale: number, color: string): void {
    const canvas = panel.querySelector<HTMLCanvasElement>(`#${canvasId}`)
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const ratio = window.devicePixelRatio || 1
    const width = Math.max(1, Math.floor(canvas.clientWidth * ratio))
    const height = Math.max(1, Math.floor(canvas.clientHeight * ratio))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    context.clearRect(0, 0, width, height)
    const telemetry = mission.ascentTelemetry
    if (telemetry.count < 2) return
    let maxValue = minimumScale
    for (let i = 0; i < telemetry.count; i += 1) {
      const sample = values[(telemetry.next - telemetry.count + i + telemetry.capacity) % telemetry.capacity]!
      maxValue = Math.max(maxValue, sample)
    }
    context.beginPath()
    for (let i = 0; i < telemetry.count; i += 1) {
      const sample = values[(telemetry.next - telemetry.count + i + telemetry.capacity) % telemetry.capacity]!
      const x = i * (width - 2) / Math.max(telemetry.count - 1, 1) + 1
      const y = height - 1 - sample / maxValue * (height - 3)
      if (i === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    }
    context.strokeStyle = color
    context.lineWidth = Math.max(1, ratio)
    context.stroke()
  }

  function formatClock(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds))
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
  }

  function updateDemoHud(): void {
    const hud = root.querySelector<HTMLElement>('#demo-hud')!
    root.dataset.demo = demoStarted ? 'true' : 'false'
    root.dataset.demoPhase = demoStarted ? demoDirector.phase : ''
    hud.hidden = !demoStarted
    if (!demoStarted) return
    const elapsed = demoDirector.elapsedSeconds
    root.querySelector<HTMLElement>('#demo-clock')!.textContent = formatClock(elapsed)
    root.querySelector<HTMLElement>('#demo-progress-fill')!.style.width = `${Math.min(1, elapsed / DEMO_DURATION_SECONDS) * 100}%`
    const phase = demoDirector.phase
    root.querySelector<HTMLElement>('#demo-current')!.textContent = demoPhaseLabels[phase]
    root.querySelector<HTMLElement>('#demo-timewarp')!.hidden = phase !== 'transit'
    if (phase !== lastDemoPhase) {
      lastDemoPhase = phase
      const phases = ['ascent', 'transit', 'navigator', 'descent', 'results'] as const
      const currentIndex = phase === 'countdown' ? 0 : phases.indexOf(phase)
      root.querySelector<HTMLElement>('#demo-phase-row')!.innerHTML = phases.map((item, index) =>
        `<span class="demo-phase ${index < currentIndex ? 'is-done' : ''} ${index === currentIndex ? 'is-current' : ''}" title="${demoPhaseLabels[item]}"><i>${index < currentIndex ? '✓' : index + 1}</i><small>${demoPhaseLabels[item]}</small></span>`,
      ).join('')
    }
    const pauseButton = root.querySelector<HTMLButtonElement>('[data-action="demo-pause"]')!
    pauseButton.textContent = demoDirector.paused ? t('demo.resume') : t('demo.pause')
    root.querySelector<HTMLButtonElement>('[data-action="demo-skip"]')!.disabled = !demoDirector.active || phase === 'results'
  }

  function startDemo(): void {
    demoStarted = true
    lastDemoPhase = ''
    lastHandledDemoPhase = 'countdown'
    demoDirector.start()
    mission.beginDemo()
    missionSeconds = 0
    audio.startMusic()
    renderPanel()
    updateDemoHud()
  }

  function handleDemoPhase(): void {
    if (!demoStarted || lastHandledDemoPhase === demoDirector.phase) return
    lastHandledDemoPhase = demoDirector.phase
    audio.play('radio')
    if (demoDirector.phase === 'ascent') mission.demoStartLaunch()
    if (demoDirector.phase === 'transit') mission.demoStartTransit()
    if (demoDirector.phase === 'navigator') mission.demoPrepareNavigator()
    if (demoDirector.phase === 'descent') {
      const site = landingSiteById(demoDirector.selectedSiteId)
      demoDescent.start(site)
      landingReported = false
      mission.setDemoLandingSite(site)
      mission.demoBeginLanding()
      mission.setDemoLandingSite(site)
    }
    if (demoDirector.phase === 'results') {
      if (!demoDescent.state.landed) {
        demoDirector.waitForLanding()
        demoDescent.setAutopilot(true)
        mission.setAutopilot(true)
      }
      const outcome = mission.landingOutcome ?? demoDescent.state.outcome
      audio.play(outcome === 'crash' ? 'lose' : 'win')
    }
    renderPanel()
  }

  function selectDemoSite(siteId: string): void {
    if (!demoDirector.selectSite(siteId)) return
    mission.setDemoLandingSite(landingSiteById(siteId))
    renderPanel()
  }

  function formatTransitClock(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds))
    const days = Math.floor(safe / 86_400)
    const remainder = safe - days * 86_400
    return `${days} kun ${String(Math.floor(remainder / 3_600)).padStart(2, '0')}:${String(Math.floor(remainder % 3_600 / 60)).padStart(2, '0')}`
  }

  function THREE_CLAMP(value: number): number { return Math.min(100, Math.max(0, value)) }

  function unlockAudio(): void {
    audio.unlock()
    audio.play('ui')
  }

  function act(action: string): void {
    unlockAudio()
    const stageBefore = mission.stage
    if (action === 'begin') {
      demoStarted = false
      demoDirector.active = false
      mission.begin()
      missionSeconds = 0
      audio.startMusic()
    } else if (action === 'begin-demo') {
      startDemo()
    } else if (action === 'demo-manual') {
      demoDescent.setAutopilot(false)
      mission.setAutopilot(false)
    } else if (action === 'demo-auto') {
      demoDescent.setAutopilot(true)
      mission.setAutopilot(true)
    } else if (action === 'burn') mission.addTransferBurn()
    else if (action === 'camera-chase') mission.setLaunchCameraView('chase')
    else if (action === 'camera-engine') mission.setLaunchCameraView('engine')
    else if (action === 'camera-cabin') mission.setLaunchCameraView('cabin')
    else if (action === 'transit-cam-craft') { mission.setTransitCameraView('craft'); renderPanel(); }
    else if (action === 'transit-cam-overview') { mission.setTransitCameraView('overview'); renderPanel(); }
    else if (action === 'continue') {
      if (mission.stage === 'transit') {
        if (!mission.transitCaptured) {
          mission.fastForwardToMoon()
        } else {
          mission.beginLanding()
        }
      } else {
        mission.beginLanding()
      }
    }
    else if (action === 'fast-forward-moon') mission.fastForwardToMoon()
    else if (action === 'pulse') mission.pulseLandingThrust()
    else if (action === 'autopilot') mission.setAutopilot(!mission.autopilotEnabled)
    else if (action === 'research') mission.interact()
    else if (action === 'retry-land') mission.retryLanding()
    else if (action === 'restart') {
      if (demoStarted) startDemo()
      else { mission.begin(); missionSeconds = 0 }
    }
    else if (action === 'title') {
      mission.toTitle()
      demoStarted = false
      demoDirector.active = false
    }
    else if (action === 'pause') {
      mission.togglePause()
      demoDirector.paused = mission.paused
    }
    else if (action === 'resume') {
      mission.resume()
      demoDirector.paused = false
    }
    else if (action === 'demo-pause') {
      mission.togglePause()
      demoDirector.paused = mission.paused
    }
    else if (action === 'demo-skip') {
      demoDirector.skipPhase()
    }
    else if (action === 'sound') {
      muted = !muted
      save.update({ muted })
      audio.setVolumes(save.data.musicVolume, save.data.sfxVolume, muted)
    }
    loop.paused = mission.paused
    loop.resetAccumulator()
    if (mission.stage !== stageBefore || action === 'pause' || action === 'resume' || action === 'autopilot' || action === 'demo-pause' || action === 'begin-demo' || action.startsWith('camera-')) renderPanel()
    updateDemoHud()
  }

  root.addEventListener('click', event => {
    const site = (event.target as HTMLElement).closest<HTMLElement>('[data-demo-site]')
    if (site?.dataset.demoSite) {
      selectDemoSite(site.dataset.demoSite)
      return
    }
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')
    if (!target || target.dataset.action === 'warp') return
    act(target.dataset.action ?? '')
  })
  window.addEventListener('keydown', event => {
    if (mission.stage === 'launch') {
      const cameraViews = { '1': 'chase', '2': 'engine', '3': 'cabin' } as const
      const view = cameraViews[event.key as keyof typeof cameraViews]
      if (view) {
        event.preventDefault()
        mission.setLaunchCameraView(view)
        renderPanel()
        return
      }
    }
    if (mission.stage === 'transit') {
      if (event.key === '1') {
        event.preventDefault()
        mission.setTransitCameraView('craft')
        renderPanel()
        return
      }
      if (event.key === '2') {
        event.preventDefault()
        mission.setTransitCameraView('overview')
        renderPanel()
        return
      }
    }
    if (demoDirector.phase !== 'navigator' || !demoStarted) return
    const siteIndex = Number(event.key) - 1
    if (siteIndex >= 0 && siteIndex < LANDING_SITES.length) {
      event.preventDefault()
      selectDemoSite(LANDING_SITES[siteIndex]!.id)
    }
  })
  root.addEventListener('change', event => {
    const target = event.target
    if (target instanceof HTMLSelectElement && target.dataset.action === 'warp') {
      const multiplier = Number(target.value)
      if (!mission.setTimeWarp(multiplier)) {
        target.value = String(mission.timeWarp)
        notify(t('transit.invalidTimeScale'))
      }
    } else if (target instanceof HTMLSelectElement && target.dataset.action === 'difficulty') {
      if (!mission.setDifficulty(target.value)) target.value = mission.difficulty
    }
  })
  root.addEventListener('pointerdown', event => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-hold], [data-move]')
    if (!target) return
    const pointerId = event.pointerId
    target.setPointerCapture(pointerId)
    if (target.dataset.hold === 'thrust') activeThrustPointers.add(pointerId)
    if (target.dataset.move) activeTouchDirections.set(pointerId, target.dataset.move)
    updateTouchControls()
  })
  const releaseControl = (event: PointerEvent) => {
    activeThrustPointers.delete(event.pointerId)
    activeTouchDirections.delete(event.pointerId)
    updateTouchControls()
  }
  root.addEventListener('pointerup', releaseControl)
  root.addEventListener('pointercancel', releaseControl)
  function updateTouchControls(): void {
    const vectors: Record<string, [number, number]> = { forward: [0, 1], back: [0, -1], left: [-1, 0], right: [1, 0] }
    let x = 0
    let y = 0
    for (const direction of activeTouchDirections.values()) {
      const [dx, dy] = vectors[direction] ?? [0, 0]
      x += dx
      y += dy
    }
    input.setTouchMove(x, y)
    mission.setThrustButton(activeThrustPointers.size > 0)
  }
  function clearTouchControls(): void {
    activeTouchDirections.clear()
    activeThrustPointers.clear()
    updateTouchControls()
  }

  function stageChanged(): void {
    if (lastStage === mission.stage) return
    lastStage = mission.stage
    clearTouchControls()
    if (mission.stage === 'launch') audio.play('jump')
    if (mission.stage === 'surface') audio.play('land')
    if (mission.stage === 'landingFailed') audio.play('hurt')
    if (mission.stage === 'complete') audio.play('win')
    renderPanel()
  }

  renderPanel()
  loop = new GameLoop({
    beforeFrame: frameSeconds => {
      input.update(frameSeconds)
      if (input.consume('pause')) {
        mission.togglePause()
        demoDirector.paused = mission.paused
        loop.paused = mission.paused
        renderPanel()
        updateDemoHud()
      }
    },
    step: dt => {
      if (mission.stage !== 'title' && mission.stage !== 'complete' && !mission.paused) missionSeconds += dt
      mission.step(dt, input)
      if (demoStarted && (demoDirector.phase === 'descent' || demoDirector.phase === 'results') && mission.stage === 'landing') {
        const state = demoDescent.state
        if (!state.landed) {
          if (demoDirector.phase === 'results') demoDescent.setAutopilot(true)
          demoDescent.step(dt * (demoDirector.phase === 'results' ? 8 : 1), input, input.held('jump') || mission.demoThrustHeld)
          mission.demoSyncDescent(state)
          if (state.landed && !landingReported && state.outcome) {
            landingReported = true
            mission.demoCompleteLanding(state.outcome)
            demoDirector.landingComplete()
            if (demoDirector.phase === 'results') renderPanel()
          }
        }
        if (demoDirector.elapsedSeconds >= DEMO_MAX_DURATION_SECONDS && !state.landed) {
          demoDescent.forceCrash()
          mission.demoSyncDescent(state)
          mission.demoCompleteLanding('crash')
          landingReported = true
          demoDirector.landingComplete()
          renderPanel()
        }
      }
      const selectedBeforeUpdate = demoDirector.selectedSiteId
      demoDirector.update(dt)
      if (selectedBeforeUpdate !== demoDirector.selectedSiteId && demoDirector.phase === 'navigator') renderPanel()
      handleDemoPhase()
      stageChanged()
    },
    render: (_alpha, frameSeconds) => {
      mission.render(frameSeconds)
      refreshTimer += frameSeconds
      if (refreshTimer > 0.15) {
        refreshTimer = 0
        updateTelemetry()
        updateDemoHud()
      }
      audio.setEngineRumble(
        demoStarted && (demoDirector.phase === 'descent' || demoDirector.phase === 'results')
          ? demoDescent.state.landed ? 0 : demoDescent.state.throttle
          : mission.stage === 'launch' ? mission.launchThrottle : 0,
      )
      loop.paused = mission.paused
    },
  })
  loop.start()
  if (import.meta.env.DEV) {
    void Promise.all([import('../../scripts/manus-tuning/adapter.js'), import('./tuning')])
      .then(([bridge, { tuning }]) => bridge.registerGameTuning(tuning))
      .catch(() => console.warn('Rivojlantirish paneli ulanmagan.'))
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !mission.paused && mission.stage !== 'title' && mission.stage !== 'complete') {
      mission.paused = true
      loop.paused = true
      renderPanel()
    }
  })
  root.querySelector<HTMLElement>('.mission-panel')!.addEventListener('transitionend', () => updateTelemetry())

  // The stored GLBs load in user Preview and production; smoke can opt into the complete procedural fallback.
  if (new URLSearchParams(location.search).get('skipModels') === '1') {
    modelWarning = t('hud.modelFallback')
    finishLoading()
    updateTelemetry()
    if (demoRequested) startDemo()
  } else {
    window.setTimeout(() => {
      void mission.loadModels(assets, ASSET_URLS).then(result => {
        modelsReady = result.rocket || result.rover
        if (!result.rocket || !result.rover) modelWarning = t('hud.modelFallback')
        finishLoading()
        updateTelemetry()
        if (mission.stage === 'title') renderPanel()
        if (demoRequested && mission.stage === 'title') startDemo()
      }).catch(() => {
        modelWarning = t('hud.modelFallback')
        finishLoading()
        updateTelemetry()
        if (demoRequested && mission.stage === 'title') startDemo()
      })
    }, 450)
  }
  ;(window as unknown as { __game: unknown }).__game = {
    mission, input, save,
    objectivePoints: RESEARCH_OBJECTIVES.map(({ id, position }) => ({ id, x: position.x, z: position.z })),
  }
}

function showBootFailure(error: unknown): void {
  const root = document.getElementById('ui')
  if (!root) return
  root.innerHTML = `<div class="boot-error" role="alert"><span class="panel-kicker">OY MISSIYASI · TIZIM XABARI</span><h1>MISSIYA BOSHLANMADI</h1><p>3D tasvirni ishga tushirib bo‘lmadi. Sahifani qayta yuklab, yana urinib ko‘ring.</p><button class="button button-primary" type="button">QAYTA URINISH</button></div>`
  root.querySelector('button')?.addEventListener('click', () => location.reload())
  console.error('Oy Missiyasi ishga tushmadi.', error)
}

try { boot() } catch (error) { showBootFailure(error) }
