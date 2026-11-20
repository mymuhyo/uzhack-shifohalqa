# UzHack 2026 — Task 1: Video Ssenariysi, Platforma Matnlari va Topshirish Rejasi

> Ushbu fayl asl master plandagi Task 1 qismlaridan ajratilgan. Yangi muddat: **18-noyabr 2026, 23:59 MYT (20:59 UZT)**.

## 4-QISM: TASK 1 UCHUN TAYYOR PLATFORMA MATNLARI (18-NOYABR, 23:59 MYT GACHA)

*Eslatma: UzHack qoidasiga ko‘ra (2.3.3-band), 18-noyabr $23:59$ MYT gacha Platforma dashboardidagi **Project** bo‘limi to‘ldirilishi shart, aks holda jamoa baholanmaydi! Quyidagi matnlarni to‘g‘ridan-to‘g‘ri nusxalab qo‘yishingiz mumkin.*

### Variant A: Ingliz tilida (Xalqaro va Malayziya hakamlari uchun tavsiya etiladi)

* **Project Name:** ShifoHalqa — Smart Home Care & Rehab Verification Loop
* **Short Description (1–2 sentences):** ShifoHalqa turns a doctor’s post-visit plan (medication, physical rehab exercises, blood pressure, and activity targets) into verifiable daily tasks in a mobile web browser. Using on-device pose estimation, vision-based medication/vitals reading, and clinical rules, it filters daily logs so doctors in Fergana only review patients who need immediate attention.
* **Problem Statement:** In Fergana and across Uzbekistan, patients recovering after joint/orthopedic surgery or managing chronic hypertension spend about 10–15 minutes in a doctor’s office, followed by weeks of unsupervised treatment at home. During this gap, three critical failures happen: (1) patients confuse medication dosages when buying new boxes, (2) home rehabilitation exercises (such as sit-to-stand) are skipped or performed without guidance, and (3) warning signs like rising blood pressure or pain go unreported until the next visit or an emergency call. Meanwhile, polyclinic doctors do not have time to call dozens of patients daily, and citizens residing abroad (such as children in Malaysia) cannot easily monitor their aging parents' daily adherence.
* **Proposed Solution:** ShifoHalqa closes the gap between clinic visits with a unified "Verification Ladder" web application (supporting Doctor, Patient, and Individual self-care modes):
  1. **Structured Care & Self-Care Plans:** Doctors assign templates in under a minute (or individual users set personal health/step goals with safety-filtered AI suggestions).
  2. **Medication Tracking & "DoriMos" Vision Check:** Patients log daily doses and can photograph their medication box label; Vision AI extracts the drug name and strength for patient confirmation, and code rules flag any mismatch against the doctor’s prescription.
  3. **Privacy-First Camera Exercise Engine:** Using in-browser MediaPipe Pose, the app tracks sit-to-stand rehab exercises and the CDC 30-second Chair Stand test (via live camera or recorded video upload), measuring joint angles, rep counts, and confidence scores without sending raw video to the server by default. Anti-replay safeguards include daily countable limits, SHA-256 file hashing, and joint-angle motion signatures.
  4. **Exception-Based Doctor & Family Loop:** Deterministic rules flag high blood pressure, medication mismatches, pain reports, or low-confidence exercise logs. With explicit patient consent, short clips are routed to the doctor’s review queue, while a read-only Caregiver Link lets family members check daily progress remotely.
* **Planned Technologies:** Frontend: Next.js / React, Tailwind CSS, MediaPipe Pose Landmarker (in-browser WebAssembly/WebGL), Web Crypto API (SHA-256). Backend: Python (FastAPI) or Node.js, PostgreSQL / SQLite, Deterministic JSON Rules Engine. AI Layer: Multimodal Vision/LLM API (Gemini / OpenAI) strictly for OCR extraction (medication boxes, blood pressure monitors) and concise doctor summaries.

---

### Variant B: O‘zbek tilida

