# Change Log

## 2026-11-09 - Physics foundation

- Added `src/sim/physics.ts`, a renderer-independent SI ascent model with Earth point-mass gravity, exponential atmosphere, Mach-dependent drag, variable mass, three engine stages, max-Q tracking, and a fixed 1/120 s substep. This supports acceptance test 1's shared-state requirement, but no telemetry graphs have been added.
- Connected launch altitude, speed, and rocket transform to the same ascent state. The ascent no longer ends on an 8.2-second easing timer. This is partial evidence for acceptance tests 1 and 3; the simulated vehicle does not reach the requested parking orbit.
- Added fixed-size telemetry ring buffers and three live launch plots for altitude, velocity, and acceleration. The plots and rocket transform read the same ascent state. The browser smoke test confirms all plots are present and receiving samples.
- Split the procedural launch vehicle into three component groups. Spent stages 1 and 2 inherit velocity, receive a retro impulse, tumble, and are integrated with gravity and drag; they are hidden below 20 km. This partially satisfies acceptance test 2. Stage 3's post-TLI separation, launch-escape-tower jettison, and fairing split remain unimplemented.
- Preserved the existing lander and rover as distinct objects. The rover remains hidden until successful landing, consistent with acceptance test 6; the descent outcome model has not been upgraded.
- Added numerical tests for Tsiolkovsky delta-v, staged fuel/separation timing, 185 km circular-orbit speed and propagation, orbital-energy drift, lunar free fall, and Horn slope estimation. These support acceptance test 9.
- Corrected the displayed mean Earth-Moon separation to 384.4 world units at 1,000 km/unit, set the Moon diameter to 3,474.8 km to match its 1,737.4 km radius, and tightened the procedural crater bowl so its center is lower than nearby terrain. This partially satisfies acceptance test 4; floating-origin rendering is still absent.
- Updated `scripts/smoke.mjs` to advance the ascent by simulated time through the same mission stepper instead of waiting several wall-clock minutes.
- Added this file, `PHYSICS.md`, and `DEMO-60-SECOND.md` as requested deliverables.

## Acceptance status

1. **Pass for plotted data.** Altitude, velocity, and acceleration plots are sampled from the same physics state that moves the rocket, and browser smoke verifies all three. Other requested live HUD fields and graph labels remain limited.
2. **Partial.** Two spent stages separate as individual moving groups. Tower/fairing jettison and stage 3 post-TLI separation are absent.
3. **Fail.** The state crosses the current launch-to-transit threshold near 226 km and 7.60 km/s, not a 185 km circular orbit at 7.8 km/s. The full three-stage burn ends near 526 simulated seconds.
4. **Partial.** Earth and Moon radii, their ratio, and the 384.4-unit separation at 1 unit = 1,000 km are correct. Floating-origin camera handling and logarithmic depth are absent.
5. **Fail.** Transit still uses a 10-second quadratic Bezier animation; TLI, three-day coast, and LOI physics are not implemented.
6. **Pass for current flow.** The lander and rover are distinct; the rover is shown only in surface/complete stages after a successful landing.
7. **Fail.** Landing still checks vertical speed and target radius only; horizontal speed, tilt, slope, tip-over, and the specified outcomes are absent.
8. **Fail.** The five-site navigator, adjustable weights, hazard map, and target HUD are not implemented.
9. **Pass for configured gates.** Type-check, all 87 tests, production build, and browser smoke pass. The repository has no lint script, so lint is not independently verified.