# Task 2 — MVP (22-noyabr 2026, 23:59 MYT / 20:59 UZT)

**Holat.** `codex/dev` reliz nomzodi va hakam uchun demo matni tayyor. Jamoa ommaviy HTTPS relizi, telefon sinovi va Platform topshirishini bajaradi. [Demo yo‘li va topshirish paketi](PLATFORM_NOTES.md)

## Brief talablari (`brief/uzhack-online-stage-tasks-en.pdf`, §3.2, §3.4, §5.1.2)
- [ ] Ishlaydigan havola + **demo loginlar** — hakamlar Incognito'da hech narsa o'rnatmay ochishi kerak
- [x] Lokal buildda reja → vazifa → dalil → bayroq → shifokor L4 → bemor javobi E2E sinovdan o‘tdi
- [x] Ishlaydigan va sintetik qismlar izohi hamda AI-use note tayyor
- [ ] Har a’zo MVP oqimini tushuntirib bera olishini jamoa tekshiradi
- [ ] Havola **Grand Finalgacha** ishlab turishi kerak

## Baholash (100 ball)
Innovation 25 · Technical execution 25 · Practicality 20 · Impact 20 · Presentation 10 → `competition/RUBRIC.md`

## Topshirish checklist (Faza 5)
- [x] `PLATFORM_NOTES.md` ishlaydigan, sintetik va keyingi bosqichdagi qismlarni bayon qiladi
- [x] AI-use note Codex, MediaPipe va ishlatilgan Gemini modellarini ko‘rsatadi
- [x] Hakam uchun ikki rol tugmasi (`/`), `/about`, demo reset va to‘rtta ko‘rinadigan quti namunasi
- [x] Amalda o‘lchangan MediaPipe va DoriMos benchmarklari
- [x] Lokal production build, 120 veb va 15 Python unit testi, Neon `codex-dev` bilan 13 ta Chromium E2E. Telegram yuborishi mock bilan sinaldi.
- [ ] Jonli Telegram demo uchun alohida botni Python servisining HTTPS webhookiga bog‘lash va shaxsiy chatda bitta sintetik qizil qaydni tekshirish
- [ ] Jamoa imzolagan reliz, production HTTPS havolasida Incognito sinovi va to‘liq demo
- [ ] Haqiqiy telefonda jonli kamera qabul sinovi, natijani `docs/BENCHMARK.md` ga qo‘shish
- [ ] Platformga havola va demo izohlarini joylash

## Eslatmalar
- MediaPipe jonli kamerasi uchun HTTPS va brauzer ruxsati kerak. Yuklangan video tasdiqlansa L2 sifatida saqlanadi.
- Gemini ishlamay qolsa, bemor tekshirilmagan qutini L0 sifatida qayd eta oladi.
- Topshirishdan so‘ng jamoa havolaning Incognito oynada va Grand Finalgacha ochiqligini tekshiradi.