* **Loyiha nomi:** ShifoHalqa — Uyda davolanish va reabilitatsiyani aqlli nazorat qilish tizimi
* **Qisqa tavsif:** ShifoHalqa shifokor yozgan uy davolanish rejasini (dori-darmon, reabilitatsiya mashqlari, qon bosimi va qadamlar) oddiy telefon brauzerida bajariladigan vazifalarga aylantiradi. Qurilmaning o‘zida ishlovchi poza tahlili (CV), dori qutisi hamda tonometrni o‘quvchi Vision AI va qoidalar dvigateli yordamida shifokorga faqat muammoli bemorlarni saralab ko‘rsatadi.
* **Muammo bayoni:** Farg‘ona va O‘zbekistonning boshqa hududlarida bo‘g‘im operatsiyasidan chiqqan yoki gipertoniya bilan og‘rigan bemorlar shifokor qabulida 10–15 daqiqa bo‘лади, ammo uyda haftalab nazoratsiz davolanadi. Bu davrda uchta asosiy muammo yuzaga keladi: (1) bemorlar dorixonadan olingan dori dozasini ($5\text{ mg}$ va $10\text{ mg}$) adashtiradi, (2) uyda buyurilgan jismoniy mashqlar (masalan, o‘tirib-turish) og‘riqdan qo‘rqib bajarilmaydi yoki noto‘g‘ri qilinadi, (3) qon bosimi oshishi yoki simptomlar vaqtida shifokorga yetib bormaydi. Poliklinika shifokorlarida esa har kuni o‘nlab bemorlarga qo‘ng‘iroq qilish imkoni yo‘q, uzoqdagi (masalan, Malayziyadagi) farzandlar esa ota-onasining kundalik holatini bila olmaydi.
* **Taklif etilayotgan yechim:** ShifoHalqa "Dalil narvoni" (Verification Ladder) asosida shifokor, bemor va mustaqil foydalanuvchilarni bog‘laydi:
  1. **Reja va Individual rejim:** Shifokor 1 daqiqada shablon asosida vazifa beradi, shifokorsiz foydalanuvchilar esa xavfsizlik filtridan o‘tib, o‘zlari uchun qadam va mashq rejalarini tuzadi.
  2. **Dori nazorati va "DoriMos" tekshiruvi:** Bemor dorini qayd etadi va dori qutisini suratga oladi; AI yozuvni o‘qib, shifokor yozgan doza bilan solishtiradi va xatolik bo‘lsa ogohlantiradi.
  3. **Maxfiylikka asoslangan Kamera Mashq Motori:** Brauzerda MediaPipe Pose orqali o‘tirib-turish mashqlari va 30 soniyalik stul testi (jonli kamera yoki video yuklash orqali) tahlil qilinadi, tizza burchagi va ishonch bali hisoblanadi. Takroriy video yuklashning oldini olish uchun kunlik limit, SHA-256 xesh va harakat imzosi qo‘llaniladi.
  4. **Shifokor va Oila halqasi:** Qoidalar dvigateli faqat me’yordan chetga chiqqan holatlarni shifokor navbatiga chiqaradi, "Yaqinim" havolasi esa farzandlarga ota-onasi holatini masofadan ko‘rish imkonini beradi.
* **Rejalashtirilgan texnologiyalar:** Next.js / React, Tailwind CSS, MediaPipe Pose Landmarker (WebAssembly), FastAPI / Node.js, PostgreSQL / SQLite, JSON Rules Engine, Multimodal Vision/LLM API (dori qutisi va tonometr OCR hamda shifokor xulosasi uchun).

---

## 5-QISM: 3 TA UZOQDAGI ODAM BILAN VIDEONI ENG SIFATLI OLISH USULLARI

