# UzHack 2026 — ShifoHalqa

**Track:** 01 Smart Healthcare · **Musobaqa:** UzHack 2026 (Uzbekistan–Malaysia Tech Bridge)
**Mahsulot:** shifokor bergan uy davolanish rejasini bemor telefonida kundalik vazifalarga aylantiradi; har vazifa **dalil darajasi (L0–L4)** bilan qayd etiladi; deterministik qoidalar faqat istisnolarni shifokor paneliga chiqaradi — "ko'rinmas davr"ni yopadi.

> **Joriy holat.** Sintetik shifokor uy rejasini biriktiradi, bemor dori yoki bosimni qayd etadi, shifokor esa tanlangan qaydni ko‘rib bemorga javob beradi.

Mashq rejasini biriktirgach, bemor sahifasidan «O‘tirib-turish mashqi»ni oching. CDC namunasi kamerasiz ishlaydi. Brauzer modelni shu ilovadan yuklaydi va video kadrlarini qurilmada tahlil qiladi. Real telefon kamerasi uchun brauzer HTTPS va kamera ruxsatini talab qiladi. «Reja ijrosi» dori va qon bosimi bo‘yicha hisobni, qadamlar esa alohida qo‘lda kiritilgan qiymatni ko‘rsatadi.

«DoriMos»da tayyor sintetik qutini tanlang va rasmda o‘qilgan yozuvni tasdiqlang. Rejadagi nom yoki kuchdan farq bo‘lsa, shifokor navbatida alohida qayd chiqadi. «Yaqinim»da bemor bugungi qisqa holat uchun 24 soatlik havolani yaratishi va bekor qilishi mumkin.

## Branch va muhit tartibi

