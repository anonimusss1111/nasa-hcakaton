// End-to-end smoke test for the Oy Missiyasi game; builds must exist in dist/ (`pnpm build`).
// Verifies the complete mission loop in headless Chromium and captures stage screenshots.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}/?skipModels=1`
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: false })
let browser
const guard = setTimeout(() => fail('timed out'), 240_000)

function cleanup() {
  clearTimeout(guard)
  try { server.kill('SIGTERM') } catch {}
}
async function fail(msg) {
  console.error(`smoke: FAIL — ${msg}`)
  await browser?.close().catch(() => {})
  cleanup()
  process.exit(1)
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(url)).ok) return
    } catch {}
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error('preview server did not start')
}

async function openGame(context, errors) {
  const page = await context.newPage()
  page.on('console', m => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', e => errors.push(String(e)))
  page.on('response', r => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`))
  await page.goto(url)
  await page.waitForSelector('#mission-panel h1', { timeout: 30_000 })
  await page.waitForFunction(() => document.querySelector('.loading-screen')?.classList.contains('is-hidden') === true, null, { timeout: 30_000 })
  await page.evaluate(async () => {
    await document.fonts.ready
    if (document.documentElement.lang !== 'uz') throw new Error(`Game language changed to ${document.documentElement.lang}`)
    if (!document.fonts.check('12px ManusCC0')) throw new Error('Bundled ManusCC0 font did not load')
  })
  await page.waitForTimeout(250)
  return page
}

const state = page => page.evaluate(() => {
  const { mission } = window.__game
  return {
    stage: mission.stage,
    burnProgress: mission.burnProgress,
    transferElapsed: mission.transferElapsed,
    altitude: mission.altitude,
    verticalSpeed: mission.verticalSpeed,
    fuel: mission.fuel,
    autopilotEnabled: mission.autopilotEnabled,
    researched: [...mission.researched].length,
    paused: mission.paused,
  }
})

try {
  await waitForServer()
  // Prefer the sandbox Chromium binary, then fall back to Playwright's browser or Chrome.
  const args = ['--ignore-gpu-blocklist']
  const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)
  browser = await chromium.launch({ args, ...(executablePath ? { executablePath } : {}) }).catch(() => chromium.launch({ args, channel: 'chrome' }))
  const errors = []

  const waitForStage = async (page, stage, timeout = 25_000) => {
    try {
      await page.waitForFunction(expected => window.__game?.mission.stage === expected, stage, { timeout })
    } catch (error) {
      const current = await page.evaluate(() => {
        const mission = window.__game?.mission
        return {
          stage: mission?.stage,
          altitudeM: mission?.ascent?.altitudeM,
          speedMps: mission?.ascent ? Math.hypot(mission.ascent.downrangeVelocityMps, mission.ascent.verticalVelocityMps) : undefined,
          vehicleStage: mission?.ascent?.stageIndex,
        }
      })
      throw new Error(`${error.message}; waiting for ${stage}, current state: ${JSON.stringify(current)}`)
    }
  }
  const en = await browser.newContext({ viewport: { width: 1365, height: 768 }, locale: 'en-US' })
  const page = await openGame(en, errors)
  await page.screenshot({ path: `${out}/01-title.png` })
  await page.click('[data-action="begin"]')
  await waitForStage(page, 'countdown')
  if (await page.locator('text=RAKETANI YIG‘ING').count()) throw new Error('rocket assembly flow is still shown')
  await page.screenshot({ path: `${out}/02-countdown.png` })
  await waitForStage(page, 'launch')
  await page.waitForTimeout(500)
  const waterRings = await page.evaluate(() => window.__game.mission.launchWaterRings.filter(ring => ring.visible).length)
  if (waterRings !== 3) throw new Error(`expected 3 launch water rings, got ${waterRings}`)
  const graphState = await page.evaluate(() => ({
    samples: window.__game.mission.ascentTelemetry.count,
    graphCount: document.querySelectorAll('.ascent-graphs canvas').length,
  }))
  if (graphState.samples < 5 || graphState.graphCount !== 3) throw new Error(`physics graphs not populated: ${JSON.stringify(graphState)}`)
  await page.screenshot({ path: `${out}/03-launch.png` })
  await page.evaluate(() => {
    const { mission, input } = window.__game
    for (let elapsed = 0; elapsed < 900 && mission.stage === 'launch'; elapsed += 1 / 60) mission.step(1 / 60, input)
  })
  await waitForStage(page, 'transit', 20_000)
  const detachedStages = await page.evaluate(() => {
    const { mission } = window.__game
    return mission.rocketStageGroups.slice(0, 2).every(group => group.parent === mission.hangar)
  })
  if (!detachedStages) throw new Error('spent rocket stages did not detach from the main vehicle')
  await page.screenshot({ path: `${out}/04-transit.png` })
  const transitStart = await page.evaluate(() => ({
    x: window.__game.mission.flightCraft.position.x,
    progressVisible: window.__game.mission.flightPathLine.visible,
    earthRotation: window.__game.mission.earthBody.earthMesh.rotation.y,
    moonRotation: window.__game.mission.moonBody.moonMesh.rotation.y,
    planetOrbit: window.__game.mission.solarPlanetOrbits[0].rotation.z,
  }))
  if (!transitStart.progressVisible) throw new Error('transit trajectory is not visible')
  if (transitStart.earthRotation === undefined || transitStart.moonRotation === undefined) {
    throw new Error('Earth and Moon scene bodies are missing')
  }
  if (transitStart.planetOrbit === undefined) throw new Error('solar system planet orbit is missing')
  await page.click('[data-action="autopilot"]')
  if ((await state(page)).autopilotEnabled) throw new Error('manual transit did not disable autopilot')
  for (let i = 0; i < 6; i += 1) {
    await page.click('[data-action="burn"]')
    await page.waitForTimeout(80)
  }
  await page.keyboard.down('Space')
  await page.waitForFunction(() => window.__game?.mission.transitCaptured === true, null, { timeout: 60_000 })
  await page.keyboard.up('Space')
  const transitMotion = await page.evaluate(() => ({
    x: window.__game.mission.flightCraft.position.x,
    earthRotation: window.__game.mission.earthBody.earthMesh.rotation.y,
    moonRotation: window.__game.mission.moonBody.moonMesh.rotation.y,
    planetOrbit: window.__game.mission.solarPlanetOrbits[0].rotation.z,
  }))
  if (Math.abs(transitMotion.x - transitStart.x) < 2) {
    throw new Error('integrated transit state did not move the lander')
  }
  if (transitMotion.earthRotation === transitStart.earthRotation || transitMotion.moonRotation === transitStart.moonRotation) {
    throw new Error('Earth and Moon did not rotate during transit')
  }
  if (transitMotion.planetOrbit === transitStart.planetOrbit) throw new Error('solar system planets did not orbit the Sun')
  await page.locator('#solar-system-panel').waitFor({ state: 'visible' })
  const solarSystem = await page.locator('#solar-system-panel .solar-planet').count()
  if (solarSystem !== 8) throw new Error(`expected 8 solar system planets, got ${solarSystem}`)
  await page.click('[data-action="continue"]')
  await waitForStage(page, 'landing')
  await page.screenshot({ path: `${out}/05-landing.png` })

  const beforePulse = (await state(page)).verticalSpeed
  await page.click('[data-action="pulse"]')
  if (!((await state(page)).verticalSpeed > beforePulse)) throw new Error('retro-thrust did not reduce descent speed')
  await page.click('[data-action="autopilot"]')
  await page.waitForFunction(() => ['surface', 'landingFailed'].includes(window.__game?.mission.stage), null, { timeout: 60_000 })
  const landed = await state(page)
  if (landed.stage !== 'surface') throw new Error(`expected lunar surface, got ${landed.stage} at ${landed.altitude.toFixed(1)} m and ${landed.verticalSpeed.toFixed(1)} m/s`)
  await page.screenshot({ path: `${out}/06-lunar-surface.png` })

  await page.keyboard.down('w')
  await page.keyboard.down('d')
  await page.waitForTimeout(650)
  const roverSteering = await page.evaluate(() => {
    const mission = window.__game.mission
    return {
      heading: mission.roverHeading,
      x: mission.roverX,
      z: mission.roverZ,
      frontWheelAngle: mission.steeringWheels[0]?.rotation.y ?? 0,
      wheelRotation: mission.wheelRollGroups[0]?.rotation.x ?? 0,
      suspensionCount: mission.suspensionStruts.length,
      wheelHeightSpread: Math.max(...mission.wheelPivots.map(wheel => wheel.position.y)) - Math.min(...mission.wheelPivots.map(wheel => wheel.position.y)),
    }
  })
  await page.keyboard.up('w')
  await page.keyboard.up('d')
  if (Math.hypot(roverSteering.x, roverSteering.z) < 0.1 || roverSteering.heading <= 0) {
    throw new Error(`rover throttle and steering did not move the vehicle: ${JSON.stringify(roverSteering)}`)
  }
  if (roverSteering.frontWheelAngle <= 0.2 || Math.abs(roverSteering.wheelRotation) < 0.1) {
    throw new Error(`rover steering or wheel rotation did not animate: ${JSON.stringify(roverSteering)}`)
  }
  if (roverSteering.suspensionCount !== 6 || roverSteering.wheelHeightSpread <= 0.005) {
    throw new Error(`rover terrain suspension did not respond: ${JSON.stringify(roverSteering)}`)
  }

  await page.click('[data-action="pause"]')
  await page.waitForFunction(() => window.__game?.mission.paused === true)
  await page.screenshot({ path: `${out}/07-pause.png` })
  await page.click('[data-action="resume"]')
  await page.waitForFunction(() => window.__game?.mission.paused === false)

  const driveToNearest = async () => {
    for (let i = 0; i < 220; i += 1) {
      const route = await page.evaluate(() => {
        const { mission, objectivePoints } = window.__game
        const nearest = mission.nearestResearch()
        const point = objectivePoints.find(p => p.id === nearest?.id)
        return { nearest, point, x: mission.roverX, z: mission.roverZ, heading: mission.roverHeading }
      })
      if (!route.nearest || route.nearest.distance <= 4.8) return route.nearest
      if (!route.point) throw new Error(`missing research marker for ${route.nearest.id}`)
      const dx = route.point.x - route.x
      const dz = route.point.z - route.z
      const bearing = Math.atan2(dx, dz)
      const forwardError = Math.atan2(Math.sin(bearing - route.heading), Math.cos(bearing - route.heading))
      const reverse = Math.abs(forwardError) > Math.PI / 2
      const desiredHeading = reverse ? Math.atan2(Math.sin(bearing + Math.PI), Math.cos(bearing + Math.PI)) : bearing
      const steeringError = Math.atan2(Math.sin(desiredHeading - route.heading), Math.cos(desiredHeading - route.heading))
      const steeringDirection = steeringError * (reverse ? -1 : 1)
      const keys = [reverse ? 's' : 'w']
      if (steeringDirection > 0.08) keys.push('d')
      else if (steeringDirection < -0.08) keys.push('a')
      for (const key of keys) await page.keyboard.down(key)
      await page.waitForTimeout(180)
      for (const key of keys) await page.keyboard.up(key)
    }
    throw new Error('rover did not reach its nearest scientific objective')
  }

  for (let i = 1; i <= 3; i += 1) {
    const target = await driveToNearest()
    if (!target) throw new Error('research map ended before all three experiments')
    await page.click('[data-action="research"]')
    await page.waitForFunction(count => window.__game?.mission.researched.size >= count, i, { timeout: 5_000 })
    console.log(`smoke: research objective ${i}/3 completed (${target.id})`)
  }
  const done = await state(page)
  if (done.stage !== 'complete' || done.researched !== 3) throw new Error(`mission ended unexpectedly: ${JSON.stringify(done)}`)
  await page.screenshot({ path: `${out}/08-mission-complete.png` })
  console.log('smoke: launched, landed, and completed all three rover investigations')

  const autopilotPage = await openGame(en, errors)
  await autopilotPage.click('[data-action="begin"]')
  await waitForStage(autopilotPage, 'countdown')
  await waitForStage(autopilotPage, 'launch')
  await autopilotPage.evaluate(() => {
    const { mission, input } = window.__game
    for (let elapsed = 0; elapsed < 900 && mission.stage === 'launch'; elapsed += 1 / 60) mission.step(1 / 60, input)
  })
  await waitForStage(autopilotPage, 'transit', 20_000)
  if (!(await state(autopilotPage)).autopilotEnabled) await autopilotPage.click('[data-action="autopilot"]')
  if (!(await state(autopilotPage)).autopilotEnabled) throw new Error('autopilot did not turn on')
  await waitForStage(autopilotPage, 'landing', 60_000)
  await waitForStage(autopilotPage, 'surface', 35_000)
  const autopilotLanding = await state(autopilotPage)
  if (!autopilotLanding.autopilotEnabled || autopilotLanding.fuel <= 0) {
    throw new Error(`autopilot landing did not complete safely: ${JSON.stringify(autopilotLanding)}`)
  }
  console.log(`smoke: autopilot transferred and landed safely with ${autopilotLanding.fuel.toFixed(0)}% fuel remaining`)
  await autopilotPage.close()
  await en.close()

  const zh = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'zh-CN' })
  const zhPage = await openGame(zh, errors)
  await zhPage.screenshot({ path: `${out}/09-pinned-language.png` })
  await zh.close()

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN' })
  const phonePage = await openGame(phone, errors)
  await phonePage.tap('[data-action="begin"]')
  await waitForStage(phonePage, 'countdown')
  await phonePage.screenshot({ path: `${out}/10-phone-countdown.png` })
  const touchVisible = await phonePage.locator('#touch-controls').isHidden()
  if (!touchVisible) throw new Error('touch flight controls should be hidden before the landing phase')
  await phone.close()

  if (errors.length) throw new Error(`console errors:\n  ${errors.join('\n  ')}`)
  await browser.close()
  cleanup()
  console.log(`smoke: OK — screenshots in ${out}/`)
} catch (err) {
  await fail(err?.message ?? String(err))
}