Task 1 qoidasiga ko‘ra (2.1.1 va 2.2.2-bandlar):
* Videoda **har bir jamoa a’zosi yuzi bilan ko‘rinishi va o‘z rolini aytishi shart**.
* Video davomiyligi **$3\text{ daqiqadan } 5\text{ daqiqagacha}$** ($5:00$ dan 1 soniya ham oshmasin!).
* Slaydlar yoki ekran yozuvlari (screen recording) ishlatilishi mumkin.

Uzoqda turgan 3 kishi videoni yozishi uchun **3 ta eng yaxshi amaliy usul** (eng sifatlisidan eng teziga qarab):

### 1-Usul (ENG TAVSIYA ETILGAN): Discord’da sinxronlash + Har kim o‘z telefonida/kompyuterida yozib, CapCut’da birlashtirish
Discord yoki Zoom orqali ekranni yozib olsangiz, internet o‘ynaganda yuzlar xiralashib (360p bo‘lib) yoki ovoz uzilib qolishi mumkin. Eng toza va professional usul quyidagicha:
1. **Slaydlarni tayyorlang:** Canva yoki Google Slides’da $6\text{–}7\text{ ta}$ slayd tayyorlang.
2. **Discord’ga kiring:** Uchovlon Discord ovozli kanaliga kiring, shunda bir-biringizni eshitib, nutqni ketma-ketlikda (xuddi bitta xonada o‘tirgandek) davom ettira olasiz.
3. **Alohida yozib oling:**
    * **1-ishtirokchi** gapirayotganda o‘z telefonini gorizontal (yoki burchakda) qo‘yib, o‘zini 1080p sifatda yozib oladi (atigi 1 daqiqa).
    * **2-ishtirokchi** va **3-ishtirokchi** ham o‘z qismini xuddi shunday yozib, faylni Telegram/Google Drive orqali montaj qiladigan a’zoga tashlaydi.
4. **CapCut (yoki Premiere) da yig‘ish (20 daqiqa oladi):**
    * Orqa fonga Canva slaydlari (yoki dastlabki UI ekranlari) qo‘yiladi.
    * Ekranning o‘ng pastki burchagiga (Picture-in-Picture / aylana yoki to‘rtburchak ramkada) kim gapirayotgan bo‘lsa, o‘sha a’zoning yuzi chiqariladi. Boshidagi $25\text{ soniyada}$ esa uchala a’zoning videosi yonma-yon (split-screen) qo‘yiladi!
* **Afzalligi:** Internet qotishi umuman ta’sir qilmaydi, kimdir adashib ketsa faqat o‘zining 1 daqiqalik qismini qayta yozadi, butun jamoa boshidan yozishga majbur bo‘lmaydi!

### 2-Usul (ENG TEZ — BITTA URINISHDA): OBS Studio + Discord (yoki VDO.Ninja)
Agar montajga vaqt sarflamasdan bitta urinishda (one-take) yozmoqchi bo‘lsangiz:
1. Kompyuteri va interneti eng kuchli a’zo **OBS Studio** dasturini ochadi ("Rejissyor").
2. Uchala a’zo **Discord** video-qo‘ng‘irog‘iga (yoki sifatni tushirmaydigan bepul `vdo.ninja` saytiga) kirib, kameralarini yoqadi.
3. Rejissyor OBS’da $1920 \times 1080$ sahna (Scene) tuzadi:
    * **Chap tomonda ($75\%$ maydon):** `Window Capture` orqali slaydlar va dastlabki prototip/sxema oynasi.
    * **O‘ng tomonda ($25\%$ maydon):** Ustma-ust 3 ta kichik oyna — Discord’dagi 3 ta a’zoning kamerasi (`Alt` tugmasini bosib chetlarini qirqib — crop qilib — chiroyli joylashtiriladi).
4. **Audio sozlamasi (Juda muhim!):** OBS’da ham `Desktop Audio` (sheriklarning ovozi), ham `Mic/Aux` (Rejissyorning o‘z mikrofoni) yoqilgan bo‘lishi kerak. Boshlashdan oldin $10\text{ soniya}$ yozib ko‘rib, hamma a’zoning ovozi bir xil balandlikda chiqayotganini tekshiring!

