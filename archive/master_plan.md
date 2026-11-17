# UzHack 2026: "ShifoHalqa" (Smart Care Loop) — Master Plan (Gʻoya va Arxitektura)

**Qatʻiy muddatlar (tashkilotchi eʻlon qilgan yangi sanalar, MYT):**
- Task 1 (Video + Project information): **18-noyabr 2026, 23:59 MYT** (Oʻzbekiston vaqti bilan 20:59)
- Task 2 (MVP): **22-noyabr 2026, 23:59 MYT** (Oʻzbekiston vaqti bilan 20:59)

> Eslatma: papkadagi `brief/uzhack-online-stage-tasks-en.pdf` (Brief v1.0) eski sanalarni koʻrsatadi (12/15-noyabr). Tashkilotchining uzaytirish eʻloni asosida ishlaymiz. Qatʻiy sanalar rasmiy kanallardan (uzhack.uz) yana tekshirilishi shart.

## 1-QISM: LOYIHA YADROSI VA ARXITEKTURASI (MASTER PLAN)

### 1.1. Loyiha Konsepsiyasi va Bir Jumlali Pitch
* **Loyiha nomi (variantlar):** **ShifoHalqa** (yoki *ShifoReja* / *DavoNazorat*).
* **Bir jumlali pitch:** Shifokor tayinlagan uy davolanish rejasini (dori-darmon, reabilitatsiya mashqlari, qon bosimi va qadamlar) bemor telefonida bajariladigan kundalik vazifalarga aylantiruvchi, AI va kompyuter ko‘rishi (CV) yordamida dalil hamda ishonch darajasini hisoblab, shifokorga faqat e’tibor talab qiladigan bemorlarni ko‘rsatuvchi veb-platforma.
* **Asosiy muammo ("Ko‘rinmas davr"):** Farg‘onada surunkali kasalligi (gipertoniya) bor yoki tizza/bo‘g‘im operatsiyasidan chiqqan bemor shifokor qabulida qisqa vaqt bo‘ladi, ammo asosiy davolanish uyda haftalab davom etadi. Uyga qaytgach, bemor dorini adashtirishi, mashqni og‘riqdan qo‘rqib bajarmasligi yoki bosimi ko‘tarilganini vaqtida aytmasligi mumkin. Shifokorda esa o‘nlab bemorlarni har kuni birma-bir qo‘ng‘iroq qilib tekshirishga vaqt yo‘q.

### 1.2. Uch Xil Foydalanuvchi Roli
Tizim faqat shifokor-bemor juftligi bilan cheklanib qolmaydi, balki har qanday foydalanuvchi uchun ochiq bo‘ladi:
1. **Shifokor (`role = doctor`):** Tayyor klinik shablonlar asosida bemorga $7\text{–}14$ kunlik reja biriktiradi, individual chegaralarni (masalan, qon bosimi me’yori yoki tizza bukilish burchagi) belgilaydi va "Istisnolar paneli"da (Exception Dashboard) faqat sariq/qizil bayroqli bemorlarni ko‘rib chiqadi.
2. **Bemor (`role = patient`, `created_by = doctor`, `shared = true`):** Shifokor yozgan rejani sodda o‘zbek yoki rus tilida qabul qiladi, vazifalarni bajaradi va natijalarni avtomatik ravishda shifokor paneliga uzatadi.
3. **Mustaqil foydalanuvchi (`role = individual`, `created_by = self`, `shared = false`):** Shifokorsiz kirgan foydalanuvchi. U o‘zi uchun sog‘lomlashtirish maqsadida (kunlik/haftalik/oylik qadam, o‘tirib-turish mashqlari, vitamin yoki dori eslatmalari) vazifalar qo‘shadi yoki xavfsizlik savollaridan o‘tib, AI tavsiya qilgan boshlang‘ich mashqlar to‘plamidan foydalanadi. Xohlasa, keyinchalik natijalarini shifokorga ulashishi (`shared = true`) mumkin.

---

### 1.3. Yagona Vazifalar Mexanizmi va 4 ta Ustun (4 Pillars)
Barcha vazifalar bazada bitta universal tuzilmada saqlanadi: `Vazifa = Tur + Ko‘rsatkich + Maqsad + Davr (kun/hafta/oy) + Tekshiruv usuli + Parametrlar (JSON)`.

