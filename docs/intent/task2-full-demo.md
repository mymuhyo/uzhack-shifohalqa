# Maqsad bayonoti · Task 2 To‘liq Demo Versiyasi

Tasdiqlangan sana: 2026-11-22

- **Natija:** Veb (shifokor + qulaylashtirilgan bemor), **Android** (asosiy bemor ilovasi) va **Telegram bot** o‘rtasida dori, bosim, **kunlik qadam** (real sensor + simulyatsiya + auto-sync), **5 ta mashq** (skelet + ilova ichidagi o‘zbekcha ovoz + jonli va yakuniy AI maslahat) hamda **real kamera DoriMos** to‘liq bog‘langan end-to-end demo halqasi.
- **Foydalanuvchi:** Task 2 hakamlari va jamoa — shifokor (veb), bemor (asosiy urg‘u Android APK + qulay veb) va Telegram xabarnoma/status oqimini boshidan oxirigacha sinovchilar.
- **Nima uchun hozir:** Barcha qismlarni bitta yaxlit, boshidan oxirigacha ko‘rsatishga tayyor demo versiyaga keltirish.
- **Muvaffaqiyat mezoni:**
  1. Shifokor vebdan dori, bosim chegarasi, **kunlik qadam maqsadi** va **5 ta mashqdan** birini biriktiradi; bemor bajargach shifokor barcha natija va ogohlantirishlarni (jumladan qadam maqsadi va og‘riq xabarini) ko‘rib javob yozadi.
  2. Android ilovasida bemor: telefon qadam sensori + demo simulyatsiya bilan **auto-sync** qiladi; **real kamera + namuna DoriMos** ni o‘qiydi; 5 ta mashqda skelet chizig‘i, **tizim `uz-UZ` TTS’siz ham ishlaydigan ichki o‘zbekcha ovoz kliplari**, harakat davomida tezkor maslahat va yakunda AI murabbiy (Vercel → OpenCode → Gemini → Cloudflare zaxira zanjiri) oladi; veb-bemor interfeysi ham qulaylashtiriladi.
  3. Telegram botda: bemor/shifokor ulanishi, `/holat` orqali kunlik dori/bosim/qadam/mashq hisoboti, inline tugmalar bilan dori holatini belgilash, shifokor javobi kelganda bemorga hamda qizil/og‘riq/qadam xabarida shifokorga bildirishnoma ishlaydi.
- **Cheklov:** Mavjud sintetik namunalarni (CDC video, namuna qutilar) saqlagan holda real kamera/sensor qo‘shiladi; `schema.sql` o‘zgarishlari qo‘shimcha (additive) bo‘ladi; `npm run verify`, `pytest` va Android build/testlar o‘tishi shart; prod reliz/push faqat loyiha egasi tasdig‘i bilan qilinadi.
- **Doiradan tashqari:** Google Play Store’ga chiqarish, haqiqiy klinika/shifoxona EHR integratsiyasi va real bemor shaxsiy ma’lumotlarini saqlash (demo sintetik ish joyi modeli bilan ishlaydi).