### 3-Usul (ENG ODDIY ZAXIRA): Zoom / Google Meet
1. Zoom’da uchrashuv oching, uchala a’zo kamerasini yoqsin.
2. Bitta a’zo slaydlarni `Share Screen` qiladi.
3. Zoom’da ko‘rinishni `Side-by-side: Gallery` rejimiga o‘tkazing, shunda slayd yonida uchala a’zoning yuzi bir vaqtda ko‘rinib turadi.
4. `Record to this Computer` tugmasini bosib, $4\text{ daqiqada}$ gapirib chiqing.

---

## 6-QISM: TASK 1 VIDEO SSENARIYSI (3 A’ZO UCHUN TAQSIMLANGAN, ~4 DAQIQA 15 SONIYA)

> **Yangilanish (17-noyabr):** Yakuniy matn — **`video_script_4m25.md`** (cue sheet bilan 1:1). Bu bo‘lim esa tarixiy variant.

Bu ssenariy Task 1 baholash mezonlarining har bir punktini ($30 + 20 + 30 + 20 = 100\text{ ball}$) aniq nishonga oladi.

### 1-Qism: Jamoa tanishtiruvi ($0:00\text{ – }0:30$) — *Talab: hamma ko‘rinishi va rolini aytishi shart*
* **[Ekranda: Jamoa nomi, UzHack Smart Healthcare treki va 3 ta a’zoning kamerasi]**
* **1-A’zo:** "Assalomu alaykum! Biz [Jamoa nomi] jamoasimiz va UzHack 2026 Smart Healthcare yo‘nalishida **ShifoHalqa** loyihasini taqdim etamiz. Mening ismim [Ism], jamoada mahsulot arxitekturasi, qoidalar dvigateli va shifokor paneli uchun mas’ulman."
* **2-A’zo:** "Salom, mening ismim [Ism]. Men backend, ma’lumotlar bazasi hamda dori qutilari va tibbiy o‘lchovlarni o‘quvchi AI Vision integratsiyasi ustida ishlayman."
* **3-A’zo:** "Assalomu alaykum, mening ismim [Ism]. Men frontend, mobil veb-interfeys va brauzerda ishlovchi kompyuter ko‘rishi (MediaPipe Pose) mashq motori uchun javobgarman."

---

### 2-Qism: Aniq Muammo va Farg‘ona Konteksti ($0:30\text{ – }1:45$) — *1-A’zo gapiradi (Mezon: Problem clarity 30 + People affected 20)*
* **[Slayd 2: Farg‘onalik 60 yoshli Anvar aka obrazi — "Qabul 15 daqiqa, uyda davolanish haftalab"]**
* **1-A’zo:**
  "Tasavvur qiling: Farg‘ona viloyatida yashovchi 60 yoshli Anvar aka tizza bo‘g‘imi muammosi va yuqori qon bosimi bilan poliklinikaga bordi. Shifokor qabuli 15 daqiqa davom etdi — unga har kuni ichiladigan qon bosimi dorisi, uyda bajariladigan o‘tirib-turish reabilitatsiya mashqlari va kunlik yurish rejasi yozib berildi.
  Lekin Anvar aka uyga qaytgach, keyingi haftalarda nima bo‘ladi? Shifokor uchun bu davr — 'ko‘rinmas hudud'.
  Jahon sog‘liqni saqlash tashkiloti (WHO) ma’lumotlariga ko‘ra, surunkali kasalliklarda bemorlarning taxminan yarmi uzoq muddatli davolanish ko‘rsatmalariga to‘liq amal qilmaydi. Uy sharoitida uchta aniq muammo yuz beradi:
  Birinchidan, Anvar aka dorixonadan yangi dori olganda quti nomi bir xil bo‘lsa ham, uning dozasini — masalan, $5\text{ mg}$ o‘rniga $10\text{ mg}$ ni — adashtirib qo‘yishi mumkin.
  Ikkinchidan, uyda fizioterapevt yo‘qligi sababli tizza mashqlarini qo‘rqib bajarmaydi yoki chala bajaradi.
  Uchinchidan, qon bosimi 3 kun ketma-ket ko‘tarilsa ham, navbatdagi qabulni kutib yuraveradi. Poliklinika shifokorida esa har kuni o‘nlab bemorlarga qo‘ng‘iroq qilib chiqishga vaqt yo‘q, Malayziyada o‘qiyotgan farzandi esa otasining kundalik holatini aniq bila olmaydi."

