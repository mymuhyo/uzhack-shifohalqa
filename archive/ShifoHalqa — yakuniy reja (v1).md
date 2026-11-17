# ShifoHalqa — yakuniy reja (v1)

*UzHack 2026 · Smart Healthcare · 12-noyabr 2026 holati. Bu hujjat jamoaning yagona manbasi: AI bilan kod yozganda shu rejaga tayaning.*

## 0. Bugungi ustuvorlik

- **Task 1 muddati bugun: 12-noyabr, 23:59 MYT (Toshkent vaqti bilan 20:59).** Video (3-5 daqiqa, har bir a'zo ko'rinadi va rolini aytadi) va Platformadagi *Project information* to'ldirilishi shart, aks holda jamoa baholanmaydi.
- Maqsad: ikkalasini ham 18:00 MYT atrofida topshirish va havolani incognito oynada sinash.
- Videoda faqat 9-bo'limdagi 1-3 qatlamni va'da qiling. Qurilmagan narsani «bor» demang.
- MVP muddati: 15-noyabr, 23:59 MYT. Brief v1.0 edi, uzhack.uz da yangilanishni tekshirib turing.

## 1. G'oya va muammo

**Bir jumla:** shifokor uy sharoiti uchun reja beradi (mashq, qadam, oddiy o'lchovlar), bemor uni telefon brauzerida bajaradi, tizim har natijaga dalil darajasi va ishonch bahosini yozadi, shifokor esa faqat e'tibor talab qiladigan bemorlarni ko'radi.

**Muammo (aniq):** poliklinika qabulidan keyin bemor, masalan tizza operatsiyasidan keyin tiklanayotgan yoki surunkali kasallikni uyda nazorat qilayotgan keksa odam (Farg'ona), haftalar davomida reja bo'yicha yashaydi. Shifokor esa navbatdagi qabulgacha reja bajarilayotganini ko'rmaydi. Og'riq yoki bajarilmayotgan mashq o'z vaqtida shifokorga yetmasligi mumkin.

**Tekshirilishi kerak bo'lgan taxminlar** (isbotlanmaguncha fakt sifatida aytmang): shifokorlarda bemorlarni birma-bir tekshirishga vaqt yo'q; DMED kunlik reja ijrosini ko'rsatmaydi; bemorlar dori va mashqlarda adashadi. Har birini kamida bitta haqiqiy suhbat yoki ochiq manba bilan tasdiqlang, bo'lmasa «biz buni taxmin qilamiz va tekshiryapmiz» deng. Raqamlar faqat manbasini o'zingiz ochib ko'rgan bo'lsangiz ishlatiladi. Fiktiv misol («Anvar aka») videoda «tasavvur qilingan misol» deb aytilsin. Brief talabi: figura, iqtibos va natijalarni o'ylab topmang.

**Farqimiz:** takror sanovchi ilovalar (masalan Alarmy) bor. Bizning farqimiz: shifokor tayinlagan reja → dalil darajali natija → ishonch past bo'lsa shifokor halqasi → shifokor faqat istisnolarni ko'radi.

**Qilmaymiz:** tashxis qo'ymaymiz, doza yoki yukni o'zgartirmaymiz, mashqni o'zimiz tayinlamaymiz (faqat shifokor yoki tasdiqlangan kutubxona), «AI isbotladi» demaymiz. AI o'lchaydi, qoida bayroq ko'taradi, shifokor qaror qiladi.

## 2. Rollar

- **Shifokor:** shablondan reja tuzadi, chegaralarni belgilaydi, istisnolar panelini ko'radi, klipni ko'rib chiqadi.
- **Bemor:** rejani bajaradi, og'riq bildiradi, ruxsat bilan klip yuboradi.
- **Individual foydalanuvchi:** shifokorsiz. Kutubxonadan o'zi vazifa qo'shadi (`created_by = self`), ma'lumoti standart bo'yicha shaxsiy.
- **Oila a'zosi (faqat o'qish havolasi):** 4-qatlam yoki roadmap.

## 3. Vazifa mexanizmi va dalil narvoni

**Vazifa** = tur + ko'rsatkich + maqsad + davr (kun, hafta, oy) + tekshiruv usuli + parametrlar (JSON). Kun, hafta va oy yig'indisi oddiy SQL bilan hisoblanadi, AI emas.

| Tur | Misol | Qanday qayd etiladi |
| --- | --- | --- |
| Mashq | 10 ta o'tirib-turish yoki 30 soniyalik stul testi | kamera + poza (yoki yuklangan klip) |
| Qadam | kuniga 6000, haftalik, oylik | qo'lda kiritish (MVP) |
| O'lchov | qon bosimi | qo'lda kiritish (MVP) |
| Dori | ertalab 1 tabletka | «ichdim» tugmasi |

**Dalil narvoni:** 0 = o'z hisobot (tugma yoki qo'lda raqam); 1 = qurilmadan olingan yoki taymer (Health Connect: roadmap); 2 = foto yoki skrinshot o'qildi va bemor tasdiqladi, yoki yuklangan klip (manbasi tasdiqlanmagan); 3 = jonli kamerada poza orqali sanalgan; 4 = shifokor ko'rib chiqdi. Har yozuvda yorliq: «bemor aytdi», «suratdan o'qildi», «kamera orqali sanalgan, ishonch 0.82», «shifokor ko'rdi».

