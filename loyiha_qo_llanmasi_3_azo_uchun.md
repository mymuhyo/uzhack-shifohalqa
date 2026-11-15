# ShifoHalqa — Kod Bilmaydigan Jamoa A’zosi Uchun To‘liq Qo‘llanma

Salom! Bu qo‘llanma aynan **sen** uchun — jamoadagi **Product Research, UX/Content, Testing (QA) va Taqdimot** bo‘yicha mas’ul a’zo uchun maxsus, hech qanday dasturlash atamalarisiz, oddiy va tushunarli tilda yozildi.

### Bu hujjatni nega oxirigacha o‘qishing shart?
1. **Kod yozmasang ham, roling hal qiluvchi:** UzHack 2026 qoidasiga ko‘ra, umumiy ballning **30% i** bugungi Video va loyiha taqdimotiga (Task 1), qolgan **70% i** esa tayyor veb-ilovaga (Task 2) beriladi. Video, slayd, tadqiqot, test videolari/rasmlari, matnlar va hakamlar uchun qo‘llanma bo‘lmasa, eng zo‘r kod ham yuta olmaydi.
2. **Hakamlar qoidasi (3.2.5 va 4.3.2-bandlar):** Musobaqa qoidasida *"Jamoaning har bir a’zosi MVP qanday ishlashini tushunishi va tushuntirib bera olishi kerak"* deb yozilgan. Sendan kod yozib berish so‘ralmaydi, lekin **ilova qanday muammoni hal qiladi, tugma bosilganda orqada nima bo‘ladi va AI qayerda ishlaydi** — shuni aniq bilishing shart.

---

## 1. Musobaqa Muddatlari (Vaqtni Adashtirma!)

Rasmiy qo‘llanmadagi vaqtlar **Malayziya vaqti (MYT, UTC+8)** bilan berilgan. O‘zbekiston vaqti Malayziyadan **3 soat orqada**:

| Bosqich | Malayziya vaqti (MYT) | O‘zbekiston vaqti (UZT) | Nima topshiriladi? |
| :--- | :--- | :--- | :--- |
| **Task 1 (Video + Matn)** | **18-noyabr, 23:59** | **18-noyabr, 20:59** | 3–5 daqiqalik video havolasi + Platformada loyiha ma’lumotlari |
| **Task 2 (Ishlaydigan MVP)** | **22-noyabr, 23:59** | **22-noyabr, 20:59** | Brauzerda ochiladigan tayyor sayt havolasi + Demo loginlar + Izohlar |
| **Baholash va Finalchilar** | brief bo‘yicha 16–18 noyabr ⚠️ | ⚠️ | Uzaytirilgan muddatlardan keyin baholash va Finalchilar sanalari ham siljigan bo‘lishi mumkin — rasmiy kanallarni (uzhack.uz) tekshirib turing |

> **Eslatma:** `brief/uzhack-online-stage-tasks-en.pdf` (Brief v1.0) eski sanalarni (12/15-noyabr) ko‘rsatadi. Tashkilotchi e’lon qilgan uzaytirilgan sanalar asosida ishlaymiz.

---

## 2. Loyiha G‘oyasi: "ShifoHalqa" Nima O‘zi?

### 2.1. Biz hal qilayotgan muammo ("Ko‘rinmas kunlar")
Tasavvur qil: Farg‘onada yashovchi **60 yoshli Anvar aka**da yuqori qon bosimi (gipertoniya) bor va tizza bo‘g‘imi bo‘yicha reabilitatsiya o‘tmoqda. U poliklinikada shifokor qabulida atigi 10–15 daqiqa bo‘ladi. Shifokor unga dori, uyda qilinadigan o‘tirib-turish mashqi, qon bosimini o‘lchash va yurish rejasini yozib beradi.

