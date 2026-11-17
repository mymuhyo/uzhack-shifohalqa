# ShifoHalqa — MVP yo‘nalishi (UzHack 2026, qirqilgan)

## Problem Statement
UIdagi uy davolanish ("ko‘rinmas davr") vaqtida shifokor bemorning dori, mashq va ko‘rsatkichlarini ko‘ra olmaydi — shuning uchun og‘irlashish kech aniqlanadi. **How Might We:** shifokorga faqat istisno holatlarni ko‘rsatib, bemor bilan bog‘lovchi sun’iy intellekt kuzatuv halqasini Farg‘ona/Uzbek praktikasida 3 kunda ishga tushirish.

## Recommended Direction: bitta web codebase — 3 sirtlama (telegram-maksimal)
**Qoida: "Telegram ko‘tara oladiganini Telegram’da, qolganini web/Android’da."**

- **Backend (1 ta):** Next.js yoki FastAPI + Postgres/SQLite. Yagona AI qatlami (`/api/ai/analyze`): serverda vision LLM (GPT-4o-mini-vision / Gemini Flash) dori qutisi suratini JSON’ga o‘giradi (nom, doza, ishonch) → qoida shifokor rejasi bilan solishtiradi (5 mg vs 10 mg → qizil bayroq) → natija *platformaga mos formatda* chiqadi (Telegram = qisqa rich message/caption; web/APK = to‘liq karta; doktor = detal panel).
- **Bemor sirtlamalari (bir xil sahifa):** (1) web ilova `app.…/patient`, (2) Telegram Mini App (o‘sha sahifani ochadi), (3) Android APK = yupqa Kotlin shell. Flutter shart emas; KMP/native faqat shu qismlarga: kamera/MediaPipe oqimi, push-notification, home-screen shortcut. To‘liq native Kotlin (CameraX + MediaPipe Android SDK) = 2–4 hafta — 3 kunda va’da qilinmaydi; APK `assembleRelease` bilan demo telefonda ko‘rsatiladi, Play Store emas.
  - **Muqobil (kam codebase):** Android = Trusted Web Activity (TWA, Android Studio WebView shablonidan tezroq) — bitta URL, "installable app" ko‘rinishi. Qaysi biri tezroq ishlashini APK sinov kunida aniqlang.
- **Doktor sirtlamasi:** alohida `/doctor` web dashboard — istisnolar paneli (kim sariq/qizil), bemor detail, reja tuzish; sariq/qizil bayroqda Telegram-push + inline tugmalar `[Qo‘ng‘iroq qildim] / [Reja ko‘rildi]`.
- **Flutter kerak emas** — web codebase allaqachon mavjud; native his qilish Mini App + Android shell bilan yetarli.

### Telegram — to‘liq tekshirilgan imkoniyatlar (docs core.telegram.org, 15-nov-2026)
**Mini App ochilish yo‘llari (7 xil — bizga kerakli 4tasi):**
| Yo‘l | Sozlash | Bemor tajribasi |
|---|---|---|
| **Main Mini App** (bot profilingizda "Launch app" tugmasi) | @BotFather → Bot Settings → Configure Mini App | Bot profili → bir bosishda ochiladi, full-screen, `t.me/bot?startapp=` deep-link |
| **Menu Button** (chat ichida) | @BotFather `/setmenubutton` yoki `setChatMenuButton` | Chat ichida doimiy "Ilovani ochish" tugma |
| **Inline keyboard `web_app` tugmasi** | Har bir eslatma xabarida | Xabar ostidan to‘g‘ri mashq/dori sahifasiga sakraydi |
| **KeyboardButton `web_app` + `sendData`** | Oddiy reply keyboard bilan | Mini App → bot chatiga matn qaytaradi (mas. "mashq yakunlandi" — soddalashtirilgan qabul qilish) |

**Mini App JS API (telegram-web-app.js, 15-nov-2026):**
- `initData` + `initDataUnsafe` — foydalanuvchi identifikatsiyasi; **backendda HMAC-SHA256 (bot token bilan) tekshirish majburiy**, `initDataUnsafe` ga ishonmaslik.
- `themeParams`, `colorScheme` — Telegram teal/qorong‘u temasi bilan avtomatik moslashish (app Telegram ichida "native" ko‘rinadi).
- `BottomButton` (sobiq MainButton) / `SecondaryButton` — pastdagi katta asosiy tugma ("Ichdim ✅", "Mashqni boshlash").
- `BackButton`, `SettingsButton`, `HapticFeedback`, `showPopup/showAlert/showConfirm`.
- `CloudStorage` + `DeviceStorage`/`SecureStorage` — bemor sozlamalari qurilmada.
- `BiometricManager` — ilovani qulflash (ixtiyoriy).
- `addToHomeScreen` + `checkHomeScreenStatus` — bemor Mini App ni telefon ekraniga "ilova" sifatida qo‘yadi — APK'siz "native feel".
- `requestFullscreen`, `safeAreaInset`, `Accelerometer`/`Gyroscope` (mashq uchun qo‘shimcha signal, ixtiyoriy).
- `shareMessage` / `downloadFile` — natija kartasini ulashish/yuklab olish.
- `showScanQrPopup` — QR orqali bemor ↔ shifokor havolatish (ixtiyoriy).
- **`getUserMedia` (kamera) Mini App’da hujjatlashtirilmagan, lekin Mini App = to‘liq WebView/iframe, shuning uchun `<video>` kamera Telegram ichida ishlaydi (Android WebView `mediaPlaybackRequiresUserGesture=false`; iOS HTTPStreaming/WKWebView ruxsat so‘raydi)** — Pixel/iPhone’da smoke-test majburiy.