#### 1-Ustun: Dori-darmonlarni Kuzatish va "DoriMos" Tekshiruvi (Medication Tracking)
* **Strukturali reja:** Dori nomi, dozasi (masalan, $5\text{ mg}$), shakli (tabletka) va qabul vaqti (ertalab/kechqurun).
* **Kunlik qayd (0-daraja):** Bemor katta va tushunarli tugmalar orqali `[Ichdim]`, `[Icha olmadim (sababi)]` yoki `[Unutdim]` deb belgilaydi.
* **Dori qutisini rasm orqali tekshirish — DoriMos (2-daraja):** Bemor yangi dori olganda yoki dori ichishdan oldin qo‘lidagi dori qutisining bosma yorlig‘ini suratga oladi.
    * **Vision/OCR tahlili:** AI model qutidagi dori nomi va dozasini o‘qiydi (masalan, `Amlodipin 10 mg`).
    * **Tasdiq va Solishtirish:** Bemor ekranda o‘qilgan yozuvni tasdiqlaydi. Kod qoidalari uni shifokor yozgan reja (`Amlodipin 5 mg`) bilan solishtiradi.
    * **Xavfsizlik:** Agar doza yoki nom mos kelmasa, tizim darhol ogohlantirish chiqaradi: *"Diqqat! Rejada $5\text{ mg}$ yozilgan, qutida $10\text{ mg}$ ko‘rinmoqda. Qabul qilishdan oldin shifokor bilan bog‘laning"* va shifokor paneliga qizil bayroq yuboradi.
* **Halol tamoyil:** Ilova dori yutilganini isbotlay olmaydi; bazada holatlar aniq qilib `"bemor tasdiqladi"` va `"quti yorlig‘i rejaga mos"` deb yoziladi.

#### 2-Ustun: Kamera va Poza Tahliliga Asoslangan Mashq Motori (Exercise Engine)
* **Texnologiya:** Brauzerning o‘zida ishlovchi **MediaPipe Pose Landmarker**. Video qurilmadan tashqariga chiqmaydi.
* **Sozlamaga asoslangan motor (JSON Config):** Mashqlar kod ichida qotib qolmaydi, balki JSON orqali boshqariladi (yelka, son, tizza va to‘piq nuqtalari orasidagi burchaklar).
* **Bitta motorda 2 xil Preset:**
    1. **Reabilitatsiya o‘tirib-turish (Rehab Squat):** Shifokor belgilagan tizza burchagi (masalan, turganda $\ge 160^\circ$, o‘tirganda $\le 100^\circ$) yoki bemorning 1-urinishdagi shaxsiy boshlang‘ich ko‘rsatkichi (baseline) asosida takrorlar soni va harakat chuqurligi o‘lchanadi.
    2. **30 soniyalik Stul Testi (CDC STEADI Chair Stand):** Keksalarda oyoq kuchi va muvozanatni baholash standarti asosida — qo‘llar ko‘krakda kesishgan holda $30\text{ s}$ ichida stuldan to‘liq turishlar soni sanaladi.
* **Holat mashinasi (State Machine):** Soxta sanash va titrashning oldini olish uchun ikki chegara (gisterezis) ishlatiladi: $\text{TURIBDI} \rightarrow \text{O‘TIRDI} \rightarrow \text{TURDI} = +1\text{ takror}$.
* **Kadr sifati nazorati:** Tana to‘liq ko‘rinmasa yoki yorug‘lik past bo‘lsa, sanash to‘xtatiladi va ekranda *"Iltimos, $2\text{ qadam}$ orqaga yuring"* yozuvi chiqadi.

#### 3-Ustun: Tibbiy O‘lchovlar — Bosim va Puls (Vitals Tracking)
* **Qo‘lda yoki Foto-OCR orqali:** Bemor tonometr (qon bosimi apparati) ekranini suratga oladi, Vision modeli sistolik/diastolik bosim va pulsni o‘qiydi (masalan, $155/95\text{ mmHg}$), bemor tasdiqlaydi.
* **Qoidalar dvigateli:** Shifokor har bir bemor uchun o‘z chegarasini qo‘yadi (masalan, sistolik $\ge 150\text{ mmHg}$ bo‘lsa sariq bayroq, $\ge 160\text{ mmHg}$ yoki bosh og‘rig‘i belgilanishi bilan qizil bayroq).

