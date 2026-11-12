# Oy Missiyasi

Yer bazasidan tayyor kosmik kemada uching, Oyga yetib boring, xavfsiz qo‘ning va uchta ilmiy vazifani bajaring. O‘yin o‘zbek tilida; parvoz va qo‘nishda qo‘lda boshqarish ham, avtopilot ham mavjud. Rover va Oy yuzasidagi tadqiqotlar qo‘lda boshqariladi.

## O‘yinni ishga tushirish

### Tayyor offline o‘yin

1. `standalone` papkasini yoki undan tayyorlangan ZIP nusxasini oching.
2. Windows’da `ishga-tushirish.bat` faylini ikki marta bosing. Mac/Linux’da shu papkadan `sh ./ishga-tushirish.sh` buyrug‘ini bering.
3. Brauzerda `http://127.0.0.1:8000` manzili ochiladi. Server oynasini o‘yin davomida ochiq qoldiring.

Offline nusxani manba loyihadan yaratish uchun avval Node.js va pnpm o‘rnating, so‘ng loyiha papkasida:

```bash
corepack pnpm install
corepack pnpm build
```

Build `standalone` papkasini tayyorlaydi. Offline o‘yin Node.js talab qilmaydi; uni local Python 3 HTTP serveri ishga tushiradi. Tarmoqdagi 3D modellar yuklanmasa, raketa va rover uchun o‘yinga kiritilgan zaxira modellar ishlaydi.

### Manba koddan ishga tushirish

- Windows: `ishga-tushirish-manba.bat` faylini ikki marta bosing.
- Mac/Linux: `sh ./ishga-tushirish-manba.sh` buyrug‘ini bering.

Manba nusxasi uchun Node.js, Corepack/pnpm va `corepack pnpm install` orqali o‘rnatilgan kutubxonalar kerak. Qo‘lda ishga tushirish:

```bash
corepack pnpm install
corepack pnpm dev
```

Brauzerda terminalda Vite ko‘rsatgan manzilni oching (odatda `http://127.0.0.1:3000`). Agar 3000-port band bo‘lsa, Vite keyingi bo‘sh portni tanlaydi. Manba launcheridan boshlasangiz, brauzer avtomatik ochiladi.

## 60 soniyalik hakamlar demosi

```powershell
corepack pnpm dev
```

Server tayyor bo‘lgach, terminalda ko‘rsatilgan manzilga `?demo=60` qo‘shib brauzerda oching (odatda `http://127.0.0.1:3000/?demo=60`). Demo yuklanish ekranidan keyin avtomatik boshlanadi. Sarlavha ekranidagi **60 SONIYALIK DEMO** tugmasi ham demoni boshlaydi. To‘liq missiya uchun odatdagi uchirish tugmasi o‘zgarishsiz qoladi.

Demo 0–8 soniyada sanash va uchirishni, 8–22 soniyada ko‘tarilish/orbitani, 22–34 soniyada Yer–Oy transferini, 34–44 soniyada to‘rtta qo‘nish joyidan tanlashni, 44–58 soniyada qo‘nishni, 58–60 soniyada natijani ko‘rsatadi. Qo‘nish tugallanmasa, avtopilot yordam beradi va yakun 65 soniyadan oshmaydi. **Esc** pauza qiladi; demo panelidagi bosqichni o‘tkazish tugmasi keyingi bosqichga o‘tadi.

Navigator paytida joyni bosing yoki 1–4 tugmalaridan foydalaning; 8 soniyada tanlov qilinmasa tavsiya etilgan joy belgilanadi. Qo‘nish qo‘lda boshqaruvdan boshlanadi: Space/ekrandagi TORTISH tugmasi dvigatelni yoqadi, WASD/strelkalar yonlama harakat va qiyalikni boshqaradi. **AVTO QO‘NISH** va **QO‘LDA QO‘NISH** tugmalari parvoz paytida boshqaruvni uzluksiz almashtiradi.

## Boshqaruv

