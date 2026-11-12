# Oy Missiyasi — loyiha holati

## Bajarilgan va joriy etilgan

- [x] Asosiy uchirish, tranzit, qo‘nish va rover/sirt update logikasini alohida scene sinflariga ajratish; `MissionSceneMachine` orqali `enter/update/exit` hayot sikli.
- [x] Feedback ascent guidance, uch bosqich ajratilishi, 185 km orbitaga circularizatsiya va orbital elementlar testi.
- [x] Ascent telemetriyasi: balandlik, tezlik, tezlanish, yonilg‘i, bosqich va grafiklar.
- [x] Yer–Oy planar, moving-Moon velocity-Verlet transfer; TLI, idealized LOI, autopilot/manual burn va 1×–10 000× vaqt ko‘paytirgichi.
- [x] 1.62 m/s² Oy tortish kuchi, yonilg‘ili descent integratori, feedback avtopilot, easy/normal/hard qiyinlik va tezlik/qiyalik/qiyalik yuzasi bo‘yicha landing grade.
- [x] Additiv 60 soniyalik demo: URL `?demo=60`, sarlavha tugmasi, 5 bosqichli timer, pauza/o‘tkazish va 65 soniyalik descent fail-safe.
- [x] Demo uchun 4 hududli Oy qo‘nish navigatori, tanlov/8 soniyada tavsiya, saytga mos safe-zone/boulder/yoritish/qiyinlik va S–F natija ekrani.
- [x] Demo lunar descent fixed-step integratori, qo‘lda boshqaruv, o‘zgartiriladigan PD avtopilot va 100 randomized-start auto-landing regression testi.
- [x] Demo presenter script, lokalizatsiya (uz/en/zh-CN), mission clock/progress, qo‘nish HUD, sintezlangan engine rumble/radio va yengil dust effekt.
- [x] Logarithmic depth buffer; o‘rta/yuqori/past sifatlar va sekin kadrda avtomatik pasaytirish.
- [x] Existing rover/science tasks, instanced rocks, procedural terrain, WebAudio, local save and offline packaging preserved.

## Keyingi ish / soddalashtirilgan qismlar

- [ ] Demo va to‘liq missiya uchun barycentric/3D n-body, selectable manual burn vector/duration, fizik midcourse-targetlash va sustained lunar-orbit coast. Demo transit qisqa taqdimot uchun time-scaled; ayrim holatda Oy uchrashuviga demo fallback ishlatiladi.
- [ ] DEM-based safe-zone selection, chunked terrain LOD and normal maps.
- [ ] Rapier suspension raycast rover, tracks and wheel dust.
- [ ] Lunar descent uchun haqiqiy pooled particle regolith plume, sun glare va high-tier cascade shadows. Demo dust ring — vizual belgi, zarracha simulyatsiyasi emas.
- [ ] To‘liq missiya uchun persistent grade/results/best-score oqimi, tutorial, til/volume/quality settings UI, inglizcha/xitoycha to‘liq tarjima va kengaytirilgan mobile landing attitude controls.
- [ ] Broader mobile/performance profiling and visual regression coverage on weak integrated GPUs.

## Tekshiruvlar

- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- `corepack pnpm smoke` (builddan keyin)
