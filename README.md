# UzHack 2026 — ShifoHalqa

**Track:** 01 Smart Healthcare · **Musobaqa:** UzHack 2026 (Uzbekistan–Malaysia Tech Bridge)
**Mahsulot:** shifokor bergan uy davolanish rejasini bemor telefonida kundalik vazifalarga aylantiradi; har vazifa **dalil darajasi (L0–L4)** bilan qayd etiladi; deterministik qoidalar faqat istisnolarni shifokor paneliga chiqaradi — "ko'rinmas davr"ni yopadi.

> **Joriy holat.** Sintetik shifokor uy rejasini biriktiradi, bemor dori yoki bosimni qayd etadi, shifokor esa tanlangan qaydni ko‘rib bemorga javob beradi.

Mashq rejasini biriktirgach, bemor sahifasidan «O‘tirib-turish mashqi»ni oching. CDC namunasi kamerasiz ishlaydi. Brauzer modelni shu ilovadan yuklaydi va video kadrlarini qurilmada tahlil qiladi. Real telefon kamerasi uchun brauzer HTTPS va kamera ruxsatini talab qiladi. «Reja ijrosi» dori va qon bosimi bo‘yicha hisobni, qadamlar esa alohida qo‘lda kiritilgan qiymatni ko‘rsatadi.

«DoriMos»da tayyor sintetik qutini tanlang va rasmda o‘qilgan yozuvni tasdiqlang. Rejadagi nom yoki kuchdan farq bo‘lsa, shifokor navbatida alohida qayd chiqadi. «Yaqinim»da bemor bugungi qisqa holat uchun 24 soatlik havolani yaratishi va bekor qilishi mumkin. [Hakam uchun demo yo‘li](tasks/task-2/PLATFORM_NOTES.md)

## Deadline (tashkilotchi kanallarida tekshiring: uzhack.uz / Platform)
| Vazifa | MYT | UZT | Nima topshiriladi |
|---|---|---|---|
| **Task 1** — Video + Project info | **18-noyabr 2026, 23:59** | 20:59 | 3–5 daqiqa video (YouTube Unlisted) + platformadagi `Project` maydonlari |
| **Task 2** — Working MVP | **22-noyabr 2026, 23:59** | 20:59 | Brauzer havolasi + demo loginlar + "what works / what's simulated" + AI-use note |

Ball = 0.30·Task1 + 0.70·Task2; ikkalasi ham majburiy; havola Grand Finalgacha jonli turishi shart.

## Ish muhiti

Codex `~/Projects/uzhack-codex` ichida `codex/dev` branchida ilovani quradi va tekshiradi. `main`ga birlashtirish va reliz jamoa zimmasida.

- **Production:** https://shifohalqa.vercel.app (Vercel `shifohalqa`, faqat `main` dan)
- **DB:** Neon `shifohalqa` (production branch) + `codex-dev` branch (Codex izolyatsiyasi)
- **AI:** Hybrid — on-device MediaPipe Pose (L3) + `gemini-4-hydrogen` (OCR/extract) + `gemini-decision-1` (calibrated gate/score, Decisions API `v1beta`)

## O'qish tartibi
| Fayl | Maqsad |
|---|---|
| [`PLAN.md`](PLAN.md) | **Yagona master plan** — fazalar, task board, skill/MCP xaritasi, tozalash logi |
| [`AGENTS.md`](AGENTS.md) | Codex ish chegaralari, Gemini qoidalari va pushdan oldingi tekshiruvlar |
| [`docs/SPEC.md`](docs/SPEC.md) | Mahsulot + texnik kontrakt: rollar, sxema, AI pipeline, qoidalar |
| [`docs/INTERFACES.md`](docs/INTERFACES.md) | Engine eksportlari va server integratsiyasi |
| [`competition/RUBRIC.md`](competition/RUBRIC.md) | Rasmiy Task 2 baholash × ichki sifat darvozasi |
| [`tasks/task-1/`](tasks/task-1/) | Video ssenariysi, runbook, platforma matnlari (deadline 18-nov!) |
| [`tasks/task-2/README.md`](tasks/task-2/README.md) | MVP topshirish checklist |
| [`brief/uzhack-online-stage-tasks-en.pdf`](brief/uzhack-online-stage-tasks-en.pdf) | Rasmiy Brief v1.0 (tarixiy sanalar bilan) |
| [`archive/`](archive/) | Eski reja fayllar — joriy emas |