**Bot Messages (10.x):**
| Element | Vazifasi |
|---|---|
| `/start`, `/help`, `/settings` + deep link `t.me/bot?start=activate` | Onboarding, havola tiklash |
| Inline keyboard (`[Ichdim ✅] [Icha olmadim]`) + `callback_query` | Dori tasdig‘i — Mini App’siz ham ishlaydi (fallback) |
| Rich Messages + `sendRichMessageDraft` streaming (10.1/10.2) | AI haftalik hisobot "yozilayotgani" jonli |
| Rich Message buttons (10.3) | Hisobot ichida `[Tasdiqlash]`/`[Rejani ko‘rish]` |
| Ephemeral messages (10.2) | Shaxsiy eslatma — guruhda hamfaqat bemorga ko‘rinadi (oila chatida ham) |
| Widgets (10.4) | Progress pufakchasi — faqat **shaxsiy chat**; inline-tugma fallback majburiy |
| `login_url` / Web Login | Telegram orqali `/doctor` saytiga kirish |
| **ISHLATILMAYDI:** Checklists (9.1/9.2 — faqat Business account nomidan), Guest mode, Managed bots, Stars, Attachment menu (faqat reklama beruvchilar), guruh Widgets | Scope/qoidalar |

**Push notificationlar:** Mini App o‘zi push yubora olmaydi — push = Bot API `sendMessage` (bemorga botdan xabar). "Telegram notification" shu. Android shell qo‘shilsa — real push ham, lekin 3 kunda shart emas.

### AI — demo va videoning yadrosi
1. **Dori tekshiruvi (hero):** qutini bemor botga yoki Mini App ichida suratga oladi → vision LLM JSON → qoida solishtiradi → ✅/⚠️/❌ + "shifokor halqasi". AI tavsiya qiladi, shifokor hal qiladi — "tasdiqlangan" deb hech qachon yozilmaydi.
2. **Mashq AI (video uchun jonli):** brauzerda MediaPipe Pose — rep soni + confidence; past confidence yoki 1/kundan ortiq urinish → shifokor halqasi; anti-cheat oddiy (SHA-256, Motion signature yo‘q).
3. **AI analitika:** haftalik hisobot (BP, dori %, mashq, qadam) — dashboard karta + Telegram streaming rich draft.

### Kim nima ko‘radi
- **Bemor:** Telegram bot (eslatma, tugma tasdiqlash, /start→Mini App) yoki Mini App = Android APK (katta tugmalar, o‘zbekcha).
- **Doktor:** `/doctor` dashboard + Telegram push; Task 2 havolasi shu dashboardga ham ochadi (`/doctor` demo-akkaunt bilan).
- Doktor **bemor kamera orqali kuzatmaydi** — AI report (rep soni + confidence) ko‘radi.

## Key Assumptions to Validate
- [ ] MediaPipe + getUserMedia Telegram Mini App WebView’ida real telefonда ishlaydi — **bugun smoke-test** (yo‘q bo‘lsa: mashq demo faqat web/APK’da).
- [ ] Vision LLM o‘zbekcha/kirilcha dori yorliqlarini ishonchli o‘qiydi — 10 namuna rasm bilan test; ishonchpast bo‘lsa "tasdiqlash" tugmasini majburiy qil.
- [ ] 3 kishilik jamoa 3 kunda: backend+AI (Tech Lead) / web+MediaPipe (Frontend) / bot+QA+video (Product) — parallel git worktrees, har kuni ertalab sinxron.
- [ ] APK `assembleRelease` 1–2 soat ichida compile bo‘ladi — shu hafta sinab ko‘r.
- [ ] Task 1 video ssenariysi 17-noyabrgacha tayyor: doktor → reja → bemor (kamera mashq + dori rasmi) → dashboard bayroq → shifokor push.