---

### 3-Qism: Bugungi muqobillar va Nima yetishmayapti ($1:45\text{ – }2:15$) — *2-A’zo gapiradi*
* **[Slayd 3: Oddiy eslatma ilovalari vs Haqiqiy ikki tomonlama nazorat]**
* **2-A’zo:**
  "Bugun odamlar bu muammoni qanday hal qilyapti? Qog‘oz retseptlar yo‘qolib qoladi, Telegram’dagi yozishmalar tartibsiz bo‘lib ketadi, oddiy budilnik va eslatma ilovalari esa faqat bir tomonlama signal beradi.
  O‘zbekistonning DMED tizimi qabulga yozilish va elektron retsept kabi muhim bazani yaratgan, biroq bemor uyga ketgandan keyin dori to‘g‘ri tanlanganini, mashq qanday bajarilganini dalil darajasi bilan yig‘ib, shifokorga faqat muammoli bemorlarni saralab beruvchi qatlam hali mavjud emas."

---

### 4-Qism: Bizning Yechim — ShifoHalqa va Dalil Narvoni ($2:15\text{ – }3:30$) — *2-A’zo va 3-A’zo gapiradi (Mezon: Solution 30)*
* **[Slayd 4: ShifoHalqa sxemasi — 3 ta rol va Dalil Narvoni (0 dan 4-darajagacha)]**
* **2-A’zo:**
  "Bizning yechimimiz — **ShifoHalqa**. Bu hech qanday ilova o‘rnatishni talab qilmaydigan, oddiy telefon brauzerida ishlovchi tizim bo‘lib, uchta rolni qamrab oladi: Shifokor, Bemor va shifokorsiz o‘z sog‘lig‘ini kuzatuvchi Mustaqil foydalanuvchi.
  ShifoHalqa 'Dalil narvoni' tamoyili asosida to‘rt xil vazifani boshqaradi:
  Birinchisi — **Dori-darmon va DoriMos moduli**. Bemor har kuni dorini ichganini belgilaydi, shuningdek qo‘lidagi dori qutisini suratga oladi. AI Vision qutidagi dori nomi va dozasini o‘qiydi, bemor uni tasdiqlaydi va tizim qoidalari uni shifokor yozgan doza bilan solishtiradi. Agar farq bo‘lsa, darhol ogohlantiradi va shifokorga signal yuboradi. Xuddi shu usulda tonometr ekranidagi qon bosimi va qadamlar ham qayd etiladi."

