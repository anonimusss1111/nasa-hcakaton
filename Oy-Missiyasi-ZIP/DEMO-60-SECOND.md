# 60-Second Demo Script

## Start

```powershell
corepack pnpm dev
```

Open the Vite URL with `?demo=60` (normally `http://127.0.0.1:3000/?demo=60`). The demo starts after the loading screen; no console command or extra click is needed. The title screen also has a **60 SONIYALIK DEMO** button. Leave `?demo=60` off to play the unchanged full mission.

## Presenter timeline

| Time | What to do | What to say |
| --- | --- | --- |
| 00–06 s | Let the countdown run; point to the mission clock and five progress markers. | “Bir daqiqada uchirishdan Oyga qo‘nish natijasigacha bo‘lgan missiyani ko‘ramiz.” |
| 06–12 s | Watch ignition and the rocket lift from the pad. | “Bu alohida demo oqimi; asosiy missiyaning odatiy rejimi saqlangan.” |
| 12–18 s | Point to altitude, speed, fuel, stage, and the MAX-Q / stage callouts. | “Ko‘tarilish bosqichli raketa va feedback guidance simulyatsiyasidan foydalanadi.” |
| 18–22 s | Let ascent reach the orbit transition. | “Demoda orbitaga yetish uchun ascent fizikasi vaqt bo‘yicha tezlashtirilgan.” |
| 22–28 s | Point to the Earth–Moon route and `×10 000` badge during TLI. | “Transfer Yer va harakatlanuvchi Oy tortish kuchlarini velocity-Verlet bilan hisoblaydi.” |
| 28–34 s | Watch the midpoint course-correction callout and lunar-orbit braking. | “Bu besh kunlik parvozning qisqartirilgan ko‘rinishi; x10000 badge ustiga demo pacing ham bor.” |
| 34–40 s | At the navigator, click a site card or press 1–4. | “Joylar ilmiy qiymat, qiyalik, yoritilish va aloqa bo‘yicha farq qiladi.” |
| 40–44 s | Show the recommendation badge; if no site was clicked, the recommendation is selected automatically. | “Sakkiz soniyada tanlov bo‘lmasa, tizim tavsiya qilingan hududni tanlaydi.” |
| 44–50 s | Manual descent starts. Click **AVTO QO‘NISH** for a guaranteed guided approach, or use Space and WASD. | “Qo‘lda boshqaruvdan avtopilotga o‘tish parvoz holatini sakratmaydi.” |
| 50–58 s | Point to altitude, vertical/horizontal speed, fuel, tilt, warnings, and safe-zone ring. | “Avtopilot tezlik profilini kuzatib, yonlama tezlikni pasaytiradi va xavfsiz zona markaziga intiladi.” |
| 58–60 s | Read the landing outcome, grade, accuracy, and remaining fuel; point to **QAYTA UCHISH**. | “Natija qo‘nish tezligi, qiyalik, zona aniqligi va yoqilg‘iga asoslangan.” |

**Pause/skip:** Esc pauses and the demo HUD can skip the current timeline segment. The director normally finishes at 60 seconds; an unfinished auto-assisted landing may use up to five extra seconds.

## Honest simulation limits

The demo ascent uses a 75× simulation-time factor. The transfer uses the existing planar moving-Moon velocity-Verlet model, shown at `×10 000` plus a 3.6× director pacing factor; it is not a full-resolution five-day visual flight. If the simulated encounter has not reached lunar capture by the navigator, the demo places the craft at a 100 km lunar encounter and applies an idealized LOI impulse so the timed flow can continue. Demo descent is a deterministic 2D fixed-step model at 1/120 s with lunar gravity, fuel, lateral motion, attitude, site-dependent grading, and PD guidance; it is not a full 6-DOF lander or global DEM. The regular mission flow is not routed through these demo shortcuts.