**Qadam manbasi:** `steps_source` = manual | screenshot | health\_connect, va `recording_method` maydoni. MVP'da faqat manual. Maydonlar hozirdan bo'lsin, keyin Android integratsiyasi arzon qo'shiladi.

## 4. Mashq motori (asosiy texnik qism)

**Texnologiya:** MediaPipe Pose Landmarker, brauzerda (WebAssembly). Tayyor model, o'qitish yo'q. Video standart holatda qurilmadan chiqmaydi. Kamera uchun HTTPS kerak.

**Nuqtalar:** yelka 11/12, bilak 15/16, son 23/24, tizza 25/26, to'piq 27/28. Tizza burchagi = tizzadan sonaga va to'piqqa yo'nalgan vektorlar orasidagi burchak. Har kadrda `visibility` o'rtachasi yuqori tomon tanlanadi. Burchak oxirgi 5 kadr bo'yicha silliqlanadi.

**Holat mashinasi (ikki chegarali, gisterezis):** WAITING\_FOR\_BODY → STANDING → DESCENDING → BOTTOM → ASCENDING → STANDING. Takror to'liq hisoblanadi, agar BOTTOM'ga yetgan bo'lsa (burchak `sit_angle_max` dan past, kamida 3 ketma-ket kadr) va STANDING'ga qaytgan bo'lsa. Yetmasdan qaytsa, sayoz takror. Nuqtalar yomon ko'rinsa sanash to'xtaydi va «2 qadam orqaga yuring» chiqadi.

**Bitta motor, ikki preset:**

1. `sit_to_stand`: chuqurlik bo'yicha. Parametrlar: `stand_angle_min`, `sit_angle_max`, `target_reps` (shifokor belgilaydi, demoda namunaviy qiymat).
2. `chair_stand_30s`: CDC STEADI 30 soniyalik stul testi qoidalari bo'yicha. 30 soniya taymer, to'liq turishlar soni, vaqt tugaganda yarmidan oshgan tur hisoblanadi, qo'llar ko'krakda kesishgan bo'lishi kerak (bilaklar qarama-qarshi yelkaga yaqinligi kadrlarning ko'pchiligida tekshiriladi). Qo'l ishlatilgan bo'lsa ilova rasmiy ball hisoblamaydi, faqat «qo'l ishlatilgan bo'lishi mumkin» belgisini qo'yadi. Yoshga mos me'yor yoki xavf xulosasini ilova chiqarmaydi, buni shifokor qiladi.

**Baseline:** birinchi urinishda og'riqsiz 2 ta o'tirib-turish. Minimal burchak saqlanadi, keyingi progress shunga nisbatan ko'rsatiladi (harakat diapazoni yaxshilanishi). Universal «to'g'ri burchak» yo'q.