Ammo Anvar aka uyga ketgach, keyingi haftalarda nima bo‘lishini shifokor ko‘rmaydi. Uyda uchta jiddiy muammo chiqadi:
1. **Dori dozasini adashtirish:** Dorixonadan yangi quti olganda nomi bir xil, lekin dozasi boshqa (masalan, shifokor `5 mg` yozgan, qutida `10 mg`) dorini ichib qo‘yishi yoki dorisi tugab qolgani uchun ichmay qo‘yishi mumkin.
2. **Mashqlarni tashlab ketish yoki chala qilish:** Uyda fizioterapevt yo‘q — bemor og‘riqdan qo‘rqib o‘tirib-turish mashqini umuman qilmaydi yoki noto‘g‘ri/chala bajaradi.
3. **Kechikkan ogohlantirish:** Qon bosimi 3 kun ketma-ket oshib ketsa ham, navbatdagi qabulgacha shifokor bundan bexabar qoladi. Shifokorda esa har kuni o‘nlab bemorlarga bitta-bitta qo‘ng‘iroq qilishga vaqt yo‘q.

### 2.2. Bizning yechim (Bir jumlada)
**ShifoHalqa** — bu telefon yoki kompyuter brauzerida (hech qanday ilova yuklab olmasdan) ochiladigan veb-ilova. U shifokor yozgan uy davolanish rejasini bemor uchun oddiy kundalik vazifalarga aylantiradi, kamera va surat tahlili yordamida **dalil** yig‘adi va shifokorga 50 ta bemorning hammasini emas, **faqat muammo chiqqan ("Qizil" va "Sariq") bemorlarni** ko‘rsatadi.

### 2.3. "Oddiy budilnik yoki eslatma ilovasidan nimasi farq qiladi?"
* **Oddiy eslatma ilovasi:** Faqat *"Dorini iching"* deb signal chaladi — bemor rostdan ichdimi, qutisi to‘g‘rimi, mashqni qildimi, shifokor bildimi — qiziqmaydi.
* **ShifoHalqa:** Ikki tomonlama halqa! Bemor bajarganda dalil yig‘adi (dori qutisi rasmi, kamera orqali mashq sanash), xavfli holat chiqsa kod qoidalari darhol shifokorga signal beradi va shifokor ko‘rib tasdiqlaydi.
* **DMED bilan to‘qnashmaydimi?** Yo‘q. DMED — qabulga yozilish va elektron retsept tizimi. ShifoHalqa esa qabuldan keyingi **uydagi ijro va reabilitatsiyani** kuzatib beruvchi qo‘shimcha qatlam.

---

## 3. Ilovadan Kimlar Foydalanadi? (4 ta Rol)

Ilovani ochganingda eng tepasida hakamlar uchun **"Demo Switcher"** (bir tugma bilan roldan rolga o‘tish paneli) turadi. Tizimda 3 ta asosiy rol va 1 ta qo‘shimcha ko‘rinish bor:

1. **Shifokor (`Dr. Sardor`):**
   * Tayyor shablonlardan 1 daqiqada bemorga reja tuzadi (masalan: *Amlodipin 5 mg*, *10 ta o‘tirib-turish mashqi*, *qon bosimini o‘lchash*, *kunlik 6000 qadam*).
   * Chegaralarni o‘zi belgilaydi (masalan, bosim `160` dan oshsa qizil bayroq, tizza burchagi `105°` gacha bukilsin).
   * Panelga kirganda tepada faqat **Qizil** va **Sariq** bayroqli bemorlarni ko‘radi, yuborilgan klip/rasmlarni tekshirib `[Tasdiqlash]` yoki `[Qabulga chaqirish]` tugmasini bosadi.
2. **Bemor (`Anvar aka`):**
   * Katta, tushunarli tugmalar orqali bugungi vazifalarni bajaradi.
   * Dori ichganini belgilaydi yoki qutini rasmga olib tekshiradi (`DoriMos`), kamera oldida mashqni bajaradi, bosim/qadamni kiritadi.
   * Istalgan payt yuqorida doim ko‘rinib turadigan **`103 Tez yordam`** va **`Og‘riq bor`** tugmalari bor.
