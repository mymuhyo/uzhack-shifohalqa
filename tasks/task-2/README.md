# Task 2 — MVP (22-noyabr 2026, 23:59 MYT / 20:59 UZT)

**Status:** loyiha topshirig'i yozilishi kerak — bu fayl faqat checklist.

## Brief talablari (`brief/uzhack-online-stage-tasks-en.pdf`, §3.2, §3.4, §5.1.2)
- [ ] Ishlaydigan havola + (kerak bo'lsa) **demo loginlar** — hakamlar Incognito'da hech narsa o'rnatmay ochishi kerak
- [ ] Kamida **bitta to'liq workflow boshidan oxirigacha** ishlashi kerak
- [ ] Statik ekran/slayd/video **MVP sanalmaydi** — AI-use note va "what works / what's simulated" **majburiy**
- [ ] AI-use note: qaysi AI vositalar, nima uchun; har a'zo MVP'ni tushuntira olishi shart
- [ ] Havola **Grand Finalgacha** ishlab turishi kerak (shu havolu ustida davom etiladi)

## Baholash (Task 2 — 100 ball)
Innovation 25 · Technical execution 25 (asosiy workflow ishlayaptimi) · Practicality for Uzbekistan 20 · Impact 20 · Presentation 10

## Hakamlar uchun tayyorlash
- [ ] `Platforma Note`: what works / what's simulated jadvali (spec §9.1 asosida)
- [ ] `AI-use Note`
- [ ] Demo login: `doctor@demo`, `patient@demo` (yoki yakuniy credential'lar) + 4-qadamli ko'rsatma
- [ ] Incognito sinovi: havola ochiladi, loginlar ishlaydi, workflow o'tadi
- [ ] Mini-Benchmark natijasi Note'ga qo'shilgan (Impact 20 ball)

## Eslatmalar
- MediaPipe kamera uchun HTTPS + yoqilgan kamera ruxsati kerak; yuklangan video zaxira yo'li
- Link o'lib qolmasligi uchun: Neon (serverless Postgres) + Vercel tavsiya; bepul Supabase tarif 7 kun harakatsizlikda **pauza** bo'ladi
- Nomini / AI kalit budjetini tekshirib qo'ying; API buzilsa tizim baribir ishlashi kerak
- Topshirishdan keyin havolaga **tegmang**; Incognito'da yana tekshiring