**Saqlanadigan natija:** to'liq va sayoz takrorlar, har takrorning minimal burchagi, davomiylik, ishonch, manba (live yoki upload), harakat imzosi, bayroqlar. Video saqlanmaydi.

**Ishonch (heuristika):** to'g'ri aniqlangan kadrlar ulushi × nuqtalarning o'rtacha ko'rinishi. Chegara (demo uchun 0.75) o'z yozuvlaringizda kalibrlanadi.

**Xavfsizlik:** doim ko'rinib turgan \[Og'riq: to'xtatish\] va \[103\] tugmalari; mashq ro'yxati faqat shifokor tasdiqlagan; stul landmarklarni to'sib qo'yishi mumkin, haqiqiy telefonda sinang.

**Ikki tahlil yo'li:** (A) asosiy: qurilmada poza + qoidalar. (B) ixtiyoriy, 4-qatlam: rozilik bilan yuborilgan qisqa klipga bulutdagi video-AI «izoh» beradi. B takror sanamaydi va o'lchov emas, shifokorga ko'rsatiladigan «AI taklifi». Sabab: video modellar odatda sekundiga 1 kadr bilan ishlaydi va takror sanashda ishonchsiz.

## 5. Qoidalar va shifokor halqasi

Qoidalar kodda va JSON sozlamada turadi, AI qaror qilmaydi. Qiymatlar **DEMO**: klinik chegaralarni shifokor kiritadi, biz o'ylab topmaymiz.

| Qoida | Shart | Bayroq | Harakat |
| --- | --- | --- | --- |
| EMERGENCY\_SYMPTOM | ko'krak og'rig'i yoki nafas qisishi belgilandi | critical | «103» oynasi + shifokorga signal |
| EXERCISE\_PAIN | og'riq tugmasi bosildi | red | mashq to'xtaydi, shifokor navbati |
| BP\_OUT\_OF\_RANGE | shifokor kiritgan chegaradan tashqari | red | panelda 1-o'rin, qayta o'lchash tavsiyasi |
| LOW\_CONFIDENCE | ishonch past yoki sayoz takrorlar ko'p | yellow | klip yuborishga rozilik so'raladi |
| REPLAY\_SUSPECTED | harakat imzosi oldingisiga juda o'xshash | yellow | ko'rib chiqishga |
| MISSED\_DAYS | ketma-ket 2 kun bajarilmadi (sozlanadi) | yellow | shifokor panelida |

**Ko'rib chiqish oqimi:** har yuborishda alohida rozilik, qisqa klip (10-15 soniya), muddatli havola, avtomatik o'chirish, audit log. Shifokor: \[Tasdiqlash\] (4-daraja), \[Qayta urinish\], \[Qabulga chaqirish\]. Qaror bemorga ko'rinadi. Klip obyekt omborida saqlanadi (DB ichida emas). Demo klip faqat roziligi bor jamoa a'zolaridan.

## 6. Takroriy yuklash va aldovga qarshi himoya