3. **Mustaqil Foydalanuvchi (Individual rejim):**
   * Shifokorsiz kirib, o‘zi uchun sog‘lomlashtirish (qadam, o‘tirib-turish, vitamin) vazifalarini tuzadigan odam.
   * Boshida 3–4 ta xavfsizlik savolidan o‘tadi (masalan, *"Yaqinda yurak/bo‘g‘im operatsiyasi bo‘lganmisiz?"*). Agar xavfli javob bersa, ilova unga mashq bermaydi, shifokorga borishni aytadi.
4. **Oila a’zosi ("Yaqinim" — Malayziyadagi farzand havolasi):** *(Kengaytma / 4-qatlam)*
   * Bemor o‘zining 1 ta maxfiy "Faqat ko‘rish" havolasini Malayziyadagi yoki Toshkentdagi farzandiga beradi. Farzand ota-onasi bugun dorisini ichgani, bosimi me’yordaligi va dorisi tugashiga necha kun qolganini ko‘rib xotirjam bo‘ladi (videolarsiz, maxfiy).

---

## 4. Ilova Ichida Hamma Narsa Qanday Ishlaydi? (Oddiy Tilda!)

Hakamlar *"Bu ilova ichida qanday ishlaydi?"* deb so‘rasa, mana shu mantiqni bilishing kifoya:

### 4.1. Oltin Qoida: Tizimning "Miya" Bo‘linishi
Tibbiyotda AI ga hamma narsani ishonib bo‘lmaydi. Shuning uchun bizning tizimda vazifalar **4 qismga** qat’iy bo‘lingan:
1. **Kamera va Vision AI = "Chizg‘ich va Ko‘zoynak"** (faqat burchakni o‘lchaydi va qutidagi yozuvni o‘qiydi).
2. **Matn AI (LLM) = "Kotib"** (bemorning 7 kunlik ko‘rsatkichlarini shifokor uchun 3 qator chiroyli xulosaga siqib beradi).
3. **Qoidalar Dvigateli (Kod) = "Qat’iy Svetofor"** (AI emas! Oddiy matematika: *agar bosim >= 160 bo‘lsa -> QIZIL BAYROQ; agar qutidagi raqam 10 mg, retsept 5 mg bo‘lsa -> QIZIL BAYROQ*). Svetofor hech qachon adashmaydi va o‘zidan gap to‘qimaydi.
4. **Shifokor = "Boshliq / Yakuniy Qaror"** (**AI hech qachon tashxis qo‘ymaydi va dori dozasini o‘zgartirmaydi!**).

---

### 4.2. "Dalil Narvoni" (Verification Ladder — 0 dan 4-darajagacha)
Bu loyihamizning eng muhim g‘oyasi! Biz hech qachon *"AI bemor dori yutganini 100% isbotlaydi"* deb yolg‘on aytmaymiz. Buning o‘rniga har bir bajarilgan ishga **ishonch darajasi** beramiz:

* **0-daraja (O‘z hisoboti):** Bemor shunchaki `"Ichdim"` tugmasini bosdi yoki qadam sonini qo‘lda yozdi. *(Eng past dalil)*.
* **1-daraja (Vaqt taymeri):** Vazifa oynasini ochib, belgilangan vaqt davomida bajardi.
* **2-daraja ("DoriMos" va Tonometr — Foto OCR + Tasdiq):**
  * Bemor dori qutisini (yoki tonometr ekranini / qadam ilovasi skrinshotini) rasmga oladi.
  * AI rasmdagi yozuvni o‘qib chiqadi (masalan: `Amlodipin 10 mg`).
  * Ekranda bemordan so‘raladi: *"Rasmda Amlodipin 10 mg ko‘rindi, to‘g‘rimi?"* -> Bemor `"Ha"` deb tasdiqlaydi.
  * Keyin Svetofor (kod) shifokor retsepti (`5 mg`) bilan solishtiradi. Agar farq chiqsa, darhol ogohlantiradi: *"DIQQAT! Rejada 5 mg, qutida 10 mg!"* va shifokorga qizil bayroq ketadi.