#### 4-Ustun: Kunlik, Haftalik va Oylik Qadamlar (Step & Activity Tracking)
* **Realistik veb yondashuv:** Oddiy brauzerda fon pedometri ishonchsiz ishlagani sababli, foydalanuvchi kunlik qadamini qo‘lda kiritadi yoki telefonidagi qadam ilovasi (Google Fit / Apple Health) skrinshotini yuklaydi (AI o‘qiydi + bemor tasdiqlaydi).
* **Agregatsiya:** SQL orqali kunlik, haftalik va oylik maqsad bajarilishi foizlarda hisoblanadi.

---

### 1.4. Dalil Narvoni (Verification Ladder) va Aldovga Qarshi Himoya (Anti-Cheat)

#### Dalil Narvoni (Har bir log yozuvida saqlanadi):
* **0-daraja:** O‘z hisoboti (tugma bosildi yoki qo‘lda raqam kiritildi).
* **1-daraja:** Vaqt va davomiylik taymeri (mashq oynasi qancha vaqt ochiq turdi).
* **2-daraja:** Foto/Skrinshot + AI Vision o‘qishi + Foydalanuvchi tasdig‘i (Dori qutisi, tonometr, qadam skrinshoti).
* **3-daraja:** Brauzerda real vaqtda (yoki yuklangan videoda) MediaPipe Pose tahlili + ishonch bali ($\text{confidence} \in [0, 1]$).
* **4-daraja:** Shifokor tomonidan qisqa video-klip yoki suratning ko‘rib chiqilishi va tasdiqlanishi.

#### Kamera va Video Yuklashda Aldovga Qarshi 5 Qatlamli Himoya:
1. **Ikki xil rejim (Jonli kamera + Yozilgan videoni yuklash):** Hakamlar oson tekshirishi va internet past joylarda ishlashi uchun video yuklash rejimi bor, ammo uning manbasi bazada `"uploaded_file"` sifatida jonli kameradan (`"live_camera"`) farqlab yoziladi.
2. **Davr bo‘yicha 1 ta hisobga olinadigan natija:** Kunlik vazifa uchun kuniga faqat 1 marta asosiy progress yoziladi; qolgan urinishlar `"qo‘shimcha mashq"` sifatida saqlanadi.
3. **SHA-256 Fayl Xeshi:** Brauzerda yuklangan videoning SHA-256 xeshi hisoblanadi. Aynan bir xil video faylni ikkinchi marta yuklash darhol bloklanadi.
4. **Harakat Imzosi (Motion Signature):** Har bir takroriy mashqda tizza burchagining vaqt bo‘yicha o‘zgarishi $20\text{ ta}$ nuqtali vektor ko‘rinishida saqlanadi. Agar yangi urinishning egri chizig‘i oldingi kundagi urinish bilan deyarli $100\%$ ustma-ust tushsa, tizim uni `"takroriy video shubhasi"` deb belgilaydi va shifokor ko‘rigiga yuboradi.
5. **Ishonch past $\rightarrow$ Shifokor halqasi:** Agar kamera tahlilida $\text{confidence} < 0.75$ bo‘lsa yoki burchak me’yorga yetmasa, bemordan so‘raladi: *"Harakat to‘liq aniqlanmadi. Shifokor ko‘rib berishi uchun $10\text{ soniyalik}$ klipni yuboraylikmi?"* Rozilik berilsagina klip yuboriladi.

---

## 2-QISM: BRAINSTORMING — BALLNI OSHIRADIGAN QO‘SHIMCHA G‘OYALAR TAHLILI

Hakamlar loyihani $100\text{ ballik}$ tizimda baholaydi: **Innovatsiya ($25$), Texnik ijro ($25$), O‘zbekiston uchun amaliylik ($20$), Ta’sir ($20$), Taqdimot ($10$)**. Quyida loyihani "oddiy treker"dan "g‘olib tizim"ga aylantiradigan qo‘shimcha g‘oyalar tahlili keltirilgan. Ularni **MVPga tez qo‘shiladigan (1-2 soatlik)** va **Grand Final / Roadmap** guruhlariga ajratdim.

### A. MVP ga 1–2 Soatda Qo‘shsa Bo‘ladigan "Oltin" Funksiyalar (4-Qatlam)