* **[Slayd 5: Kamera orqali O‘tirib-turish tahlili va Shifokor Halqasi]**
* **3-A’zo:**
  "Ikkinchi asosiy modulimiz — **Brauzerda ishlovchi Kamera Mashq Motori**. Fitnes ilovalardan farqli o‘laroq, bizning maqsadimiz shunchaki sanash emas, balki mashqni shifokor halqasiga bog‘lashdir.
  MediaPipe Pose yordamida tizim tizza burchaklarini real vaqtda o‘lchab, ikki xil rejimda ishlaydi: shifokor belgilagan individual burchak bo‘yicha reabilitatsiya o‘tirib-turish mashqi hamda xalqaro CDC standartidagi 30 soniyalik stul testi.
  Maxfiylikni ta’minlash uchun video qurilmadan tashqariga chiqmaydi — serverga faqat takrorlar soni, minimal burchak va ishonch bali JSON shaklida boradi. Agar foydalanuvchi yozib olingan videoni yuklasa, aldovning oldini olish uchun kunlik limit, faylning SHA-256 xeshi va 20 nuqtali harakat imzosi tekshiriladi.
  Agar tahlil ishonchi past bo‘lsa yoki bemor 'Og‘riq bor' tugmasini bossa, bemor roziligi bilan qisqa klip shifokor ko‘rib chiqish navbatiga yuboriladi. Muhim xavfsizlik qoidamiz: AI hech qachon tashxis qo‘ymaydi va dori dozasini o‘zgartirmaydi — barcha klinik chegaralarni shifokor belgilaydi."

---

### 5-Qism: Task 2 MVPda nima ishlaydi va Yakun ($3:30\text{ – }4:15$) — *3-A’zo gapiradi (Mezon: Clarity 20)*
* **[Slayd 6: Task 2 MVP Ish Oqimi (Workflow) va O‘zbekiston-Malayziya ko‘prigi]**
* **3-A’zo:**
  "Task 2 doirasida qurayotgan MVPmizda hakamlar brauzer orqali kirib, to‘liq ish oqimini boshidan oxirigacha sinab ko‘rishlari mumkin bo‘ladi:
  1. Shifokor demo akkauntidan kirib, bemorga dori, qon bosimi, qadam va o‘tirib-turish mashqidan iborat rejani yuborish;
  2. Bemor yoki mustaqil foydalanuvchi sifatida dori qutisi rasmini tekshirish, hamda jonli kamera yoki sinov videosi orqali o‘tirib-turish mashqini bajarib, bo‘g‘im burchaklari va ishonch balini olish;
  3. Shifokor panelida faqat me’yordan chetga chiqqan yoki ko‘rib chiqish talab qilingan bemorlarni ko‘rish va tasdiqlash; hamda 'Yaqinim' havolasi orqali uzoqdagi farzand sifatida ota-ona ko‘rsatkichlarini kuzatish.
  MVPda bemor profillari sintetik ma’lumotlardan iborat bo‘ladi, poza tahlili, dori qutisi OCR tekshiruvi va qoidalar dvigateli esa real ishlaydi.
  ShifoHalqa bilan biz shifokor qabullari orasidagi ko‘rinmas kunlarni xavfsiz, o‘lchanadigan va nazoratli jarayonga aylantiramiz. E’tiboringiz uchun rahmat!"

---

## 7-QISM: HOZIROQ QILINADIGAN QADAMLAR RO‘YXATI (CHECKLIST)

1. [ ] **Platforma Dashboardi:** Yuqoridagi 4-qismdagi matnlarni hoziroq UzHack platformasidagi `Project` bo‘limiga nusxalab saqlab qo‘ying (ertaga oxirgi daqiqaga qolmasin).
2. [ ] **6 ta Slayd:** 6-qismdagi ssenariy bo‘yicha Canva’da 6 ta sodda slayd qiling (ko‘p matn yozmang, katta sxemalar va Anvar aka misoli bo‘lsin).
3. [ ] **Videoni yozish:** 3 a’zo o‘z qismini ($1\text{–}1.5\text{ daqiqadan}$) yozib, bitta videoga birlashtiring. Davomiyligi $5:00$ dan oshmaganini tekshiring!
4. [ ] **Yuklash va Tekshirish:** Videoni YouTube’ga `Unlisted` (yoki Google Drive’ga `Anyone with the link can view`) qilib yuklang va **Incognito (Maxfiy) oynada** ochib ko‘ring.
5. [ ] **MVP 1-Qatlamni boshlash:** GitHub repozitoriyasini oching, birinchi commitni qiling va 1-qatlam (login, vazifalar bazasi va shifokor-bemor UI) ustida ishlashni davom ettiring.