## ⚠️ Muddat noaniqligi (birinchi tekshiriladigan)
- Repo'dagi rasmiy PDF (`brief/uzhack-online-stage-tasks-en.pdf`, Brief v1.0, 9-noyabr): Task 1 = **12-noyabr**, Task 2 = **15-noyabr 23:59 MYT (= bugun)**. Task 1 bajarilmagan bo‘lsa baholanmaydi degan band bor.
- README/master_plan esa «tashkilotchi uzaytirdi»: Task 1 = **18-nov**, Task 2 = **22-nov 23:59 MYT**. Ikkalasi ham «uzhack.uz / Platforma’da tekshiring» дейди.
- **Harakat:** hoziroq uzhack.uz va Platformani ochib, qaysi sanalar amalda ekanini ko‘ring; platforma yopiq bo‘lsa Task 1 video + Project information va Task 2 havolasini bugun kechgacha topshirish rejasi shart. PDF baribir 30/70 vazn bilan hisoblaydi (sizning umumiy ballingiz asosan Task 2’ga tayanadi).
- Brief v1.0’dan topshirish majburiyatlari (sanadan qat’i nazar kuchda): brauzer havolasi, demo login, **simulyatsiya qilingan qismlar ro‘yxati**, **AI-use note**, havola Grand Finalgacha ishlashi shart; ~15 finalchi, Track’dan 5 tа, min 50 ball.

## MVP Scope (in)
- Reja biriktirish: doktor dashboardda shifokor-demo akkaunt, standart "Gipertenziya 14 kun" + "Rehab Squat" rejasi.
- Bot: eslatma, `[Ichdim ✅]/[Icha olmadim]`, deep-link onboarding, Menu Button "Ilovani ochish".
- Mini App/web/APK bemor sahifasi: Bugungi reja, dori qutisi skripti, kamera mashq (1 preset).
- Doktor dashboard: istisnolar paneli, patient detail (grafik BP/qadam, dori jadvali, mashq ro‘yxati), sariq/qizil Telegram-push.
- AI: dori vision-check, MediaPipe rep/confidence, haftalik rich-draft xulosa.
- 18-nov: **Task 1** (video + Project information) · 22-nov: **Task 2** (`/doctor` havola + APK demo telefonда).

## Android (foydalanuvchi tanlashi: AI ixtiyorida, KMP/native afzal)
- Kerakli qismlar Android’da bo‘ladi: kamera/MediaPipe oqimi + push notification + (ixtiyoriy) home-screen shortcut.
- **Men tavsiya qiladigan yo‘l:** UI = web codebase (Mini App/web bilan bir xil), Android = ilova qobig‘i; kamera uchun WebView ichida getUserMedia nativega qaraganda kamroq ishlatiladi, shu sabab **kamera modulini KMP yoki native Kotlin (CameraX) ga ko‘chirish** faqat Task 2 havolasi ishlashiga xavf tug‘dirmaydigan bo‘lsa.
- **Flutter:** mumkin, lekin qo‘shimcha kod-baza/toolchain demak — 3 kunda foydasi < xarajati. Tanlash tartibi: (a) WebView shell + web kamera (eng tez, 1–2 soat), (b) KMP — faqat kamera/notification moduli, (c) to‘liq native — **yo‘q**. (a) bilan boshlang; demo telefonda ishlasa — shu yetadi.
- Play Store yo‘q; APK fayl demo telefoniga o‘rnatiladi (README 22-nov 23:59’da Play Store chiqarmaydi degan bandiga mos).

## Not Doing (and Why)
- Individual (shifokorsiz) rol — eng katta scope hog‘i; Task 1 da bemor baribir shifokorga "ulangan" holatda ko‘rsatiladi; roadmap.
- Chair Stand 30s, motion-signature, vitals tonometr OCR — "qoidalar + bitta preset" yetarli; Vision OCR 2–4 hafta aniqlik sinaydi.
- Native Android MediaPipe SDK — shell bilan qoniqamiz; "to‘liq native" va’dasi yolg‘on bo‘lmasin.
- Click/Payme/Stars — hackathonda to‘lov talab emas; Play Store — 22-nov 23:59 da chiqarilmaydi.
- Family caregiver read-only — vaqt qolsa: bot orqali oilaga kunlik digest ("Oying bugun dorisini ichdi ✅") — 30 daqiqa; aks holda roadmap.
- Guruh/channels Widgets, Checklists, Guest/Managed bots — Telegram qoidalari/scope.

## Open Questions
1. Mini App WebView’ida kamera ruxsati real devices’da (Android 10+) qanday — oldindan 2–3 qurilmada tekshirish kerak.
2. Vision LLM uchun qaysi provider key bor (OpenAI/Gemini)? Umumiy API kalit jamoa hisobida?
3. Doktor demo-akkaunt logini qanday ko‘rsatiladi (parol? Telegram orqali?) — Task 2 havolasiga evaluator kira olsin.
4. Video Telegram'ni qancha ko‘rsatadi (bot + Mini App + dashboard uchtasi ham)? Task 1 ssenariysi shunga qarab yoziladi.