#### 1. "Yaqinim" — Malayziyadagi Farzand / Oila A’zosi Havolasi (Caregiver Link)
* **G‘oya:** Farg‘onadagi keksa ota-ona ilovadan foydalanganda, tizim **1 ta maxfiy "Faqat o‘qish" (Read-only) havolasini** yaratib beradi. Malayziyada (yoki Toshkentda) o‘qiyotgan/ishlayotgan farzand shu havola orqali ota-onasining bugungi dorisini ichgani, qon bosimi necha chiqqani va mashqni bajarganini ko‘rib turadi.
* **Nega juda foydali:** UzHack aynan **Malayziyadagi o‘zbek yoshlari** uchun o‘tkazilmoqda! Hakamlarga: *"Biz Malayziyada turib Farg‘onadagi ota-onamizning salomatligidan xavotir olamiz, shu sababli farzandlar uchun masofaviy ko‘rish rejimini qo‘shdik"* desangiz, **Amaliylik ($20$)** va **Taqdimot ($10$)** mezonlaridan maksimal hissiy va amaliy ball olasiz.
* **Texnik qiyinligi:** Juda oson — bitta tokenli `GET /caregiver/:token` sahifasi.

#### 2. Shaxsiy "Baseline" (Boshlang‘ich Qulay Burchakni Kalibrlash)
* **G‘oya:** Hamma bemor ham tizzasini $90^\circ$ ga buka olmaydi. Mashqni birinchi marta boshlashdan oldin `"Mening qulay chegaramni o‘lchash"` tugmasi bo‘ladi. Bemor og‘riqsiz o‘tirib-turadi, tizim uning minimal burchagini (masalan, $118^\circ$) eslab qoladi va keyingi kunlarda uning harakat diapazoni necha gradusga yaxshilanganini ($118^\circ \rightarrow 112^\circ \rightarrow 105^\circ$) grafikda ko‘rsatadi.
* **Nega juda foydali:** "To‘g‘ri/noto‘g‘ri" degan tibbiy bahsdan qutqaradi va reabilitatsiyadagi haqiqiy progressni (Range of Motion improvement) ko‘rsatadi. **Innovatsiya ($25$)** balini oshiradi.

#### 3. Dori Qutisi Tugashini Oldindan Hisoblash (Smart Refill Counter)
* **G‘oya:** Dori tayinlanayotganda `"Qutida nechta tabletka bor?"` (masalan, $30\text{ ta}$) maydoni kiritiladi. Bemor har safar `"Ichdim"` tugmasini bosganda qoldiq $-1$ ga kamayadi. Qutida $5\text{ kunlik}$ dori qolganda bemor va uning farzandiga *"Amlodipin tugashiga $5\text{ kun}$ qoldi, yangi quti olishni unutmang"* degan ogohlantirish chiqadi.
* **Nega juda foydali:** Surunkali bemorlar ko‘pincha dori tugab qolgani uchun $3\text{–}4\text{ kun}$ dori ichmay qo‘yadi. Oddiy arifmetika, lekin real hayotda juda katta foyda beradi.

#### 4. Mini "Tushundimmi?" (Reja Qabul Qilinganda 1 ta Tekshiruv Savoli)
* **G‘oya:** Shifokor yangi reja yuborganda, bemor vazifalarni boshlashdan oldin 1 ta sodda test yoki matnli/ovozli savolga javob beradi: *"Ushbu rejaga ko‘ra dorini va mashqni qachon bajarasiz?"* AI buni tekshirib, bemor rejani to‘g‘ri tushunganini tasdiqlaydi.
* **Nega juda foydali:** Draft rejada muhokama qilingan *RejaQadam (teach-back)* g‘oyasini *ShifoHalqa* ichiga $10\%$ hajmda, lekin $100\%$ effekt bilan singdirib yuboradi!

#### 5. Ovozli Ko‘rsatma va Katta Shriftli "Keksa Rejimi" (Accessibility)
* **G‘oya:** Kamera oldida uzoqroqda turgan odam ekrandagi mayda yozuvni o‘qiy olmaydi. Brauzerning `Audio()` obyekti orqali oldindan yozilgan $4\text{ ta}$ qisqa o‘zbekcha ovozli fayl (`"Kadrga to'liq kiring"`, `"Boshladik"`, `"Yaxshi, davom eting"`, `"Mashq tugadi"`) ulanadi.