- **`main` (`v1-task2-demo`) — muzlatilgan jonli Task 2 hakamlar demosi.** Vercel (`shifohalqa.vercel.app`) va Railway (`@shifohalqa_bot`) `main` dan deploy oladi va Neon `shifohalqa/main` bazasiga ulangan. Egasi ruxsatisiz `main` ga tegilmaydi.
- **`final` — faol Grand Final rivojlantirish branchi.** Supabase (`shifohalqa-final`, `byswnhfcqxjvnallggxj`, `ap-southeast-1`) va izolyatsiyalangan Vercel/Telegram preview muhitiga (`SHIFO_ENV_ID=final-preview`) ulangan.
- **Production (Task 2 demo):** https://shifohalqa.vercel.app (Vercel `shifohalqa`, `main`)
- **Telegram:** [@shifohalqa_bot](https://t.me/shifohalqa_bot) · [Railway healthcheck](https://shifohalqa-telegram-production.up.railway.app/healthz)
- **AI:** Hybrid — on-device MediaPipe Pose (L3) + Vercel AI Gateway (primary) + Cloudflare Workers AI (Clef + Clairic Flash / fallback) + deterministik o‘zbekcha zaxira.

Tanlanadigan mashqlar — o‘tirib-turish (`chair_stand`), tirsak bukish (`elbow_bend`) va o‘tirgan holda oyoqni tekislash (`seated_knee_ext`). Web va Android kamera yoki mahalliy videodan texnika izohini ko‘rsatadi.

## O'qish tartibi
| Fayl | Maqsad |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Ish chegaralari, branch qoidalari va pushdan oldingi tekshiruvlar |
| [`docs/GRAND_FINAL_HANDOFF.md`](docs/GRAND_FINAL_HANDOFF.md) | Hakamlar uchun Story 1 + Story 2 tezkor qo‘llanma va halollik deklaratsiyasi |
| [`docs/PLAN.md`](docs/PLAN.md) | Grand Final M1–M6 bajarish rejasi va gate tekshiruvlari |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Grand Final arxitektura qarorlari (`ADR-001`–`ADR-008`) |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Interfeys, motion va platformalararo dizayn shartnomasi |
| [`docs/ROADMAP_V2.md`](docs/ROADMAP_V2.md) | Grand Finaldan keyingi klinik pilot va Fully Agentic Clinical Assistant v2 reja |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | Sessiyalararo davomiylik jurnali |
| [`docs/SPEC.md`](docs/SPEC.md) | Mahsulot + texnik kontrakt: rollar, sxema, AI pipeline, qoidalar |
| [`docs/INTERFACES.md`](docs/INTERFACES.md) | Engine eksportlari va server integratsiyasi |
| [`docs/BENCHMARK.md`](docs/BENCHMARK.md) | MediaPipe va AI o‘lchov natijalari |

## Lokal demo

Node.js 22 yoki yangirog‘i kerak. `.env.example` shablonidan `.env.local` yarating. Supabase `shifohalqa-final` (`byswnhfcqxjvnallggxj`) kalitlarini, `SHIFO_ENV_ID=final-preview`, `AUTH_SIGNUP_ENABLED=false`, `DEMO_MODE=true` va `openssl rand -hex 32` bilan yaratilgan `SESSION_SECRET` ni kiriting.

```bash
cd ~/Projects/uzhack
npm ci
npm run dev
```

[Lokal demo](http://localhost:3000/) sahifasida 1-click Demo rolini tanlang yoki oldindan seed qilingan klinika hisobiga kiring. Bir brauzerda rolni almashtirsangiz, o‘sha demo ish joyida qolasiz. Yangi brauzer sessiyasi alohida ish joyini oladi.

Bazasiz demo sessiyasi uchun `DATABASE_URL` bo‘sh turadi. Bazaga bog‘liq lokal ish uchun izolyatsiyalangan `shifohalqa-final` bazasining pooled URL’ini `.env.local` dagi `DATABASE_URL` ga, direct URL’ini esa `DATABASE_URL_UNPOOLED` ga belgilang. Har bir DB yozuvi va E2E `public.environment_identity` jadvalidagi `final-preview` qiymatini `SHIFO_ENV_ID` bilan tekshiradi. Sxema migratsiyalari `supabase/migrations/` papkasida saqlanadi (Supabase MCP `apply_migration` yoki `DATABASE_URL_UNPOOLED` orqali qo‘llanadi). Oldindan seed qilingan klinika shifokori va bemorlarini yaratish uchun:

```bash
node --env-file=.env.local --experimental-strip-types scripts/seed-clinic-demo.ts
```

## Tekshiruv

```bash
npm run verify
npm exec playwright install chromium
SHIFO_E2E_DATABASE_URL="$DATABASE_URL" SHIFO_ENV_ID=final-preview npm run e2e
```

Playwright lokal serverda alohida sessiya kaliti bilan ishlaydi. Standart brauzer smoke sessiya va rol almashishini tekshiradi. Reja, bemor qaydi va shifokor ko‘rigi testlari `npm run verify` yasagan production buildni ishlatadi. Bu testlar uchun `SHIFO_E2E_DATABASE_URL` ga `shifohalqa-final` bazasini va `SHIFO_ENV_ID=final-preview` ni bering. Har bir test yangi sintetik ish joyidan foydalanadi. Ochiq relizni veb-interfeysda alohida sintetik sessiya bilan tekshiring.

Ma’lumotlar bazasi bilan E2E Python servisini ham ishga tushiradi. Avval `uv sync --project services/telegram_bot --locked` bilan uning bog‘liqliklarini o‘rnating. Python unit testlari uchun `uv run --project services/telegram_bot --locked pytest services/telegram_bot/tests` ishlating. E2E Telegramga chiqmasdan, bitta sintetik chatga bog‘langan navbatni izolyatsiyalangan `shifohalqa-final` bazasida sinaydi.

Jonli DoriMos brauzer sinovi uchun `SHIFO_E2E_LIVE_DORIMOS=1` va tanlangan provayder kalitlari kerak. `CLOUDFLARE_ACCOUNT_ID` va `CLOUDFLARE_API_TOKEN` berilsa, Clef quti sifatini tekshiradi, Clairic Flash yozuvni o‘qiydi. Cloudflare ishlamay qolsa, `GEMINI_API_KEY` va `OPENROUTER_API_KEY` bilan Gemini Decisions + OpenRouter yo‘li ishlaydi. Xira yoki noaniq namuna qayta olishga yuboriladi. `DORIMOS_PROVIDER=gemini` o‘sha yo‘lni bevosita tanlaydi. Standart E2E tashqi AI provayderlarini chaqirmaydi. Sintetik quti benchmarkini quyidagi buyruq bilan takrorlash mumkin. [Benchmark qaydlari](docs/BENCHMARK.md)

```bash
node --env-file=.env.local node_modules/vite-node/vite-node.mjs scripts/dorimos-benchmark.ts
```

`npm run dev` va `npm run build` boshlanishida pin qilingan MediaPipe paketidan WASM fayllari `public/models/wasm/` ga ko‘chiriladi. Lite model repoda saqlanadi. [Kamera va klip sinovi](docs/BENCHMARK.md)

## Telegram bot va Mini App (`/tg`)

Bot Python 3.12–3.14 va `aiogram==3.31.0` servisida ishlaydi (`services/telegram_bot`). Veb-ilova `TELEGRAM_BOT_USERNAME` va `TELEGRAM_BOT_TOKEN` orqali Telegram `initData` imzosini tekshirib, Telegram Web/Desktop/Mobile iframe’larida kukisiz ishlaydigan qisqa muddatli `tgm1.` Bearer tokenini chiqaradi (`POST /api/telegram/auth`). Bot esa `TELEGRAM_BOT_SERVICE_SECRET` + `X-Telegram-Chat-Id` bilan Next.js `/api/telegram/bridge` ko‘prigiga murojaat qiladi.

- **Mini App (`/tg`):** Telegram SDK `themeParams`/`colorScheme` (Light/Dark), `safeAreaInset`, `MainButton`/`SecondaryButton`/`BackButton`, `HapticFeedback`, 4 bo‘lim (`Bugun`, `Mashq` — barcha 3 harakat, `Hisobot` — 7 kunlik L4 brief va trend, `Maxfiylik` — chat tafsilotlari opt-in/opt-out va Yaqinim havolasi) hamda 1-click Demo kirishi.
- **Bot buyruqlari:** `/start`, `/bugun` (semantik `success`/`primary`/`danger` tugmalar + joyida `EditMessageText` ko‘p-doza kartasi), `/bosim 135/85`, `/qadam 4800`, `/hisobot`, `/maxfiylik`, `/mashq`, `/ilova`, `/stop`. Sukut bo‘yicha chat maxfiyligi himoyalangan (tafsilotlar faqat opt-in dan keyin ko‘rinadi).

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
