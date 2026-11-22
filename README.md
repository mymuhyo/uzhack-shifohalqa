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
| **Task 2** — Working MVP | **22-noyabr 2026, 23:59**, jamoa tasdiqlagan | 20:59 | Brauzer havolasi + demo loginlar + "what works / what's simulated" + AI-use note |

Ball = 0.30·Task1 + 0.70·Task2; ikkalasi ham majburiy; havola Grand Finalgacha jonli turishi shart.

## Ish muhiti

GitHub’dagi `main` ShifoHalqaning doimiy reliz branchi. Vercel va Railway `main`dan avtomatik build oladi.

- **Production:** https://shifohalqa.vercel.app (Vercel `shifohalqa`, faqat `main` dan)
- **DB:** Neon `shifohalqa/main` · UzHack sintetik demosi
- **Telegram:** [@shifohalqa_bot](https://t.me/shifohalqa_bot) · [Railway healthcheck](https://shifohalqa-telegram-production.up.railway.app/healthz)
- **AI:** Hybrid — on-device MediaPipe Pose (L3) + Cloudflare Clef + Clairic Flash (synthetic-label quality and extraction) + Gemini Decisions / OpenRouter fallback. OpenRouter also handles public sample observations and Uzbek explanations

Tanlanadigan mashqlar — o‘tirib-turish, tirsak bukish, tizza ko‘tarish, yelkadan qo‘l ko‘tarish va o‘tirgan holda oyoqni tekislash. Web va Android kamera yoki mahalliy videodan texnika izohini ko‘rsatadi. `EXERCISE_COACH_OPENROUTER_DEMO=true` bo‘lsa, AI murabbiy serverdagi ikki ommaviy mashq namunasini izohlaydi.

## O'qish tartibi
| Fayl | Maqsad |
|---|---|
| [`docs/V2_PLAN.md`](docs/V2_PLAN.md) | Joriy ish, qabul mezonlari va reliz qarori |
| [`PLAN.md`](PLAN.md) | A–I bosqichlari va avvalgi qabul yozuvlari |
| [`AGENTS.md`](AGENTS.md) | Codex ish chegaralari, Gemini qoidalari va pushdan oldingi tekshiruvlar |
| [`docs/SPEC.md`](docs/SPEC.md) | Mahsulot + texnik kontrakt: rollar, sxema, AI pipeline, qoidalar |
| [`docs/INTERFACES.md`](docs/INTERFACES.md) | Engine eksportlari va server integratsiyasi |
| [`competition/RUBRIC.md`](competition/RUBRIC.md) | Rasmiy Task 2 baholash × ichki sifat darvozasi |
| [`tasks/task-1/`](tasks/task-1/) | Video ssenariysi, runbook, platforma matnlari (deadline 18-nov!) |
| [`tasks/task-2/README.md`](tasks/task-2/README.md) | MVP topshirish checklist |
| [`brief/uzhack-online-stage-tasks-en.pdf`](brief/uzhack-online-stage-tasks-en.pdf) | Rasmiy Brief v1.0 (tarixiy sanalar bilan) |
| [`archive/`](archive/) | Eski reja fayllar — joriy emas |

Eski 4 lane kodi arxivi: `~/Projects/uzhack-reference-20261117.tar.zst` (tarixiy manba).

## Lokal demo

Node.js 22 yoki yangirog‘i kerak. `.env.example` shablonidan `.env.local` yarating. `DEMO_MODE=true` va `openssl rand -hex 32` bilan yaratilgan `SESSION_SECRET` ni kiriting.

```bash
cd ~/Projects/uzhack
npm ci
npm run dev
```

[Lokal demo](http://localhost:3000/) sahifasida rolni tanlang. Bir brauzerda rolni almashtirsangiz, o‘sha demo ish joyida qolasiz. Yangi brauzer sessiyasi alohida ish joyini oladi.

Bazasiz demo sessiyasi uchun `DATABASE_URL` bo‘sh turadi. Bazaga bog‘liq lokal ish uchun alohida test bazasining pooled URL’ini `.env.local` dagi `DATABASE_URL` ga belgilang. Sxemani qo‘llashda terminaldagi `DATABASE_URL_UNPOOLED` aynan shu test bazasining direct manzili ekanini tekshiring. Birinchi rol tashrifida sintetik yozuvlar avtomatik yaratiladi.

```bash
psql "$DATABASE_URL_UNPOOLED" -X --single-transaction --set ON_ERROR_STOP=1 --file schema.sql
```

## Tekshiruv

```bash
npm run verify
npm exec playwright install chromium
npm run e2e
```

Playwright lokal serverda alohida sessiya kaliti bilan ishlaydi. Standart brauzer smoke sessiya va rol almashishini tekshiradi. Reja, bemor qaydi va shifokor ko‘rigi testlari `npm run verify` yasagan production buildni ishlatadi. Bu testlar uchun `SHIFO_E2E_DATABASE_URL` ga ajratilgan test bazasini bering. Har bir test yangi sintetik ish joyidan foydalanadi. Ochiq relizni veb-interfeysda alohida sintetik sessiya bilan tekshiring.

Ma’lumotlar bazasi bilan E2E Python servisini ham ishga tushiradi. Avval `uv sync --project services/telegram_bot --locked` bilan uning bog‘liqliklarini o‘rnating. Python unit testlari uchun `uv run --project services/telegram_bot --locked pytest services/telegram_bot/tests` ishlating. E2E Telegramga chiqmasdan, bitta sintetik chatga bog‘langan navbatni haqiqiy Neon’da sinaydi.

Jonli DoriMos brauzer sinovi uchun `SHIFO_E2E_LIVE_DORIMOS=1` va tanlangan provayder kalitlari kerak. `CLOUDFLARE_ACCOUNT_ID` va `CLOUDFLARE_API_TOKEN` berilsa, Clef quti sifatini tekshiradi, Clairic Flash yozuvni o‘qiydi. Cloudflare ishlamay qolsa, `GEMINI_API_KEY` va `OPENROUTER_API_KEY` bilan Gemini Decisions + OpenRouter yo‘li ishlaydi. Xira yoki noaniq namuna qayta olishga yuboriladi. `DORIMOS_PROVIDER=gemini` o‘sha yo‘lni bevosita tanlaydi. Standart E2E tashqi AI provayderlarini chaqirmaydi. Sintetik quti benchmarkini quyidagi buyruq bilan takrorlash mumkin. [Benchmark qaydlari](docs/BENCHMARK.md)

```bash
node --env-file=.env.local node_modules/vite-node/vite-node.mjs scripts/dorimos-benchmark.ts
```

`npm run dev` va `npm run build` boshlanishida pin qilingan MediaPipe paketidan WASM fayllari `public/models/wasm/` ga ko‘chiriladi. Lite model repoda saqlanadi. [Kamera va klip sinovi](docs/BENCHMARK.md)

## Telegram bot

Bot Python 3.12–3.14 va aiogram bilan alohida servisda ishlaydi. Veb-ilova uchun `TELEGRAM_BOT_USERNAME` yetarli. Python servisiga shu botning nomi, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_APP_URL` va shu muhitdagi PostgreSQL ulanishini bering. `TELEGRAM_DATABASE_URL` bo‘sh bo‘lsa, `DATABASE_URL` ishlatiladi. Webhook siri uchun `openssl rand -hex 32` ishlating. `TELEGRAM_APP_URL` tugmadagi veb-ilova manzili.

ShifoHalqaning alohida bot nomi `shifohalqa_bot`. Jonli webhook boshqaruvi uchun `services/telegram_bot/.env.local` ishlatiladi. Lokal sinov uchun `.env.test.local` da alohida test bazasi va test botini belgilang yoki repodagi mock transport bilan E2E’ni ishga tushiring. Bot tokenini xizmatning maxfiy sozlamasida saqlang. Yangilash zarur bo‘lsa, BotFather’dan yangi token oling. [Telegram token yo‘riqnomasi](https://core.telegram.org/bots/features#generating-an-authentication-token)

Servis veb-ilovadan alohida doimiy jarayon sifatida ishlaydi. Lokal ishga tushirish quyidagicha.

```bash
cd services/telegram_bot
uv sync --locked
uv run --locked --env-file .env.test.local python -m shifo_telegram
```

Servis tashqi proksi orqali ochilganda `TELEGRAM_HOST=0.0.0.0` va hostingdagi ichki portga mos `TELEGRAM_PORT` ni belgilang. `/healthz` jarayon ishlayotganini ko‘rsatadi. Python servisiga ommaviy HTTPS manzil berilgach, `TELEGRAM_WEBHOOK_URL` ni uning to‘liq `/api/telegram/webhook` manziliga belgilang. Quyidagi buyruqlar shu katalogda ishlaydi. `--status` joriy webhookni tekshiradi. `--register` alohida botni yangi servisga ulaydi. Botda boshqa faol webhook bo‘lsa, skript uni saqlaydi.

```bash
uv run --locked --env-file .env.local python -m shifo_telegram.webhook --status
uv run --locked --env-file .env.local python -m shifo_telegram.webhook --register
```

Shifokor sahifasida «Telegramni ulash»ni bosing va hosil bo‘lgan havolani shaxsiy chatda oching. `/bugun` ShifoHalqa havolasini beradi. Shifokor veb-ilovada yoki `/stop` orqali ulanishni uzishi mumkin. Bot xabaridagi ilova havolasi o‘sha brauzerdagi mavjud demo sessiyasidan foydalanadi. [Telegram kontrakti](docs/INTERFACES.md#telegram)

### Railway relizi

Railway’da `shifohalqa-telegram` shu GitHub reposining `main` branchiga ulangan. Root Directory `/services/telegram_bot`. Railpack `uv.lock` orqali bog‘liqliklarni o‘rnatadi. Singapore’da bitta replika doimiy ishlaydi va healthcheck `/healthz` ni tekshiradi. Start Command quyidagicha. [Railway monorepo sozlamasi](https://docs.railway.com/deployments/monorepo)

```sh
sh -c 'TELEGRAM_HOST=0.0.0.0 TELEGRAM_PORT="$PORT" exec python -m shifo_telegram'
```

Railway Variables ichidagi `TELEGRAM_DATABASE_URL` Neon `shifohalqa/main` dagi cheklangan Telegram roliga tegishli. Vercel production `TELEGRAM_BOT_USERNAME=shifohalqa_bot` orqali ikkala rolda bot tugmasini ko‘rsatadi. [Railway deploylari](https://railway.com/project/5b67d2e2-2676-460c-8909-4313a24705df) · [Jonli bot](https://t.me/shifohalqa_bot)

## Android demo

`android/` ni Android Studio’da alohida loyiha sifatida oching. Mustaqil demo oqimida «Bugun» → «Icha olmadim» → «Dori tugadi» → «Qaydni saqlash» → «Qaydni ko‘rish» → «Namuna javobni ochish» ishlaydi. «Ichdim» yo‘li ham bor. Mahalliy qayd qurilmada saqlanadi. «Javoblar» bo‘limidagi «Demoni qayta boshlash» tasdiqdan keyin uni o‘chiradi.

«O‘tirib-turish mashqi» Android jonli kamerasida **MediaPipe Full** ishlaydi. «Video tanlash va tahlil qilish» galereyadagi ikki daqiqagacha bo‘lgan klipni telefonda **MediaPipe Heavy** bilan tahlil qiladi. O‘lchovni tasdiqlasangiz, panelga L2 xulosasi yuboriladi. Kamera xulosasi L3 sifatida baholanadi. Ikkala model APK tarkibida. Kamera to‘xtatilgach, o‘lchovni saqlash, qayta urinish yoki qo‘lda kiritish mumkin. «Og‘riq bor» kamerani darhol yopadi. «Tez yordam · 103» telefon terish ekranini ochadi.

«AI tahlilchi · CDC namunasi» ulangan demo ish joyida serverda `EXERCISE_OPENROUTER_DEMO=true` va `OPENROUTER_API_KEY` bilan ommaviy namunani tahlil qiladi. MP4 so‘roviga OpenRouter 402 qaytarsa, ayni namunaning 9 kadridan foydalanadi va UI buni ko‘rsatadi. Heavy o‘lchovi mavjud bo‘lsa, OpenRouter orqali Baidu solishtiruvni o‘zbekcha izohlaydi. Galereya videosi va kadrlar telefonda qoladi.

JDK 17 yoki undan yangirog‘i, Android SDK API 37 va Build Tools 36.0.0 kerak. Demo Android 8.0 (API 26) yoki undan yangi qurilmaga o‘rnatiladi. Emulyator yoki test qurilmasi ulanganida ikkinchi buyruq UI oqimlarini tekshiradi.

```bash
cd android
./gradlew :app:assembleDebug :app:lintDebug :app:testDebugUnitTest
./gradlew :app:connectedDebugAndroidTest
```

Debug APK `android/app/build/outputs/apk/debug/app-debug.apk` faylida hosil bo‘ladi. ARM64 telefon uchun `./gradlew :app:assembleDebug -PshifoAbi=arm64-v8a` bitta arxitekturali kichikroq APK beradi. Emulyator sinovi uchun parametrsiz build ishlating.

### Androidni veb-panelga ulash

Ajratilgan worktree’da `npm run lane -- dev` va `npm run lane -- android-test` ishlating. Launcher emulyatorning lokal 3000 portini tegishli worktree portiga ulaydi.

Lokal server `DEMO_MODE=true`, `DEMO_ANDROID_ENABLED=true`, `SESSION_SECRET` va ajratilgan test bazasi bilan ishlashi kerak. Debug APK uchun ADB orqali serverni telefonga yo‘naltiring. Bir nechta qurilma ulangan bo‘lsa, `adb -s SERIAL` bilan sinov telefonini tanlang.

```bash
DEMO_ANDROID_ENABLED=true npm run dev -- --hostname 127.0.0.1 --port 3000
```

```bash
adb reverse tcp:3000 tcp:3000
```

1. Brauzerda shifokor sifatida kirib, «Android ulash kodini olish»ni bosing. Dori rejasini biriktiring. «Dori tugadi» istisnosini sinash uchun reja shaklida tegishli belgini yoqing.
2. Androidda «Veb-panelga ulash»ni bosing va bir martalik kodni kiriting. Debug manzil `http://127.0.0.1:3000`. Ommaviy muhitda HTTPS manzil talab qilinadi.
3. Androidda dori sababini saqlang. Shifokor brauzerda aynan shu qaydni ochib javob beradi. Androiddagi «Javoblar» orqali yoki «Yangilash»ni bosib javobni ko‘ring.

Mashq uchun shifokor veb-panelda «Mashqni biriktirish»ni bosadi. Androidda «O‘tirib-turish mashqi»ni oching va reja chiqqach kamera yoki qo‘lda qayd yo‘lini tanlang. Internet uzilganda ilova «Telefonda saqlandi, hali yuborilmadi»ni ko‘rsatadi. Aloqa tiklangach qayd yuboriladi. Shifokor «Mashq qaydlari»dan aynan shu yozuvga javob beradi. Androidda mashq ekranidagi «Yangilash» orqali javob ko‘rinadi.

Sessiya 8 soat amal qiladi. Android uni Keystore orqali shifrlab saqlaydi. Yangi juftlash kodi eski sessiyani tugatadi. Muddati o‘tgan sessiyadagi jo‘natilmagan qayd ayni demo ish joyiga qayta ulangach yuboriladi. [Android API kontrakti](docs/INTERFACES.md#android-demo-api)

## Halollik qoidasi (muzokaraga yopiq)
**AI o'lchaydi → kod qoidalari bayroq ko'taradi → shifokor qaror qiladi.** Hech qachon "AI isbotladi/tashxis qo'ydi" yozilmaydi; simulyatsiya qismlar ochiq belgilanadi; har submission bilan "what works / what's simulated" + AI-use note keladi.

Joriy ishlar va qabul mezonlari [V2 rejasida](docs/V2_PLAN.md).
