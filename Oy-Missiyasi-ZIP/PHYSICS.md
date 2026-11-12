# Physics Notes

## Implemented model

`src/sim/physics.ts` is rendering-independent and uses SI units. Ascent subdivides time into steps no larger than 1/120 s. The full mission advances at 1x game time; only the 60-second demo uses a 75x physics time scale to fit ascent into its 14-second orbit slot. Its 2D Earth-centered equations include point-mass gravity, an exponential atmosphere, speed-dependent drag, density-adjusted engine Isp, staged propellant use, and detached-stage motion. Guidance holds vertical through the initial rise, then gradually pitches by altitude and measured flight-path error before using radial/tangential feedback to target a stable 185 km circular orbit. The tests verify insertion speed near 7.8 km/s and perigee/apogee within 2%.

The ascent state is the source for rocket position and the fixed-size typed-array telemetry history. Launch visuals use meter-based coordinates, a curved Earth with the supplied Earth texture, and an altitude-driven transition from atmospheric sky to space; the Moon uses its supplied global texture at its real mean distance and radius. The launch panel displays current altitude, speed, acceleration, remaining propellant, stage, and three compact history plots.

Earth-Moon transit uses velocity-Verlet integration of spacecraft gravity from Earth and a moving point-mass Moon. A computed prograde TLI burn targets the transfer ellipse; an idealized LOI impulse circularizes at the lunar encounter radius. Encounter detection runs at the same maximum 30-second interval as the integrator so time warp cannot skip the capture window. The full mission time-warp selector scales simulated time from 1x to 10,000x. Position is Earth-centered in the simulation and rendered in that local frame.

The demo has its own fixed-step descent model in `src/sim/descent.ts`: 1.62 m/s² gravity, throttle and fuel depletion, lateral motion, and PD attitude response. The auto-guidance nulls lateral position/velocity and follows an altitude-dependent descent-speed profile. A Horn 3x3 terrain estimate plus the chosen site's slope, effective safe-zone radius, touchdown speed, tilt, and offset grade PERFECT/SAFE/HARD/CRASH. The site data also controls the local instanced-boulder count, sun angle, and result multiplier. One hundred seeded randomized auto-landing cases are tested inside the 14-second descent slot.

The demo director compresses each scene into a fixed one-minute timeline. Its transit displays x10,000 and runs the same velocity-Verlet equations with an additional 3.6x director pacing factor. A 1.5 m/s midcourse correction is applied near the transfer midpoint. If integration has not produced lunar capture by the navigator, the demo moves the state to a 100 km lunar encounter and applies the idealized LOI impulse so the timed presentation can continue. If an unfinished descent reaches the 60-second result boundary, auto-guidance is engaged and the director permits at most five additional seconds.

## Constants and sources

- Earth $\mu=3.986004418\times10^{14}$ m³/s² and mean radius 6,371,000 m: NASA/NSSDC Earth Fact Sheet, https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html.
- Lunar $\mu=4.9048695\times10^{12}$ m³/s², mean Earth-Moon distance 384,400 km, and surface gravity 1.62 m/s² are project constants.
- $g_0=9.80665$ m/s²: standard gravity used in the Tsiolkovsky equation.
- Sea-level density 1.225 kg/m³ and scale height 8,500 m are standard near-surface approximations, not the US Standard Atmosphere.
- Stage masses, propellant loads, engine performance, and areas are generic Saturn-V-class tuning estimates, not a real vehicle specification or sourced flight record.

## Simplifications and limits

- Ascent is a 2D point-mass model. It omits Earth rotation, wind, attitude dynamics, thrust-vector control, staging delays, and detailed atmospheric tables. Guidance is feedback-based but is not a flight-certified launch guidance system.
- Transit is planar and uses a circular, point-mass lunar ephemeris. The fixed Earth origin omits the Earth-Moon barycenter and solar perturbations. Manual control provides prograde TLI and a held-burn LOI request; it does not expose arbitrary 3D thrust-vector control or numerical midcourse-correction targeting.
- LOI is an idealized instantaneous circularization at lunar encounter distance; it does not simulate a sustained lunar-orbit coast. The demo's fixed-slot fallback can place the craft at lunar encounter before that impulse.
- The displayed planetary overview remains a schematic. The simulation's Earth-Moon plane is projected onto the transit rendering.
- Demo descent is a 2D point-mass model with simplified lateral thrust and attitude, not a full 6-DOF lander. The four named sites carry honest profile scores but are not selected from a global DEM; the shared local terrain is procedural.
- Lunar dust is a low-cost ground ring rather than a full particle plume. There is no full chunked terrain LOD, normal map, Rapier rover raycast vehicle, cascade shadow system, or complete settings/tutorial flow. The demo has its own result screen; full-mission rover handling, science tasks, and landing remain game-oriented approximations.
- The renderer enables logarithmic depth; the transit simulation/rendering uses Earth-centered coordinates rather than a general-purpose floating-origin rebasing system.