* **3-daraja (Brauzerda Kamera Poza Tahlili — MediaPipe Pose):**
  * Hech qanday video serverga yuborilmaydi! Bemor telefon brauzerining o‘zida kamera oldida o‘tirib-turish mashqini bajaradi.
  * Dastur tana nuqtalarini (yelka, son, tizza, to‘piq) topib, **tizza burchagini** hisoblaydi: bemor tik turganidan ($\ge 160^\circ$) pastga o‘tirib ($\le 105^\circ$) yana qaytib turganida **`+1 takror`** sanaydi. Agar yarmigacha o‘tirib turib ketsa — *"Sayoz (chala) takror"* deb alohida yozadi.
  * Mashq tugagach, tizim **Ishonch bali (Confidence)** ni hisoblaydi (masalan `88%` — ya’ni tana kadrda qanchalik tiniq ko‘ringaniga qarab).
  * **Ikki xil usul:** Jonli kameradan tashqari, **"Yozilgan videoni yuklab tahlil qilish"** tugmasi ham bor (hakamlar o‘tirib-turib ko‘rsatmasa ham, tayyor demo videoni yuklab tekshirishi uchun!).
* **4-daraja (Shifokor Tasdiqladi):**
  * Agar kamera tahlilida ishonch past chiqsa (`< 75%`), chala takror ko‘p bo‘lsa yoki bemor `"Og‘riq bor"` tugmasini bossa, ilova bemordan so‘raydi: *"Shifokor ko‘rib berishi uchun 10 soniyalik klipni yuboraylikmi?"*
  * **Faqat bemor rozilik bersagina** klip shifokor navbatiga tushadi. Shifokor videoni ko‘rib `[Tasdiqlash]` bossa, natija eng yuqori **4-darajaga** ko‘tariladi.

---

### 4.3. Aldovga Qarshi Himoya (Anti-Cheat) — Oddiy Tilda
Hakamlar albatta *"Bemor bitta videoni qayta-qayta yuklab aldayveradi-ku!"* deb so‘raydi. Tizimda bunga qarshi **4 ta himoya** bor:
1. **Kuniga 1 ta asosiy natija:** Bemor bir kunda 10 marta mashq yuklasa ham, kunlik reja bajarilishiga faqat **1-to‘liq urinish** yoziladi, qolgani "Qo‘shimcha mashq" bo‘ladi.
2. **Faylning "Barmoq izi" (SHA-256 xesh):** Yuklangan har bir videofayldan noyob raqamli kod (barmoq izi) olinadi. Agar kimdir kechagi videoni bugun yana yuklasa, tizim *"Bu fayl avval yuklangan!"* deb darhol to‘xtatadi.
3. **Harakat Imzosi (Motion Signature — 20 nuqtali grafik):** Har bir mashq paytida tizza burchagining egilish chizig‘i grafik (20 ta nuqta) sifatida saqlanadi. Haqiqiy odam ikki kun ketma-ket aynan millisekundma-millisekund bir xil egila olmaydi. Agar kechagi videoni biroz qirqib yoki nomini o‘zgartirib yuklasa ham, grafiklar 99% ustma-ust tushsa, tizim *"Takroriy video shubhasi"* deb shifokorga yuboradi.
4. **Halol tan olish:** Biz *"100% aldovni to‘samiz"* demaymiz — *"Har natijaga manbasini (jonli kamera vs yuklangan fayl) va ishonch balini yozamiz, shubhalisini shifokorga uzatamiz"* deymiz.

---