- Bosh sahifadagi uchirish tugmasini bosgach, tayyor kosmik kema avtomatik sanashdan so‘ng parvozga chiqadi.
- To‘liq missiyada ko‘tarilish 1× simulyatsiya tezligida yuradi; raketa dastlab tik ko‘tarilib, keyin orbitaga chiqish uchun asta buriladi. Faqat 60 soniyalik demoda orbitaga yetish uchun ascent fizikasi 75× tezlashtiriladi.
- Uchirishda dvigatel alangasi bilan birga maydon atrofida kengayib tarqaladigan suv purkagichi va bug‘ buluti ko‘rinadi.
- Uchirishda balandlik, tezlik, tezlanish, yonilg‘i va bosqich ko‘rsatkichlari jonli yangilanadi; balandlik, tezlik va tezlanish grafiklari ham mavjud.
- Oyga parvozda TLI zarbasi uchun Space’ni ushlab turing yoki dvigatel tugmasini bosing. **AVTOPILOTNI YOQISH** transfer va Oy orbitasiga tormozlashni bajaradi. Parvoz vaqtini 1×–10 000× oralig‘ida tanlash mumkin. Qo‘lda boshqarishda Oy yaqinida Space’ni ushlab LOI tormozlashini bajaring.
- Tranzit hisob-kitobi Yer va harakatlanuvchi Oy tortish kuchlarini velocity-Verlet bilan hisoblaydi. Quyosh tizimining sakkiz sayyorasi va masofa/diametr ma’lumotlari bilan ko‘rsatiladi. Sayyora ko‘rinishlari va orbitalari baribir sxematik; fizik transit planar soddalashtirilgan modeldir (tafsilotlar `PHYSICS.md` da).
- Qo‘nishda Space/dvigatel va WASD yoki ekrandagi sensorli tugmalarni ishlating; **AVTOPILOTNI YOQISH** tushish tezligini boshqaradi. Oy tortish kuchi 1.62 m/s², yonilg‘i cheklovi va oson/me’yoriy/qiyin rejimdagi tezlik, qiyalik va maydon baholashi ishlaydi. Istalgan vaqtda qo‘lda boshqarishga qaytish mumkin.
- Demo uchun alohida 1/120 s descent integratori, PD avtopiloti, to‘rtta ilmiy asoslangan qo‘nish profili, saytga mos xavfsiz zona va S–F natija ekrani qo‘shilgan. Bu qisqa ko‘rgazma modeli; to‘liq topshiriqdagi Oyga qo‘nish, tranzit va rover oqimi alohida saqlangan.
- Oyda roverni W/S bilan oldinga/ortga, A/D bilan rulni burib boshqaring; old g‘ildiraklar buriladi, barcha g‘ildiraklar aylanadi, kuzov amortizatorlari tepalik va kraterlarga moslashadi. Ilmiy nuqta yonida E tugmasini bosing.
- `Esc` pauza menyusini ochadi.
- O‘yin past/o‘rta/yuqori grafik sifatini qo‘llaydi; past va o‘rta sifatda soya xaritalari o‘chirilib, zaif GPU’larda render xatolari va ortiqcha yuk kamaytiriladi. Yuqori sifat soyalarni yoqadi; kadr tezligi uzoq vaqt pasaysa sifat avtomatik pasaytiriladi. O‘rta sifat 60 FPS maqsadiga yo‘naltirilgan, ammo aniq unumdorlik qurilma va brauzerga bog‘liq.

## Tekshiruv buyruqlari

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm smoke
```

`pnpm smoke` dan oldin `pnpm build` bajarilgan bo‘lishi kerak. O‘yin onlayn multiplayer’ni talab qilmaydi.

## Loyiha tuzilishi

- `src/game/mission.ts` — sahna qurilishi, rendering va missiya integratsiyasi.
- `src/game/scenes/` — uchirish, tranzit, qo‘nish va Oy yuzasi bosqichlari.
- `src/sim/physics.ts` — ascent, Yer–Oy transit, orbit, qo‘nish integratorlari, Horn qiyalik kernel’i.
- `src/sim/descent.ts` va `src/sim/auto-guidance.ts` — demo Oy qo‘nish integratori va yo‘naltiruvchi PD boshqaruvi.
- `src/game/demo/` — 60 soniya direktori, qo‘nish joylari, navigator va qo‘nish boshqaruvchisi.
- `src/game/mission-app.ts` — o‘zbekcha interfeys, boshqaruvlar va brauzer ishga tushirishi.
- `src/i18n/uz.json` — o‘yindagi o‘zbekcha matnlar.
- `scripts/package-game.mjs` — production build’ni `standalone` offline papkasiga tayyorlaydi.

Shrift va model litsenziyalari: `public/fonts/ManusCC0-LICENSE.txt`, Three.js — MIT.