---

### B. Grand Final (Malayziyadagi Oflayn Bosqich) va Roadmap Uchun G‘oyalar
Briefda aytilganidek, Grand Finalda jamoalarga joyida $2\text{–}3\text{ ta}$ qo‘shimcha vazifa beriladi. Quyidagi g‘oyalarni MVP arxitekturasiga hozirdan tayyorlab (lekin "Roadmap / Grand Final extension" deb) qo‘ying:
1. **Dori va Mashq Bog‘liqligi Tahlili (Side-Effect Correlation):** Agar bemor yangi dori ichishni boshlagan kundan e’tiboran mashq paytida `"Bosh aylanishi"` yoki `"Holsizlik"` belgilasa, qoidalar dvigateli shifokorga *"Ehtimoliy dori ta’siri tufayli mashq bajarilmayapti"* deb signal beradi.
2. **Patronaj Hamshirasi Oflayn Ko‘rinishi:** Farg‘ona mahallalarida yuradigan patronaj hamshirasi o‘z hududidagi "qizil bayroqli" va $3\text{ kundan}$ beri aloqaga chiqmagan bemorlar ro‘yxatini ko‘rib, uyiga borib xabar olishi.
3. **DMED FHIR/JSON Eksport Adapteri:** Shifokor panelida `"DMED tizimiga eksport qilish (Mock JSON)"` tugmasi — bosilganda davlat standartiga mos strukturali JSON fayl chiqarib beradi.
4. **Ochiq Reabilitatsiya Datasetini Yig‘ish (Opt-in Data Collection):** Foydalanuvchi maxsus ruxsat bersa, video emas, balki faqat anonimlashtirilgan bo‘g‘im koordinatalari (3D skeleton JSON) va shifokor bahosi kelajakda mahalliy AI model o‘qitish uchun yig‘iladi.

---

## 3-QISM: QATLAMLI QURISH REJASI (15–22 NOYABR)

Vaqtni soatbay emas, **topshirsa bo‘ladigan tugallangan qatlamlar** shaklida quramiz:

* **1-Qatlam (Yadro Sikl — Majburiy Baza):**
    * 3 ta rol uchun tayyor Demo Login tugmalari (`Shifokor`, `Bemor - Anvar aka`, `Individual foydalanuvchi`).
    * Shifokor tomonidan shablon tanlash va reja yaratish (Dori + O‘tirib-turish mashqi + Qon bosimi + Qadam).
    * Bemor ekranida vazifalarni tugma orqali bajarish (`Ichdim`, qon bosimi raqamini kiritish, qadam kiritish) + kunlik/haftalik/oylik progress bar.
    * Qoidalar dvigateli (JSON) + Shifokorning "Istisnolar paneli" (qizil/sariq/yashil bemorlar ro‘yxati) + Sintetik ma’lumotlar + **Vercel/Render/Railway’ga ilk deploy**.
* **2-Qatlam (CV Kamera Motori va AI Vision — Asosiy "Wow"):**
    * MediaPipe Pose orqali o‘tirib-turishni sanash (Preset 1: Rehab Squat, Preset 2: $30\text{ s}$ Stul testi).
    * Ikkala rejim: **Jonli kamera** va **Yozilgan videoni yuklab tahlil qilish**.
    * Aldovga qarshi: SHA-256 fayl xeshi va $20\text{ nuqtali}$ harakat imzosi.
    * **DoriMos va Tonometr Vision:** Gemini Flash / GPT-4o-mini Vision API orqali dori qutisi yorlig‘i va tonometr ekranini o‘qish + bemor tasdig‘i + doza farqini tutish.
* **3-Qatlam (Shifokor Halqasi — Loop):**
    * Ishonch past bo‘lganda yoki og‘riq tugmasi bosilganda bemor roziligi bilan qisqa klip/suratni shifokor ko‘rib chiqish navbatiga (`review_requests`) tushirish va shifokorning `[Tasdiqlash]` / `[Qabulga chaqirish]` javobi.
* **4-Qatlam (Brainstorming Qo‘shimchalari — Vaqtga qarab 1–2 tasi):**
    * "Yaqinim" (Malayziyadagi farzand uchun read-only havola), Dori qoldig‘i hisoblagichi, Xavfsizlik filtrli AI vazifa tavsiyasi.

---