1. Davr bo'yicha **bitta hisobga olinadigan natija** (masalan kuniga bitta). Qolgani «qo'shimcha mashq».
2. **SHA-256 xesh** brauzerda hisoblanadi, faqat xesh yuboriladi. Qayta kodlash buni aylanib o'tadi.
3. **Harakat imzosi** (20 nuqtali burchak egri chizig'i) oldingilar bilan solishtiriladi. Rad etmaydi, belgilaydi. Chegara o'z yozuvlaringizda kalibrlanadi.
4. Fayl metama'lumoti: zaif signal.
5. Yuklangan klip dalil darajasi jonli kameradan past. Shifokor har bemor uchun yuklashni ruxsat yoki taqiq qiladi.
6. Shifokor tasodifiy audit qiladi.

**Halol cheklov:** poza qurilmada hisoblangani uchun natija JSON'ini texnik odam soxtalashtirishi mumkin. MVP'da natija «qurilma xabar qilgan» deb belgilanadi. Roadmap: rozilik bilan yuborilgan klipni serverda qayta tahlil qilish va tasodifiy tekshiruv. 100% to'sib bo'lmaydi, shuning uchun har yozuvda dalil darajasi ko'rsatiladi.

## 7. Individual rejim

- 3-5 tayyor vazifali kutubxona. Har birida tavsif, parametrlar, xavfsizlik izohi va kimlarga mos emasligi. Parametrlar shifokor, fizioterapevt yoki chop etilgan manbadan; bo'lmasa «demo qiymat» deb belgilang.
- Xavfsizlik savollari (yosh guruhi, maqsad, og'riq, bosh aylanishi, yaqinda operatsiya) **kodda** tekshiriladi. Xavfli javobda tavsiya berilmaydi, «shifokorga murojaat qiling» chiqadi.
- 4-qatlam: AI faqat **kutubxonadan tanlaydi** va sababini sodda tushuntiradi. Yangi mashq yoki doza o'ylab topmaydi. Yorliq: «AI tavsiyasi, shifokor tasdiqlamagan». Bu tibbiy maslahat emas, sog'lomlashtirish vositasi.

## 8. Arxitektura va ma'lumotlar

- **Tavsiya etilgan stek:** Next.js (TypeScript) to'liq stek + Tailwind + hostingdagi PostgreSQL. MediaPipe brauzerda JS bilan ishlagani uchun bitta repo va bitta deploy qulay. Jamoa Python'da tezroq bo'lsa: FastAPI + oddiy JS. SQLite serverless hostingda saqlanmaydi, ehtiyot bo'ling. Bepul tariflar uxlab qolishi yoki pauza bo'lishi mumkin: joriy shartlarni tekshiring. Havola Grand Finalgacha ishlab turishi kerak.
- **AI:** faqat server tomonda, kalit yashirin, xarajat chegarasi va rate limit bilan. Model nomlarini joriy hujjatdan oling (eski rejalardagi nomlar eskirgan bo'lishi mumkin). Poza, qoidalar va hisob-kitoblar AI'ga bog'liq bo'lmasin. API ishlamasa tizim ishlashda davom etsin.
- **Jadvallar:** `users`; `care_links`; `task_templates` (turi, birligi, params JSON); `tasks` (created\_by, shared, target, period, params\_json); `task_logs` (value, source\_type, evidence\_level, confidence, is\_primary\_period, file\_sha256, motion\_signature, details\_json, flag\_color, flag\_reason, steps\_source); `review_requests` (log\_id, reason, consent\_given, clip\_ref, status, doctor\_comment); `consents`; `audit_log`.
- **API (minimal):** demo-login; vazifalar ro'yxati va yaratish; log yozish (qoidalar shu yerda ishlaydi); bemorlar ro'yxati va bayroqlar (shifokor); ko'rib chiqish so'rovi yaratish va hal qilish; rozilik; kutubxona; (4-qatlam) AI tavsiya.
- **Hakamlar uchun:** demo-login tugmalari (shifokor, bemor, individual) va haqiqiy rol tekshiruvi; sintetik seed: 3 bemor (qizil, sariq, yashil).

## 9. Qatlamlar va «tayyor» mezonlari

**1-qatlam: yadro sikl (kamerasiz).** Rollar, kutubxona, vazifa yaratish (shifokor yoki bemor), qo'lda bajarish, kun/hafta/oy progress, shifokor paneli (ijro foizi, bayroqlar), qoidalar, seed, deploy. *Tayyor:* shifokor reja yuboradi → bemor bajaradi → shifokor panelida natija va bayroq ko'rinadi; havola incognito oynada ochiladi.

**2-qatlam: kamera motori.** O'tirib-turish (ikki preset), jonli kamera va yuklangan klip, bitta hisobga olinadigan natija, xesh va harakat imzosi. *Tayyor:* yaxshi yorug'likda jamoa a'zosining telefonida 10 ta takror ±1 xato bilan sanaladi; natija logga yoziladi; yuklangan klip ham xuddi shu yo'ldan o'tadi.

**3-qatlam: shifokor halqasi.** Ishonch past yoki og'riq yoki takror shubhasi → rozilik → klip → shifokor qarori → bemorga qaytadi. *Tayyor:* butun halqa demo hisobda boshidan oxirigacha ishlaydi.

**4-qatlam (bittasini tanlang):** tonometr yoki qadam skrinshotini vision modeli bilan o'qish + tasdiq; DoriMos (dori qutisi yorlig'i); AI tavsiya (individual); bulutdagi video-AI izohi; jonlilik tekshiruvi (tasodifiy buyruq); oila havolasi; teach-back.

**Roadmap (qurilmaydi):** Android Health Connect orqali qadam (faqat native Android ilovada ishlaydi), serverda qayta tahlil, foydalanuvchi roziligi bilan ma'lumot yig'ish, DMED/FHIR eksport, Telegram.

## 10. Task 1 (bugun): video va Project information

**Video tuzilmasi (maqsad 4:30, chegara 5:00):**

| Vaqt | Mazmun |
| --- | --- |
| 0:00-0:30 | Har a'zo: ism va rol |
| 0:30-1:30 | Aniq muammo: kim, qayerda (Farg'ona), nima bo'ladi |
| 1:30-2:15 | Nega muhim va nimaga tushadi (faqat manbasi bor raqamlar) |
| 2:15-2:55 | Bugun qanday hal qilinadi va nima yetishmaydi |
| 2:55-4:00 | Yechim: shifokor rejasi, kamera, dalil darajasi, shifokor halqasi (haqiqiy ekran yoki eskiz) |
| 4:00-4:40 | Task 2 MVP nima qiladi (1-3 qatlam), nimasi simulyatsiya, keyingi qadamlar |

Baholash: muammo aniqligi 30, odamlarni tushunish 20, yechim 30, taqdimot aniqligi 20. Vaqtning katta qismini muammo va odamlarga bering.

**Project information (Platformaga, ingliz tili):**

- *Project name:* ShifoHalqa
- *Short description:* ShifoHalqa turns a doctor's home plan (exercises, steps, simple measurements) into daily tasks in a phone browser. In-browser pose estimation counts sit-to-stand repetitions without sending video anywhere by default, every result carries an evidence level and a confidence score, and rules show the doctor only the patients who need attention.
- *Problem statement:* After a clinic visit, a patient in Fergana, for example an older adult recovering from knee surgery or managing a chronic condition at home, follows a plan for weeks without feedback. The doctor cannot see whether the plan is actually being done until the next appointment, so pain or non-adherence may be reported late. \[Add here only what you learned from real conversations or sources you opened.\] We assume, and are verifying, that existing national services such as DMED cover appointments, records and prescriptions but not day-to-day plan execution.
- *Proposed solution:* A web app with three roles (doctor, patient, individual). The doctor assigns a plan from templates and sets limits. The patient completes tasks; an in-browser pose model counts repetitions of a sit-to-stand exercise (also the 30-second chair stand protocol) and records confidence. Deterministic rules flag pain, out-of-range readings, missed days and low-confidence results. With the patient's explicit consent, a short clip goes to the doctor's review queue. The AI never diagnoses or changes treatment.
- *Planned technologies:* Next.js/React with TypeScript and Tailwind, MediaPipe Pose Landmarker (in-browser WebAssembly), PostgreSQL, a deterministic JSON rules engine, Web Crypto API (SHA-256), and a multimodal LLM API only for text and image tasks such as summaries and recommendations from a fixed library.

**Project information (o'zbek tilida):**

- *Loyiha nomi:* ShifoHalqa
- *Qisqa tavsif:* ShifoHalqa shifokorning uy sharoiti rejasini (mashq, qadam, oddiy o'lchovlar) telefon brauzerida bajariladigan kunlik vazifalarga aylantiradi. Brauzerdagi poza tahlili o'tirib-turish takrorlarini sanaydi va standart holatda video hech qayerga yuborilmaydi; har natijada dalil darajasi va ishonch bahosi bor; qoidalar shifokorga faqat e'tibor talab qiladigan bemorlarni ko'rsatadi.
- *Muammo bayoni:* Poliklinika qabulidan keyin Farg'onadagi bemor, masalan tizza operatsiyasidan keyin tiklanayotgan yoki surunkali kasallikni uyda nazorat qilayotgan keksa odam, haftalar davomida reja bo'yicha yashaydi. Shifokor keyingi qabulgacha reja bajarilayotganini ko'rmaydi, shuning uchun og'riq yoki rejadan chetga chiqish kech xabar qilinishi mumkin. \[Bu yerga faqat haqiqiy suhbat yoki ochib ko'rgan manbalaringizdan olgan narsani yozing.\] DMED kabi milliy xizmatlar qabul, yozuv va retseptni qamrab oladi, lekin kunlik reja ijrosini ko'rsatmaydi deb taxmin qilamiz va buni tekshiryapmiz.
- *Taklif etilayotgan yechim:* Uch rolli veb-ilova (shifokor, bemor, individual). Shifokor shablondan reja beradi va chegaralarni belgilaydi. Bemor vazifalarni bajaradi; brauzerdagi poza modeli o'tirib-turish takrorlarini (30 soniyalik stul testi bilan birga) sanaydi va ishonchni yozadi. Qoidalar og'riq, chegaradan tashqari ko'rsatkich, o'tkazib yuborilgan kun va past ishonchni bayroq bilan belgilaydi. Bemor aniq roziligi bilan qisqa klip shifokor navbatiga yuboriladi. AI tashxis qo'ymaydi va davolashni o'zgartirmaydi.
- *Rejalashtirilgan texnologiyalar:* Next.js/React, TypeScript, Tailwind, MediaPipe Pose Landmarker (brauzerda), PostgreSQL, JSON qoidalar dvigateli, Web Crypto API (SHA-256) va multimodal LLM API (faqat matn va rasm vazifalari uchun).

## 11. Halollik jadvali va AI-use note

| Qism | Holat |
| --- | --- |
| Bemorlar va tarixiy ma'lumotlar | Sintetik |
| Poza modeli | Tayyor (MediaPipe), biz o'qitmaganmiz |
| Takror sanash va chuqurlik | Haqiqiy (jonli kamera yoki yuklangan klip) |
| Qadam va qon bosimi | Qo'lda kiritiladi, sensor yo'q |
| Qoidalar va shifokor halqasi | Haqiqiy |
| Eslatma yuborish, DMED | Yo'q (roadmap) |

Buni qurganingizga qarab to'g'rilang. **AI-use note** shablon: (1) kod yozishda ishlatilgan AI vositalari va nima uchun; (2) mahsulot ichidagi AI: poza modeli o'lchaydi, LLM faqat matn yoki rasm vazifalarida, tibbiy qaror yoki takror sanashda ishlatilmaydi; (3) har a'zo MVP'ni tushuntira oladi.

## 12. Aniqlik sinovi (haqiqiy dalil)

O'z yozuvlaringizdan (jamoa va rozi bo'lgan do'stlar, turli yorug'lik va burchak) foydalaning. Qo'lda sanang, ilova bilan solishtiring va natijani xatolari bilan halol yozing. Bu klinik tasdiq emas, muhandislik sinovi. Tashqi datasetlar (masalan RepCount, UI-PRMD) faqat shaxsiy baholash uchun va litsenziyasini tekshirgandan keyin; ularni demoda ko'rsatmang.

## 13. AI bilan kodlash tartibi

- Repoda `README.md`, `PLAN.md` (shu hujjat) va `AGENTS.md` bo'lsin. `AGENTS.md` ga qoidalar: sxemaga qat'iy amal qilish, qoidalar kodda, AI tibbiy qaror qilmaydi, har modulga test.
- **Qotiring:** ma'lumotlar sxemasi, API shartnomasi, qoidalar va mashq sozlamasi formati, holat mashinasi, xavfsizlik va rozilik qoidalari, simulyatsiya jadvali.
- **AI'ga qoldiring:** UI tafsilotlari, komponentlar tuzilmasi, uslub, kod yozilishi.
- Kichik vazifalarga bo'ling; har vazifadan keyin ishga tushirib sinang; tez-tez commit qiling (mazmunli xabarlar bilan).
- Har modul uchun 5-6 qatorli izoh yozing: nima qiladi va nega. Brief har a'zodan MVP'ni tushuntirishni talab qiladi.