### 4.4. Muhim Texnik Atamalar Lug‘ati (Bilishing kerak bo‘lgan 10 ta so‘z)
1. **MVP (Minimum Viable Product):** Mahsulotning eng sodda, lekin boshidan oxirigacha real ishlaydigan birinchi versiyasi (slayd yoki rasm emas!).
2. **Browser / Web App:** Telefonga App Store / Play Market’dan yuklab o‘rnatish shart bo‘lmagan, oddiy havola (Chrome/Safari) orqali ochiladigan ilova.
3. **MediaPipe Pose:** Google’ning tayyor ochiq modeli bo‘lib, kamera orqali odam tanasidagi 33 ta nuqtani (bo‘g‘imlarni) brauzerning ichida, internetsiz ham topib beradi.
4. **Vision AI / OCR:** Suratdagi matn yoki raqamlarni (dori qutisi yorlig‘i, tonometr ekrani) o‘qiydigan sun’iy intellekt.
5. **Deterministik Qoidalar (Rules Engine):** AI bo‘lmagan, aniq `agar ... unda ...` ko‘rinishidagi kod qoidalari. Masalan: `bosim >= 160` -> qizil.
6. **Confidence Score (Ishonch bali):** 0 dan 1 gacha (yoki 0–100%) son; kamera odamni qanchalik yaxshi ko‘rib sanaganini bildiradi.
7. **Synthetic Data (Sintetik ma’lumot):** Real bemorlarning maxfiy hujjatlari emas, balki test qilish uchun o‘ylab topilgan sun’iy bemor profillari (*Anvar aka*, *Dilnoza opa*).
8. **Seed Data:** Ilova birinchi marta ochilganda bo‘sh turmasligi uchun bazaga oldindan kiritib qo‘yiladigan tayyor demo ma’lumotlar.
9. **Mock / Simulated:** Hali tashqi tizimga (masalan, davlatning DMED bazasi yoki pullik SMS xizmatiga) rasman ulanmagan, lekin qanday ishlashini ko‘rsatadigan namuna qism.
10. **Incognito (Maxfiy oyna):** Brauzerda hech qanday akkaunt va parol saqlanmagan toza oyna. Hakamlar bizning sayt va videoni aynan shunday toza oynada ochib tekshiradi!

---

## 5. Nima Real Ishlaydi va Nima Simulyatsiya? (Yodda tut!)

Hakamlar oldida hech narsani yashirmaslik — qat’iy qoida:

| Qism | Holati | Qanday tushuntiramiz? |
| :--- | :--- | :--- |
| **Brauzerda mashq sanash va burchak o‘lchash** | **100% Real** | MediaPipe yordamida jonli kamerada va yuklangan videoda real ishlaydi. |
| **DoriMos (quti o‘qish) va Tonometr OCR** | **100% Real** | Haqiqiy suratni AI o‘qiydi va kod qoidasi retsept bilan solishtiradi. |
| **SHA-256 xesh va 20-nuqtali harakat imzosi** | **100% Real** | Takroriy yuklangan videoni real vaqtda ushlaydi. |
| **Qoidalar dvigateli va Shifokor halqasi** | **100% Real** | Bemor bajargan vazifa darhol shifokor panelida bayroq ko‘taradi. |
| **Bemor profillari (Anvar aka) va 7 kunlik grafik** | **Sintetik (Namuna)** | Shaxsiy tibbiy ma’lumotlarni himoyalash uchun sun’iy profillar ishlatilgan. |
| **DMED bilan ulanish va SMS/Telegram eslatma** | **Simulyatsiya (Roadmap)** | Davlat ruxsati kerakligi uchun faqat standart JSON eksport namunasi ko‘rsatiladi. |

---

## 6. Sening Aniq Ish Rejang (15–22 Noyabr)

> **Yangi muddatlar:** Task 1 — **18-noyabr 23:59 MYT (20:59 UZT)** · Task 2 — **22-noyabr 23:59 MYT (20:59 UZT)** (tashkilotchi uzaytirdi). Kodchilar (1-A’zo va 2-A’zo) dasturlashda davom etadi; sen ilovaning **taqdimoti, materiallari, tili va sifatini** ta’minlaysan.

Kodchilar (1-A’zo va 2-A’zo) dasturlayotganda, sen ilovaning **taqdimoti, materiallari, tili va sifatini** ta’minlaysan:

### 📅 15–16-noyabr (Bugun va ertaga — MVP uchun "Xomashyo" — Rasm, Video, Audio, Matn)
Kodchilar sensiz bu materiallarni yarata olmaydi — bularni tayyorlab Telegram guruhiga tashlaysan:
1. **Dori qutilari suratlari (5–6 dona):** Uydagi yoki dorixonadagi haqiqiy dori qutilarini suratga ol. Ayniqsa bitta dorining ikki xil dozasi (`5 mg` va `10 mg` yoki boshqa ikki xil mg) rasmi bo‘lsa zo‘r! Toza yorug‘likda hamda biroz xiraroq/qiyshiq suratlar ham ol.
2. **Tonometr va Qadam skrinshotlari (4–5 dona):** Qon bosimi o‘lchagich (tonometr) ekranining rasmi + telefoningdagi qadam ilovasi (Google Fit / Samsung Health / Apple Health) skrinshotlari.
3. **Demo Mashq Videolari (4–5 ta qisqa 15–20 soniyalik video):**
   * Telefonni yotiq (yoki tik, qanday kelishilsa) devorga suyab, o‘zing yoki rozi do‘sting stuldan o‘tirib-turayotgan videoni ol:
     - *1-video:* To‘g‘ri va to‘liq 5–6 marta o‘tirib-turish (yaxshi yorug‘likda).
     - *2-video:* Chala/yarim o‘tirib-turish (tizim "sayoz takror"ni tutishini sinash uchun).
     - *3-video:* Xira yorug‘likda yoki kadrdan yarim chiqib ketgan video (tizim "past ishonch" berishini sinash uchun).
     - *4-video:* Qo‘llarni ko‘krakda keshtirib 30 soniyalik stul testi.
   * *Nega bu shart?* Hakamlar stuldan turib mashq qilib o‘tirmaydi — ular ilovadagi "Tayyor sinov videosini yuklash" tugmasini bosib, aynan sen olgan videolarni tekshiradi!
4. **O‘zbekcha qisqa ovozli fayllar (5–6 ta `.mp3`/`.wav`):**
   * Tinch xonada tiniq ovozda yozib ber: *"Kadrga to‘liq kiring"*, *"Boshladik"*, *"Yaxshi, davom eting"*, *"Og‘riq bo‘lsa to‘xtating"*, *"Mashq yakunlandi"*.
5. **Ilova matnlari va 3 ta Bemor tarixi:**
   * Bemor ko‘radigan barcha tugma va ogohlantirish matnlarini (*"Dorini ichdim"*, *"103 Tez yordam"*, *"Bu AI tavsiyasi, shifokor tashxisi emas"*) sodda, keksa odam tushunadigan o‘zbek tilida yozib ber.
   * 3 ta sun’iy bemor (`Anvar aka` — Qizil bayroq, `Dilnoza opa` — Sariq bayroq, `Rustam aka` — Yashil holat) ning oxirgi 7 kunlik mantiqiy ma’lumotlarini (qaysi kuni bosim necha chiqqani, nechta takror qilgani) oddiy matn/jadval qilib kodchilarga ber.

### 📅 17-noyabr (Sifat Nazorati — QA va Mini-Benchmark)
1. **Hakam ko‘zi bilan QA Test:** Kodchilar tayyor sayt havolasini bergach, **telefoningda va noutbukda Incognito oynadan** kirib hamma tugmalarni bosib chiq:
   * Demo loginlar ishlayaptimi?
   * O‘zbekcha yozuv tugmadan chiqib ketmaganmi?
   * Kamera ruxsati berilmasa, xato chiroyli ko‘rsatilyaptimi?
   * Topilgan har bir xatoni skrinshot qilib kodchilarga ro‘yxat qilib ber.
2. **Mini-Aniqlik Sinovi (Mini-Benchmark — `Impact` 20 ball uchun eng kuchli qurol!):**
   * O‘zing yozgan **8–10 ta mashq videosini** saytga birma-bir yukla. Har birida o‘zing qo‘lda sanagan haqiqiy takrorlar soni bilan sayt sanagan sonni jadvalga yoz.
   * **5 ta dori qutisi** va **5 ta tonometr rasmini** `DoriMos` ga yuklab, nechtasini to‘g‘ri o‘qiganini yoz.
   * Natijani hech qachon bo‘yama! Xatolari bilan yoz (masalan: *"10 ta videodan 8 tasida to‘g‘ri sanadi, xira yorug‘likda 2 tasida adashdi"*). Bu to‘qima bo‘lmagan **100% halol muhandislik sinovi** bo‘ladi!

