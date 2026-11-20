# Task 2 — MVP (22-noyabr 2026, 23:59 MYT / 20:59 UZT)

**Holat.** Vercel `main` relizida yangi, toza brauzer sessiyasida reja → «Dori tugadi» → shifokor ko‘rigi → bemorga L4 va javob oqimi o‘tdi. [Ochiq demo](https://shifohalqa.vercel.app/) · [Sinov va topshirish tafsilotlari](PLATFORM_NOTES.md) · [Platform formasi uchun matn](SUBMISSION.md)

## Brief talablari (`brief/uzhack-online-stage-tasks-en.pdf`, §3.2, §3.4, §5.1.2)
- [x] Ishlaydigan HTTPS havola va **demo rollari** toza brauzer sessiyasida ochildi
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
- [x] Lokal production build, 123 veb va 18 Python unit testi, Neon `codex-dev` bilan 14 ta Chromium E2E. DoriMos haqiqiy Gemini bilan, Telegram yetkazilishi mock transport bilan sinaldi.
- [ ] Jonli Telegram demo uchun alohida botni Python servisining HTTPS webhookiga bog‘lash va shaxsiy chatda bitta sintetik qizil qaydni tekshirish
- [x] Production HTTPS havolasida yangi sintetik ish joyidagi asosiy dori oqimi oxirigacha sinaldi
- [x] Ochiq demo havolasida DoriMos xira va mos kelmaydigan namunalari hamda «Yaqinim» havolasini bekor qilish yangi sintetik sessiyalarda sinaldi
- [ ] Haqiqiy telefonda jonli kamera qabul sinovi, natijani `docs/BENCHMARK.md` ga qo‘shish
- [ ] Platformga havola va demo izohlarini joylash

## Eslatmalar
- MediaPipe jonli kamerasi uchun HTTPS va brauzer ruxsati kerak. Yuklangan video tasdiqlansa L2 sifatida saqlanadi.
- Gemini ishlamay qolsa, bemor tekshirilmagan qutini L0 sifatida qayd eta oladi.
- Topshirishdan so‘ng jamoa havolaning Incognito oynada va Grand Finalgacha ochiqligini tekshiradi.