Eski 4 lane kodi arxivi: `~/Projects/uzhack-reference-20261117.tar.zst` (porting uchun; `AGENTS.md` da yo'llar).

## Lokal demo

Node.js 22 yoki yangirog‘i kerak. `.env.example` shablonidan `.env.local` yarating. `DEMO_MODE=true` va `openssl rand -hex 32` bilan yaratilgan `SESSION_SECRET` ni kiriting.

```bash
cd ~/Projects/uzhack-codex
npm ci
npm run dev
```

[Lokal demo](http://localhost:3000/) sahifasida rolni tanlang. Bir brauzerda rolni almashtirsangiz, o‘sha demo ish joyida qolasiz. Yangi brauzer sessiyasi alohida ish joyini oladi.

Ma’lumotlar bazasini ulash uchun `.env.local` da Neon **`codex-dev`** branchining `DATABASE_URL` va `DATABASE_URL_UNPOOLED` manzillarini belgilang. Direct manzil aynan shu branchga tegishli ekanini tekshiring va terminal muhitida `DATABASE_URL_UNPOOLED` o‘zgaruvchisini belgilang. `psql` bilan `schema.sql` ni bitta tranzaksiyada qo‘llang. Birinchi rol tashrifida sintetik yozuvlar avtomatik yaratiladi. `DATABASE_URL` bo‘sh bo‘lsa, demo sessiyasini sinash mumkin va ilova baza ulanmaganini ko‘rsatadi.

```bash
psql "$DATABASE_URL_UNPOOLED" -X --single-transaction --set ON_ERROR_STOP=1 --file schema.sql
```

## Tekshiruv

```bash
npm run verify
npm exec playwright install chromium
npm run e2e
```

Playwright lokal serverda alohida sessiya kaliti bilan ishlaydi. Standart brauzer smoke sessiya va rol almashishini tekshiradi. Reja, bemor qaydi va shifokor ko‘rigi testlari `npm run verify` yasagan production buildni ishlatadi. Ularni ham bajarish uchun `SHIFO_E2E_DATABASE_URL` ni terminalda tasdiqlangan Neon `codex-dev` manziliga belgilang va `npm run e2e` ni ishga tushiring. Har bir test yangi sintetik ish joyidan foydalanadi.

Ma’lumotlar bazasi bilan E2E Python servisini ham ishga tushiradi. Avval `uv sync --project services/telegram_bot --locked` bilan uning bog‘liqliklarini o‘rnating. Python unit testlari uchun `uv run --project services/telegram_bot --locked pytest services/telegram_bot/tests` ishlating. E2E Telegramga chiqmasdan, bitta sintetik chatga bog‘langan navbatni haqiqiy Neon’da sinaydi.

Jonli DoriMos brauzer testini qo‘shish uchun `SHIFO_E2E_LIVE_GEMINI=1` va `GEMINI_API_KEY` belgilang. Standart E2E tashqi Gemini so‘rovlarisiz ishlaydi. Sintetik quti benchmarkini quyidagi buyruq bilan takrorlash mumkin. [Benchmark qaydlari](docs/BENCHMARK.md)

```bash
node --env-file=.env.local node_modules/vite-node/vite-node.mjs scripts/dorimos-benchmark.ts
```

`npm run dev` va `npm run build` boshlanishida pin qilingan MediaPipe paketidan WASM fayllari `public/models/wasm/` ga ko‘chiriladi. Lite model repoda saqlanadi. [Kamera va klip sinovi](docs/BENCHMARK.md)

## Telegram bot

Bot Python 3.12–3.14 va aiogram bilan alohida servisda ishlaydi. Veb-ilova uchun `TELEGRAM_BOT_USERNAME` yetarli. Python servisiga shu botning nomi, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_APP_URL` va shu muhitdagi PostgreSQL ulanishini bering. `TELEGRAM_DATABASE_URL` bo‘sh bo‘lsa, `DATABASE_URL` ishlatiladi. Webhook siri uchun `openssl rand -hex 32` ishlating. `TELEGRAM_APP_URL` tugmadagi veb-ilova manzili.

ShifoHalqaning alohida bot nomi `shifohalqa_bot`. Servis uchun `services/telegram_bot/.env.local` faylidan foydalaning. Lokal sinovda `TELEGRAM_DATABASE_URL` qiymatini ajratilgan Neon `codex-dev` ulanishiga belgilang. Bot tokenini xizmatning maxfiy sozlamasida saqlang. Yangilash zarur bo‘lsa, BotFather’dan yangi token oling. [Telegram token yo‘riqnomasi](https://core.telegram.org/bots/features#generating-an-authentication-token)

Servis veb-ilovadan alohida doimiy jarayon sifatida ishlaydi. Lokal ishga tushirish quyidagicha.

```bash
cd services/telegram_bot
uv sync --locked
uv run --locked --env-file .env.local python -m shifo_telegram
```

Servis tashqi proksi orqali ochilganda `TELEGRAM_HOST=0.0.0.0` va hostingdagi ichki portga mos `TELEGRAM_PORT` ni belgilang. `/healthz` jarayon ishlayotganini ko‘rsatadi. Python servisiga ommaviy HTTPS manzil berilgach, `TELEGRAM_WEBHOOK_URL` ni uning to‘liq `/api/telegram/webhook` manziliga belgilang. Quyidagi buyruqlar shu katalogda ishlaydi. `--status` joriy webhookni tekshiradi. `--register` alohida botni yangi servisga ulaydi. Botda boshqa faol webhook bo‘lsa, skript uni saqlaydi.

```bash
uv run --locked --env-file .env.local python -m shifo_telegram.webhook --status
uv run --locked --env-file .env.local python -m shifo_telegram.webhook --register
```

Shifokor sahifasida «Telegramni ulash»ni bosing va hosil bo‘lgan havolani shaxsiy chatda oching. `/bugun` ShifoHalqa havolasini beradi. Shifokor veb-ilovada yoki `/stop` orqali ulanishni uzishi mumkin. Bot xabaridagi ilova havolasi o‘sha brauzerdagi mavjud demo sessiyasidan foydalanadi. [Telegram kontrakti](docs/INTERFACES.md#telegram)

### Railway Trial

Railway servisiga shu GitHub reposini ulang. Service Root Directory `/services/telegram_bot`, Railway Config File `/services/telegram_bot/railway.toml`. Railpack `uv.lock` orqali bog‘liqliklarni o‘rnatadi. Konfiguratsiya ilovani Railway bergan `$PORT` da ishga tushiradi va `/healthz` javobini kutadi. Demo uchun bitta replika yetadi. Servis veb-so‘rovsiz ham xabar navbatini kuzatadi, shuning uchun alohida uyqu rejimini yoqmang. [Monorepo sozlamasi](https://docs.railway.com/deployments/monorepo) · [Trial chegaralari](https://docs.railway.com/pricing/free-plan)

Servisning Railway Variables bo‘limiga `TELEGRAM_BOT_USERNAME`, `TELEGRAM_APP_URL`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN` va sinov bazasining `TELEGRAM_DATABASE_URL` qiymatlarini kiriting. Botning pilot sinovi veb-panel bilan aynan shu bazadan foydalanadi. `schema.sql` dagi Telegram ustunlarini avval ajratilgan bazada tekshiring. Deploy sog‘lom bo‘lgach HTTPS manzilini yarating va `/api/telegram/webhook` ni ro‘yxatdan o‘tkazing. Trial muddati yoki krediti tugashidan oldin jonli webhookni qayerda davom ettirishni kelishing.

## Android demo

`android/` ni Android Studio’da alohida loyiha sifatida oching. Mustaqil demo oqimida «Bugun» → «Icha olmadim» → «Dori tugadi» → «Qaydni saqlash» → «Qaydni ko‘rish» → «Namuna javobni ochish» ishlaydi. «Ichdim» yo‘li ham bor. Mahalliy qayd qurilmada saqlanadi. «Javoblar» bo‘limidagi «Demoni qayta boshlash» tasdiqdan keyin uni o‘chiradi.

JDK 17 yoki undan yangirog‘i, Android SDK API 37 va Build Tools 36.0.0 kerak. Demo Android 8.0 (API 26) yoki undan yangi qurilmaga o‘rnatiladi. Emulyator yoki test qurilmasi ulanganida ikkinchi buyruq UI oqimlarini tekshiradi.

```bash
cd android
./gradlew :app:assembleDebug :app:lintDebug
./gradlew :app:connectedDebugAndroidTest
```

Debug APK `android/app/build/outputs/apk/debug/app-debug.apk` faylida hosil bo‘ladi.

### Androidni veb-panelga ulash

Lokal server `DEMO_MODE=true`, `DEMO_ANDROID_ENABLED=true`, `SESSION_SECRET` va ajratilgan Neon `codex-dev` bilan ishlashi kerak. Debug APK uchun ADB orqali serverni telefonga yo‘naltiring. Bir nechta qurilma ulangan bo‘lsa, `adb -s SERIAL` bilan sinov telefonini tanlang.

```bash
DEMO_ANDROID_ENABLED=true npm run dev -- --hostname 127.0.0.1 --port 3000
```

```bash
adb reverse tcp:3000 tcp:3000
```

1. Brauzerda shifokor sifatida kirib, «Android ulash kodini olish»ni bosing. Dori rejasini biriktiring. «Dori tugadi» istisnosini sinash uchun reja shaklida tegishli belgini yoqing.
2. Androidda «Veb-panelga ulash»ni bosing va bir martalik kodni kiriting. Debug manzil `http://127.0.0.1:3000`. Ommaviy muhitda HTTPS manzil talab qilinadi.
3. Androidda dori sababini saqlang. Shifokor brauzerda aynan shu qaydni ochib javob beradi. Androiddagi «Javoblar» orqali yoki «Yangilash»ni bosib javobni ko‘ring.

Sessiya 8 soat amal qiladi va ilova jarayoni tugaganda qurilmada qayta ulash kerak bo‘ladi. Yangi juftlash kodi shu ish joyidagi oldingi Android sessiyasini tugatadi. [Android API kontrakti](docs/INTERFACES.md#android-demo-api)

## Halollik qoidasi (muzokaraga yopiq)
**AI o'lchaydi → kod qoidalari bayroq ko'taradi → shifokor qaror qiladi.** Hech qachon "AI isbotladi/tashxis qo'ydi" yozilmaydi; simulyatsiya qismlar ochiq belgilanadi; har submission bilan "what works / what's simulated" + AI-use note keladi.

Qolgan ishlar va qabul mezonlari [A–I jadvali](PLAN.md#ish-jadvali) da.