### 📅 18-noyabr — TASK 1 KUNI (Video + Platforma)
*Batafsil soatbay reja va tayyor video ssenariysi [tasks/task-1/task_1_video_va_topshirish_rejasi.md](tasks/task-1/task_1_video_va_topshirish_rejasi.md) faylida yozilgan!*
* **Asosiy vazifalaring:**
  1. Tanish shifokor/hamshira yoki gipertoniya/bo‘g‘im bemori bilan 10 daqiqalik mini-intervyu o‘tkazish (ruxsat bermasa yoki topilmasa, to‘qimaslik!).
  2. Canva/Google Slides’da 7 ta toza slayd tayyorlash (yoki OBS runbook'dagi `slides/` papkasini to‘ldirish — hozircha mavjud emas, tayyorlash kerak!).
  3. 1-A’zo va 2-A’zo bilan Discord’da sinxronlashib, video qismlarni yozib olish va CapCut’da 4:15–4:30 daqiqalik video yig‘ish.
  4. YouTube `Unlisted` (va Drive) ga yuklab, Incognito oynada tekshirish.
  5. UzHack platformasida `Project` bo‘limidagi barcha maydonlarni to‘ldirish va **20:59 UZT (23:59 MYT)** dan kechiktirmasdan (maqsad 18:00 UZT) topshirish.

### 📅 19–21-noyabr (Bufer — MVP'ni sayqallash va Note matnlari)
1. Task 1'dan qolgan ishlarni tugating; videoni yana bir darhol Incognito'da ochib tekshiring.
2. Platforma Note'i va AI-use Note'ining birinchi versiyasini tayyorlab qo‘ying (Task 2 kuni bosimiga qolmasin):
   * **Platforma Note:** Saytda nima real ishlaydi, nima simulyatsiya (jadval), Demo loginlar va hakam ilovani qanday sinashi bo‘yicha 4 qadamli ko‘rsatma.
   * **AI-use Note:** Kod yozishda qaysi AI vositalardan foydalandik + ilovaning ichida AI nima qiladi va nima qilmaydi.
3. Kodchilar bilan uchrashib, hakamning "Live demonstration" (4.3.2-band) uchun savol-javob mashqini boshlang (§7'dagi savollar).

### 📅 22-noyabr — TASK 2 KUNI (Topshirish kuni — Task 2!)
1. Platformaga yoziladigan **2 ta majburiy matnni** yakuniy holga keltiring:
   * **Platforma Note:** Saytda nima real ishlaydi, nima simulyatsiya (jadval), Demo loginlar va hakam ilovani qanday sinashi bo‘yicha 4 qadamli ko‘rsatma.
   * **AI-use Note:** Kod yozishda qaysi AI vositalardan foydalandik + ilovaning ichida AI nima qiladi va nima qilmaydi.
2. Kechqurun kodchilar bilan 15 daqiqa gaplashib, tizim qanday ishlashini savol-javobda mashq qilasan.
3. **18:00 UZT (21:00 MYT)** gacha topshirish va Incognito’da oxirgi tekshiruv! — maqsad: 20:59 UZT dan oldin topshirish.

---

## 7. Hakamlar Berishi Mumkin Bo‘lgan Qiyin Savollar va Tayyor Javoblar

Agar hakamlar jonli suhbatga chaqirsa (4.3.2-band), senga berilishi mumkin bo‘lgan savollarga tayyor javoblar:

1. **Hakam:** *"O‘tirib-turishni sanashni oddiy fitnes ilovalar (masalan, Alarmy) ham qiladi-ku. Sizning yangiligingiz nimada?"*
   * **Javob:** *"Bizning yangiligimiz sanashning o‘zida emas, **Shifokor Halqasi va Dalil Narvonida**. Fitnes ilova faqat raqam chiqaradi; biz esa shifokor belgilagan chegaralarga mosligini tekshirib, har yozuvga ishonch bali beramiz, past ishonchli yoki og‘riqli holatni rozilik bilan shifokor Istisnolar paneliga chiqaramiz va faqat muammoli bemorlarni saralab beramiz."*
2. **Hakam:** *"Bemor kamera oldiga ukasini qo‘ysa yoki eski videoni qayta yuklasa nima bo‘ladi?"*
   * **Javob:** *"Biz 100% aldovni to‘sa olamiz deb yolg‘on da’vo qilmaymiz. Lekin 4 qatlamli himoya qo‘ydik: kuniga 1 ta asosiy natija limiti, yuklangan videoning manbasini ('uploaded_file') jonli kameradan ajratish, faylning SHA-256 barmoq izi orqali aynan bir xil faylni bloklash va 20 nuqtali harakat imzosi orqali takroriy shubhani shifokorga chiqarish."*
3. **Hakam:** *"AI noto‘g‘ri o‘qisa yoki noto‘g‘ri qaror bersa, bemor sog‘lig‘iga kim javob beradi?"*
   * **Javob:** *"Bizning tizimda AI hech qachon tashxis qo‘ymaydi va dori dozasini o‘zgartirmaydi. Vision AI o‘qigan har bir dori yorlig‘ini avval bemorning o‘zi ekranda tasdiqlaydi; qizil/sariq bayroqlarni esa AI emas, shifokor belgilagan qat’iy kod qoidalari ko‘taradi. Yakuniy qaror faqat shifokorda."*
4. **Hakam:** *"Real bemorlarda sinamagan bo‘lsangiz, foydasini qayerdan bilasiz?"*
   * **Javob:** *"Maxfiylik va musobaqa qoidalariga ko‘ra real bemor ma’lumotlarini ishlatmadik — profillar sintetik. Lekin biz o‘z tizimimizda o‘zimiz yozgan test videolari va haqiqiy dori qutilari ustida texnik aniqlik sinovi (Mini-Benchmark) o‘tkazdik va haqiqiy aniqlik hamda xatolarini ochiq ko‘rsatdik."*
5. **Hakam:** *"Video boshqa joyga chiqib ketmaydimi? Maxfiylik qanday?"*
   * **Javob:** *"MediaPipe poza tahlili to‘liq bemor brauzerining o‘zida ishlaydi — video serverga ketmaydi, bazaga faqat raqamlar (takror, burchak, ishonch bali) boradi. Video klip faqat ishonch past bo‘lganda yoki og‘riq bosilganda, bemorning alohida roziligi bilan shifokor ko‘rigiga yuboriladi."*
6. **Hakam:** *"Sen kod yozmagan ekansan, MVP qanday ishlashini tushuntirib ber-chi?"*
   * **Javob:** *"Albatta! Men mahsulot tadqiqoti, foydalanuvchi oqimi (UX), test materiallari va QA sinovi uchun mas’ulman. Tizim 3 qatlamda ishlaydi: 1) Shifokor brauzerda shablondan reja beradi va chegaralarni qo‘yadi; 2) Bemor brauzerida DoriMos rasmni Vision AI ga o‘qitadi, mashq esa hech qayerga video jo‘natmasdan brauzerning o‘zida MediaPipe bilan tizza burchagini sanaydi; 3) Olingan natija backenddagi qat’iy kod qoidalaridan o‘tadi va faqat me’yordan chiqqan holatlar shifokor Istisnolar paneliga chiqadi."*

---

**Xulosa:** Sening vazifang — bu loyihani "dasturchilar yozgan kod" dan **"odamlar va hakamlar bir qarashda tushunadigan, ishonadigan haqiqiy tibbiy mahsulot"** ga aylantirish! Savol tug‘ilsa, bemalol kodchi sheriklaringdan so‘rab aniqlab boraver.
