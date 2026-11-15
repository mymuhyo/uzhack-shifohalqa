# "ShifoHalqa" (Smart Care & Rehab Loop) — To‘liq Loyiha Rejasi va Texnik Spetsifikatsiyasi

**Musobaqa:** UzHack 2026 (Uzbekistan–Malaysia Tech Bridge)
**Yo‘nalish:** Track 01 — Smart Healthcare (Farg‘ona viloyati fokusi)
**Ishlanma turi:** Mobil va kompyuter brauzerida o‘rnatishsiz ishlovchi veb-ilova (PWA / Responsive Web App)

---

## 1. LOYIHA PASPORTI VA ASOSIY KONSEPSIYA

### 1.1. Muammo Mohiyati ("Qabullar orasidagi ko‘rinmas davr")
Farg‘ona viloyati va O‘zbekistonning boshqa hududlarida surunkali kasalligi (masalan, gipertoniya) bor yoki ortopedik jarrohlik / jarohatdan (masalan, tizza bo‘g‘imi) so‘ng tiklanayotgan bemor poliklinikada shifokor qabulida o‘rtacha $10\text{–}15\text{ daqiqa}$ bo‘ladi. Asosiy davolanish jarayoni esa keyingi $14\text{–}90\text{ kun}$ davomida **uy sharoitida, nazoratsiz** o‘tadi.

Bu davrda to‘rtta tizimli uzilish yuz beradi:
1. **Dori va doza xatoliklari:** Bemor yangi dori qutisini xarid qilganda dori nomi bir xil bo‘lsa-da, uning kuchini (masalan, $5\text{ mg}$ o‘rniga $10\text{ mg}$) adashtirishi yoki dori tugab qolib, davolanishni to‘xtatib qo‘yishi mumkin.
2. **Uy reabilitatsiyasining bajarilmasligi:** Uyda fizioterapevt yo‘qligi sababli bemor buyurilgan mashqlarni (masalan, o‘tirib-turish) og‘riqdan qo‘rqib bajarmaydi yoki noto‘g‘ri amplitudada bajaradi.
3. **Kechikkan eskalatsiya:** Qon bosimining ketma-ket oshishi yoki xavfli simptomlar (bosh og‘rig‘i, bo‘g‘imda o‘tkir og‘riq) navbatdagi qabulgacha yoki tez yordam ($103$) chaqirilgungacha shifokorga yetib bormaydi.
4. **Shifokor va uzoqdagi oila a’zolarining ko‘r-ko‘rona holati:** Poliklinika shifokorida har kuni o‘nlab bemorlarga qo‘ng‘iroq qilishga vaqt yo‘q. Uzoqda (masalan, Malayziyada o‘qiyotgan yoki ishlayotgan) farzandlar esa Farg‘onadagi ota-onasining kundalik rejaga qanchalik amal qilayotganini ko‘ra olmaydi.

### 1.2. Yechim Konsepsiyasi
**ShifoHalqa** — shifokor tayinlagan davolash rejasini (dori-darmon, reabilitatsiya mashqlari, tibbiy o‘lchovlar va kunlik/haftalik/oylik qadamlar) bemor telefonidagi brauzerda bajariladigan vazifalarga aylantiruvchi, **Dalil narvoni (Verification Ladder)** orqali har bir vazifaning ishonch darajasini hisoblovchi hamda shifokorga faqat me’yordan chetga chiqqan ("qizil/sariq bayroqli") bemorlarni ko‘rsatuvchi tizimdir.

### 1.3. Asosiy Arxitektura Tamoyili (Oltin Qoida)
$$\text{Kamera va Vision AI o‘lchaydi} \rightarrow \text{LLM tarjima va xulosa qiladi} \rightarrow \text{Qat’iy Kod Qoidalari (Rules Engine) bayroq ko‘taradi} \rightarrow \text{Shifokor qaror qabul qiladi}$$

* **AI hech qachon tashxis qo‘ymaydi.**
* **AI hech qachon dori dozasini yoki mashq yuklamasini o‘zi o‘zgartirmaydi.**
* **Video standart holatda qurilmadan tashqariga chiqmaydi** (faqat bemorning har safargi alohida roziligi bilan $10\text{–}15\text{ soniyalik}$ klip shifokor ko‘rigiga yuboriladi).

---

## 2. FOYDALANUVCHI ROLLARI VA RUHSATLAR TIZIMI

Tizimda **4 xil foydalanuvchi ko‘rinishi** (3 ta asosiy rol + 1 ta maxfiy havola orqali kiruvchi oila a’zosi) mavjud. Har bir vazifada `created_by` (`doctor` yoki `self`) va `shared_with_doctor` (`true` yoki `false`) xususiyatlari bo‘ladi.

| Rol | Kirish usuli | Asosiy imkoniyatlari | Ma’lumot ko‘rinishi |
| :--- | :--- | :--- | :--- |
| **1. Shifokor (`doctor`)** | Demo Login / Parol | Shablonlardan $60\text{ soniyada}$ reja tuzish, har bir bemor uchun individual burchak va bosim chegaralarini belgilash, "Istisnolar paneli"da qizil/sariq bemorlarni va yuborilgan qisqa videolarni ko‘rib tasdiqlash. | Faqat o‘ziga biriktirilgan bemorlar va `shared_with_doctor = true` bo‘lgan vazifalar. |
| **2. Bemor (`patient`)** | Demo Login / PIN | Shifokor yuborgan rejani tushunganini tasdiqlash (*Mini Teach-back*), kunlik dorilar, mashqlar, bosim va qadamlarni bajarish, og‘riq/simptom haqida xabar berish, yaqinlariga havola ulashish. | O‘zining barcha vazifalari, kunlik/haftalik/oylik progressi va shifokor javoblari. |
| **3. Mustaqil foydalanuvchi (`individual`)** | Demo Login / Ro‘yxatdan o‘tish | Shifokorsiz rejim. Kutubxonadan o‘zi vazifa tanlaydi (`created_by = self`) yoki xavfsizlik savollaridan o‘tib AI tavsiyasini oladi (qadam, o‘tirib-turish, suv/vitamin). | Standart holatda faqat o‘ziga ko‘rinadi (`shared_with_doctor = false`). Xohlasa shifokorga ulashi mumkin. |
| **4. Oila a’zosi (`caregiver`)** | Maxfiy Read-Only URL token | Malayziyada yoki boshqa shaharda turib Farg‘onadagi ota-onasining bugungi dorisi ichilgani, bosimi va mashq progressini ko‘rish, dori tugayotgani haqida ogohlantirish olish. | Faqat o‘qish (Read-Only) rejimida bugungi va haftalik xulosa (videolarsiz). |

---

## 3. YAGONA VAZIFALAR MEXANIZMI VA "DALIL NARVONI" (VERIFICATION LADDER)

### 3.1. Universal Vazifa Formulasi
Tizimdagi har qanday topshiriq alohida tarqoq kod emas, balki bitta universal ma’lumotlar modeli asosida ishlaydi:
$$\text{Task} = \{\text{Type}, \text{Metric}, \text{Target}, \text{Period}, \text{VerificationMethod}, \text{ParamsJSON}\}$$

* **Period (Davriylik):** `daily` (kunlik), `weekly` (haftalik), `monthly` (oylik).
* Kunlik loglar bazaga yozilgach, haftalik va oylik ko‘rsatkichlar oddiy va aniq SQL agregatsiyasi (`SUM`, `AVG`, `COUNT`) orqali hisoblanadi.

### 3.2. Dalil Narvoni (0 dan 4-darajagacha)
Tizim hech qachon "AI bemor dori ichganini $100\%$ isbotladi" deb yolg‘on da’vo qilmaydi. Buning o‘rniga har bir bajarilgan vazifa logiga **Dalil darajasi (`evidence_level`)** va **Ishonch bali (`confidence`)** yoziladi:

* **0-Daraja (`SELF_REPORT`):** Foydalanuvchi `"Ichdim"` tugmasini bosdi yoki qadam/bosim raqamini qo‘lda kiritdi. ($\text{confidence} = \text{null}$, yorliq: *"Bemor aytdi"*).
* **1-Daraja (`TIMER_DURATION`):** Vazifa oynasi belgilangan vaqt davomida ochiq turdi va taymer yakunlandi. (Yorliq: *"Vaqt bo‘yicha qayd etildi"*).
* **2-Daraja (`VISION_OCR_CONFIRMED`):** Dori qutisi, tonometr ekrani yoki qadam ilovasi skrinshoti yuklandi $\rightarrow$ Multimodal Vision AI yozuvni o‘qidi $\rightarrow$ Bemor ekranda o‘qilgan qiymatni tasdiqladi. (Yorliq: *"Suratdan o‘qildi va bemor tasdiqladi"*).
* **3-Daraja (`ON_DEVICE_POSE_CV`):** Brauzerda MediaPipe Pose orqali real vaqtda (yoki yuklangan videoda) bo‘g‘im burchaklari o‘lchandi, takrorlar sanaldi, kadr sifati va harakat imzosi tekshirildi. ($\text{confidence} \in [0.0, 1.0]$, yorliq: *"Kamera poza tahlili"*).
* **4-Daraja (`CLINICIAN_REVIEWED`):** Shifokor yuborilgan ma’lumotni yoki qisqa video-klipni ko‘rib chiqdi va `"Tasdiqlandi"` tugmasini bosdi. (Yorliq: *"Shifokor tasdiqladi"*).

---

## 4. ASOSIY FUNKSIONAL MODULLARNING BATAFSIL ISHLASH MANTIG‘I

### 1-MODUL: Reja Yaratish va "Mini Tushundimmi?" (Onboarding & Teach-Back)
1. **Shablonlar kutubxonasi:** Shifokor vaqtini tejash uchun 3 ta tayyor klinik shablon bo‘ladi:
   * *Shablon A:* Tizza bo‘g‘imi reabilitatsiyasi + Gipertoniya nazorati ($14\text{ kun}$).
   * *Shablon B:* Gipertoniya standart kuzatuvi (Dori + Bosim $2\times\text{kun}$ + Kunlik $5000\text{ qadam}$).
   * *Shablon C:* Keksalarda muvozanat va oyoq kuchini baholash (CDC $30\text{ s}$ stul testi + yurish).
2. **Shaxsiy chegaralarni kiritish:** Shifokor shablonni tanlagach, bemorga mos chegaralarni o‘zgartira oladi (masalan: sistolik bosim chegarasi $= 150\text{ mmHg}$, o‘tirib-turishda tizza burchagi $\le 105^\circ$).
3. **Mini "Tushundimmi?" (Teach-back tekshiruvi):**
   * Bemor yangi rejani ilk bor ochganda, rejaning qisqa va sodda o‘zbekcha xulosasi ko‘rsatiladi.
   * Pastda bitta tekshiruv savoli chiqadi: *"Rejani boshlashdan oldin, dorini qachon ichishingizni va mashqni necha marta bajarishingizni o‘z so‘zingiz bilan yozing (yoki tanlang)."*
   * LLM bemor javobini shifokor rejasi bilan solishtiradi (`matches`, `contradicts`, `missing`). Agar bemor *"Dorini faqat boshim og‘riganda ichaman"* desa, tizim buni tutadi va shifokorning asl ko‘rsatmasini yonma-yon chiqarib, tushunmovchilikni tuzatadi.

---

### 2-MODUL: Dori-darmonlarni Kuzatish, "DoriMos" va Aqlli Qoldiq Hisoblagich
Bu modul uyda dori ichishdagi 3 ta eng katta xavfni (unutish, dozani adashtirish, dori tugab qolishi) yopadi:

#### A. Kunlik Qabul va Simptomlar (0-daraja)
* Bemor ekranida har bir dori uchun katta karta chiqadi: `Amlodipin 5 mg — Ertalab 1 tabletka (08:00)`.
* Uchta tugma: `[Ichdim]`, `[Icha olmadim (sababini belgilash)]`, `[Unutdim]`.
* Agar `"Icha olmadim"` bosilsa, sabablar chiqadi: *"Dori tugadi"*, *"Ko‘ngil aynishi / bosh aylanishi"*, *"Boshqa"*.

#### B. "DoriMos" — Dori Qutisini Vision AI Orqali Tekshirish (2-daraja)
* Bemor `"Dori qutisini tekshirish (Kamera/Foto)"` tugmasini bosib, qo‘lidagi dori qutisining bosma yorlig‘ini suratga oladi (yoki tayyor sinov suratini tanlaydi).
* **AI Vision (Gemini 1.5 Flash / GPT-4o-mini):** Rasmni tahlil qilib, strukturali JSON qaytaradi:
  ```json
  {
    "extracted_drug_name": "Amlodipin",
    "extracted_strength_mg": 10,
    "extracted_form": "tabletka",
    "is_readable": true
  }
  ```
* **Bemor tasdig‘i:** Ekranda *"Suratda: Amlodipin 10 mg o‘qildi. To‘g‘rimi?"* degan tasdiq oynasi chiqadi.
* **Qoidalar solishtiruvi (Deterministic Check):** Kod qoidasi shifokor yozgan reja (`prescribed_strength_mg = 5`) bilan suratdagi qiymatni (`10`) solishtiradi:
  * **Mos kelsa ($\text{5 mg} == \text{5 mg}$):** Yashil belgi — `"Quti shifokor rejasiga mos (Dalil darajasi: 2)"`.
  * **Farq qilsa ($\text{10 mg} \ne \text{5 mg}$):** Qizil ogohlantirish — `"DIQQAT! Shifokor rejasida 5 mg yozilgan, ammo qutida 10 mg ko‘rinmoqda! Ichishdan oldin shifokor bilan bog‘laning"` va shifokor paneliga darhol qizil bayroq (`MEDICATION_MISMATCH`) tushadi.

#### C. Aqlli Dori Qoldig‘i Hisoblagichi (Smart Refill Counter)
* Reja boshida qutidagi tabletkalar soni kiritiladi (masalan, $\text{pill\_count} = 30$).
* Har safar `[Ichdim]` bosilganda $\text{remaining\_pills} = \text{remaining\_pills} - \text{dose\_count}$ bo‘ladi.
* Qachonki $\text{remaining\_pills} \le 5\text{ kunlik me’yor}$ bo‘lsa, bemor ekranida va uzoqdagi farzandning ("Yaqinim") sahifasida sariq ogohlantirish yonadi: *"Amlodipin tugashiga 4 kun qoldi"*.

---

### 3-MODUL: Kamera va Poza Tahliliga Asoslangan Mashq Motori (Exercise Engine)
Bu modul loyihaning asosiy texnik "Wow" qismi bo‘lib, **MediaPipe Pose Landmarker (WebAssembly/WebGL)** yordamida to‘liq brauzerning o‘zida ishlaydi.

#### A. Bo‘g‘im Nuqtalari va Matematik Hisoblash
MediaPipe Pose inson tanasidagi $33\text{ ta}$ nuqtani (`landmarks`) topadi. O‘tirib-turish uchun quyidagi nuqtalar olinadi:
* Chap tomon: Yelka ($11$), Son/Chanoq ($23$), Tizza ($25$), To‘piq ($27$), Bilak ($15$).
* O‘ng tomon: Yelka ($12$), Son/Chanoq ($24$), Tizza ($26$), To‘piq ($28$), Bilak ($16$).

Tizim har bir kadrda qaysi tomonning o‘rtacha ko‘rinish bali (`visibility`) yuqori bo‘lsa, o‘sha tomonni avtomatik tanlaydi. Son $A(x_1, y_1)$, Tizza $B(x_2, y_2)$ va To‘piq $C(x_3, y_3)$ nuqtalari orasidagi tizza burchagi $\theta$ quyidagi formula bilan hisoblanadi:
$$\theta = \left| \text{atan2}(y_3 - y_2, x_3 - x_2) - \text{atan2}(y_1 - y_2, x_1 - x_2) \right| \times \frac{180^\circ}{\pi}$$
Agar $\theta > 180^\circ$ bo‘lsa, $\theta = 360^\circ - \theta$ olinadi. Kadrlar orasidagi titrashni (jitter) yo‘qotish uchun burchak oxirgi $5\text{ ta}$ kadrning sirpanuvchi o‘rtachasi (Moving Average) orqali silliqlanadi:
$$\bar{\theta}_t = \frac{1}{5} \sum_{i=0}^{4} \theta_{t-i}$$

#### B. Sozlamaga Asoslangan Motor va 2 Xil Preset (JSON Config)
Mashq motori kodni o‘zgartirmasdan JSON konfiguratsiya orqali boshqariladi. MVPda **bitta motorda 2 xil klinik preset** ishlaydi:

1. **Preset 1: Reabilitatsiya o‘tirib-turish (`rehab_sit_to_stand`)**
   * **Maqsad:** Operatsiya yoki jarohatdan keyin bo‘g‘im harakat diapazonini (Range of Motion) xavfsiz tiklash.
   * **Parametrlar:** `stand_angle_min` (standart $160^\circ$), `sit_angle_max` (shifokor belgilaydi, masalan $105^\circ$ yoki bemorning shaxsiy *Baseline* burchagi), `target_reps` (masalan, $10\text{ ta}$).
2. **Preset 2: CDC STEADI 30-soniyalik Stul Testi (`cdc_30s_chair_stand`)**
   * **Maqsad:** Keksalarda oyoq kuchi va yiqilish xavfini baholash xalqaro standarti.
   * **Parametrlar:** `duration_limit_s = 30`, `arms_crossed_required = true`.
   * **Qo‘l holati tekshiruvi:** Bilak nuqtalari ($15, 16$) qarama-qarshi yelka/ko‘krak nuqtalariga ($11, 12$) yaqin turgani tekshiriladi. Agar bemor tizzasiga tayanib tursa, ekranda ogohlantirish chiqadi.

#### C. Shaxsiy "Baseline" (Boshlang‘ich Qulay Burchakni Kalibrlash)
Universal "to‘g‘ri" burchak bo‘lmagani sababli, 1-urinishda bemor `"Mening qulay chegaramni o‘lchash"` tugmasini bosib, og‘riqsiz 2 marta o‘tirib-turadi. Tizim uning minimal burchagini (masalan, $\theta_{\text{baseline}} = 115^\circ$) saqlab oladi va keyingi kunlarda progressni shu burchakka nisbatan o‘lchaydi ($115^\circ \rightarrow 110^\circ \rightarrow 102^\circ$).

#### D. Holat Mashinasi (Hysteresis State Machine)
Titrash tufayli bitta o‘tirishni 3 marta sanab yubormaslik uchun ikki chegarali holat mashinasi ishlaydi:
* `WAITING_FOR_BODY`: Son, tizza va to‘piq nuqtalarining `visibility` bali $< 0.65$ bo‘lsa, sanash to‘xtatiladi va ekranda *"Iltimos, 2 qadam orqaga yuring, oyoqlaringiz to‘liq ko‘rinsin"* yozuvi chiqadi.
* `STANDING`: $\bar{\theta}_t \ge \theta_{\text{stand\_min}}$ (masalan, $\ge 160^\circ$).
* `DESCENDING`: Burchak pasayishni boshladi ($\bar{\theta}_t < 150^\circ$). Bu fazada erishilgan eng kichik burchak $\theta_{\min}$ eslab boriladi.
* `BOTTOM_REACHED`: $\bar{\theta}_t \le \theta_{\text{sit\_max}}$ kamida $3\text{ ta}$ ketma-ket kadr davomida ushlandi.
* `ASCENDING` $\rightarrow$ `STANDING`: Bemor qayta $\bar{\theta}_t \ge 160^\circ$ holatiga chiqdi:
  * Agar `BOTTOM_REACHED` bo‘lgan bo‘lsa $\rightarrow$ **To‘liq takror ($\text{valid\_reps} + 1$)**.
  * Agar bemor yarmigacha o‘tirib ($\theta_{\min} > \theta_{\text{sit\_max}}$) qaytib turib ketgan bo‘lsa $\rightarrow$ **Sayoz takror ($\text{shallow\_reps} + 1$)** va ekranda *"Biroz chuqurroq o‘tiring (agar og‘riq bo‘lmasa)"* izohi chiqadi.

#### E. Ishonch Bali (Confidence Score) Hisoblash
Har bir mashq sessiyasi yakunida $\text{confidence} \in [0, 1]$ quyidagicha hisoblanadi:
$$\text{confidence} = 0.6 \times (\text{mean\_landmark\_visibility}) + 0.4 \times \left(\frac{\text{valid\_pose\_frames}}{\text{total\_frames}}\right)$$
Agar $\text{confidence} < 0.75$ bo‘lsa, natija avtomatik ravishda `"Ishonch past — shifokor ko‘rigi tavsiya etiladi"` deb belgilanadi.

#### F. Ikki Xil Ishlash Rejimi va Aldovga Qarshi 5 Qatlamli Himoya (Anti-Cheat)
1. **Jonli Kamera (`live_camera`) va Video Yuklash (`uploaded_file`):** Hakamlar kostyum-shimda kamera oldida squat qilmasdan ham tizimni sinab ko‘rishi uchun `"Yozilgan videoni yuklab tahlil qilish"` tugmasi va 2 ta tayyor demo video bo‘ladi. Ikkalasi ham aynan bir xil MediaPipe pipeline’dan o‘tadi, ammo bazada manbasi aniq farqlanadi.
2. **Kunlik hisobga olinadigan 1 ta asosiy urinish:** Kunlik vazifa foizini sun’iy oshirmaslik uchun kuniga faqat 1-to‘liq urinish asosiy hisobga (`is_primary_daily = true`) kiradi, qolganlari `"Qo‘shimcha mashq"` bo‘lib saqlanadi.
3. **SHA-256 Fayl Xeshi (Web Crypto API):** Yuklangan video faylning brauzerda SHA-256 xeshi olinadi (`crypto.subtle.digest('SHA-256', buffer)`). Agar bu xesh bazada avval ishlatilgan bo‘lsa, tizim darhol *"Bu video fayl avval yuklangan!"* deb rad etadi.
4. **20-Nuqtali Harakat Imzosi (Motion Signature):** Har bir mashq davomida tizza burchagi egri chizig‘i vaqt bo‘yicha 20 ta teng nuqtaga normalizatsiya qilinadi: $V = [\theta_1, \theta_2, \dots, \theta_{20}]$. Yangi urinish vektori oldingi urinishlar bilan O‘rtacha Absolyut Farq (MAE) bo‘yicha solishtiriladi:
   $$\text{MAE} = \frac{1}{20} \sum_{i=1}^{20} \left| V_{\text{new}, i} - V_{\text{old}, i} \right|$$
   Haqiqiy inson ikki marta aynan bir xil millisekund va gradusda harakat qilmaydi. Agar $\text{MAE} < 1.5^\circ$ chiqsa, tizim buni `"Takroriy video shubhasi (Replay suspected)"` deb belgilaydi va shifokor ko‘rigiga yuboradi.
5. **Og‘riq va Favqulodda To‘xtatish Tugmasi:** Kamera ekranida doim katta qizil `[Og‘riq bor — To‘xtatish]` tugmasi turadi. Bosilsa, mashq darhol to‘xtaydi, shifokorga qizil bayroq ketadi va bemorga dam olish aytiladi.

---

### 4-MODUL: Tibbiy O‘lchovlar (BosimDaftar) va Qadamlar (Step Tracker)

#### A. Qon Bosimi va Puls (BosimDaftar)
* **Qo‘lda yoki Foto-OCR orqali:** Bemor tonometr ekranini suratga oladi $\rightarrow$ Vision AI `systolic`, `diastolic` va `pulse` raqamlarini o‘qiydi $\rightarrow$ Bemor tasdiqlaydi (2-darajali dalil).
* Shuningdek, simptomlar chekboksi bor: `[ ] Bosh og‘rig‘i`, `[ ] Bosh aylanishi`, `[ ] Ko‘krak qafasida noqulaylik`.

#### B. Kunlik, Haftalik va Oylik Qadamlar
* Bemor kunlik qadamini qo‘lda kiritadi (0-daraja) yoki telefonidagi pedometr ilovasi (Google Fit, Samsung Health, Apple Health) skrinshotini yuklaydi $\rightarrow$ Vision AI qadam sonini o‘qiydi $\rightarrow$ Bemor tasdiqlaydi (2-daraja).
* Bemor ekranida 3 ta progress bar ko‘rinadi: **Bugungi maqsad** (masalan, $4500 / 6000$), **Haftalik maqsad** ($28,000 / 42,000$) va **Oylik maqsad** ($110,000 / 180,000$).

---

### 5-MODUL: Mustaqil Foydalanuvchi Rejimi va Xavfsizlik Filtrli AI Tavsiyasi
Shifokorsiz kirgan foydalanuvchi (`role = individual`) uchun:
1. **Xavfsizlik So‘rovnomasi (PAR-Q+ ga asoslangan 4 ta savol):**
   * *1. Yosh guruhingiz?*
   * *2. Oxirgi 3 oyda bo‘g‘im yoki yurak operatsiyasini o‘tkazganmisiz?*
   * *3. Jismoniy harakat paytida ko‘krak og‘rig‘i yoki kuchli bosh aylanishi bo‘ladimi?*
   * *4. Asosiy maqsadingiz (Umumiy faollik / Oyoq kuchini oshirish / Kunlik yurish)?*
2. **Kodda Yozilgan Xavfsizlik Filtri:** Agar 2- yoki 3-savolga `"Ha"` deb javob berilsa, AI tavsiya bermaydi! Ekranda *"Sizda tibbiy cheklovlar bo‘lishi mumkin. Mashq boshlashdan oldin shifokor bilan maslahatlashing"* yozuvi chiqadi.
3. **AI Tavsiyasi:** Agar xavfsiz bo‘lsa, LLM faqat tasdiqlangan kutubxonadagi shablonlardan mosini tanlaydi va nima uchun shu reja tanlanganini o‘zbek tilida sodda tushuntirib beradi. Vazifa `created_by = self` va `"AI tavsiyasi — shifokor tasdiqlamagan"` yorlig‘i bilan saqlanadi.

---

### 6-MODUL: Qat’iy Qoidalar Dvigateli (Rules Engine) va Shifokor Halqasi

#### A. Qoidalar Dvigateli (AI emas, deterministik JSON + Kod)
Har bir yangi `task_log` yozilganda backenddagi `evaluate_rules()` funksiyasi ishlaydi:

| Qoida ID | Shart (Condition) | Bayroq (Severity) | Tizim Harakati |
| :--- | :--- | :--- | :--- |
| `EMERGENCY_SYMPTOM` | Ko‘krak og‘rig‘i yoki nafas qisishi belgilandi | **CRITICAL (`103`)** | Ekranda qizil modal: *"Darhol 103 Tez yordamga qo‘ng‘iroq qiling!"* + Shifokorga xabar. |
| `BP_HIGH_RED` | $\text{sys} \ge \text{doctor\_red\_sys}$ (masalan, $160$) YOKI ($\text{sys} \ge 150$ VA bosh og‘rig‘i bor) | **RED (Qizil)** | Shifokor panelida 1-o‘ringa chiqadi + $30\text{ daqiqadan}$ so‘ng qayta o‘lchash tavsiyasi. |
| `MED_MISMATCH` | Dori qutisidagi doza $\ne$ Rejadagi doza | **RED (Qizil)** | Dorini ichmaslik haqida ogohlantirish + Shifokor ko‘rib chiqish navbatiga tushirish. |
| `EXERCISE_PAIN` | Mashq paytida `"Og‘riq bor"` tugmasi bosildi | **RED (Qizil)** | Mashq to‘xtatiladi + Shifokor navbatiga tushadi. |
| `LOW_CONFIDENCE_CLIP` | Mashq $\text{confidence} < 0.75$ YOKI $\text{shallow\_reps} > 3$ YOKI $\text{MAE} < 1.5^\circ$ | **YELLOW (Sariq)** | Bemordan rozilik so‘raladi: *"Qisqa klipni shifokor ko‘rib berishi uchun yuboraylikmi?"* |
| `MISSED_2_DAYS` | Ketma-ket $2\text{ kun}$ vazifalar bajarilmadi | **YELLOW (Sariq)** | Oila a’zosi ("Yaqinim") sahifasida va shifokor panelida sariq bayroq. |

#### B. Shifokorning "Istisnolar Paneli" (Exception Dashboard)
Shifokor tizimga kirganda $50\text{ ta}$ bemorning barcha loglarini o‘qib o‘tirmaydi:
1. **Ustuvorlik bo‘yicha saralash:** Tepa qismda faqat **Qizil** va **Sariq** bayroqli bemorlar turadi.
2. **AI Siqilgan Xulosasi (3 qatorli):** Shifokor bemor kartasini ochganda, LLM oxirgi 7 kunlik loglar asosida qisqa faktik xulosa chiqaradi:
   > *"Anvar aka (60 yosh): Oxirgi 7 kunda dori qabuli $85\%$. Kecha yangi dori qutisini yuklaganda doza farqi ($10\text{ mg}$ vs $5\text{ mg}$) aniqlandi. O‘tirib-turish mashqida minimal burchak $118^\circ$ dan $106^\circ$ ga yaxshilangan, ammo bugungi urinishda og‘riq belgilandi."*
3. **Video Ko‘rib Chiqish Navbati (`review_requests`):** Agar bemor rozilik berib $10\text{ soniyalik}$ klipini yuborgan bo‘lsa, shifokor uni ko‘radi va 3 ta tugmadan birini bosadi:
   * `[Tasdiqlash (4-darajali dalil)]`
   * `[Izoh yozish / Burchakni yumshatish]`
   * `[Qabulga chaqirish]`

---

## 5. TEXNIK ARXITEKTURA VA MA’LUMOTLAR BAZASI SXEMASI

### 5.1. Texnologik Stek (Tez quriladigan va barqaror ishlaydigan)
Hakamlar bitta havola orqali muammosiz kirishi va Grand Finalgacha server uxlab qolmasligi uchun eng optimal stek:
* **Frontend & Fullstack Framework:** **Next.js 14 (App Router, TypeScript)** + **Tailwind CSS** + **Lucide Icons** + **Recharts** (grafiklar uchun).
* **On-Device Computer Vision:** `@mediapipe/tasks-vision` (`PoseLandmarker` WebAssembly modeli, CDN orqali brauzerda yuklanadi).
* **Backend API:** Next.js Route Handlers (`/api/...`) yoki alohida **Python FastAPI** (agar jamoa Pythonda tezroq yozsa). *Maslahat: Next.js API Routes + Prisma/SQLite (yoki Supabase/Neon PostgreSQL) qilsangiz, bitta repozitoriy va bitta deploy bilan ham frontend, ham backend muammosiz ishlaydi!*
* **Ma’lumotlar Bazasi:** **PostgreSQL** (Supabase / Neon bepul doimiy tarifi) yoki **SQLite** (agar bitta VPS/Railway serverda tursa).
* **AI Modellar (Server-side API orqali):** **Google Gemini 1.5 Flash** yoki **OpenAI GPT-4o-mini** (Multimodal Vision OCR + JSON Structured Outputs uchun juda tez va arzon).

### 5.2. Ma’lumotlar Bazasi Jadvallari (To‘liq Sxema)

#### 1. `users` (Foydalanuvchilar)
* `id` (UUID, PK)
* `name` (String) — masalan: *"Dr. Sardor Karimov"*, *"Anvar aka Toshmatov (60 yosh, Farg‘ona)"*
* `role` (Enum: `'doctor'`, `'patient'`, `'individual'`)
* `age` (Integer, nullable)
* `condition_summary` (String, nullable) — masalan: *"Tizza artrozi reabilitatsiyasi va Gipertoniya"*
* `caregiver_token` (String, unique) — "Yaqinim" oila rejimi uchun maxfiy read-only token
* `created_at` (Timestamp)

#### 2. `care_links` (Shifokor va Bemor bog‘lanishi)
* `id` (UUID, PK)
* `doctor_id` (UUID, FK $\rightarrow$ `users.id`)
* `patient_id` (UUID, FK $\rightarrow$ `users.id`)
* `status` (Enum: `'active'`, `'paused'`)
* `teach_back_Status` (Enum: `'pending'`, `'verified'`, `'needs_clarification'`)
* `teach_back_patient_text` (Text, nullable)
* `teach_back_ai_feedback` (JSON, nullable)

#### 3. `task_templates` (Tayyor vazifa shablonlari)
* `id` (UUID, PK)
* `title_uz` (String)
* `type` (Enum: `'medication'`, `'exercise'`, `'vital_bp'`, `'steps'`)
* `default_target` (Float)
* `default_unit` (String) — `'mg'`, `'reps'`, `'mmHg'`, `'steps'`
* `default_period` (Enum: `'daily'`, `'weekly'`, `'monthly'`)
* `config_json` (JSON) — bo‘g‘im nuqtalari, burchaklar, xavfsizlik eslatmalari

#### 4. `tasks` (Foydalanuvchiga biriktirilgan aniq vazifalar)
* `id` (UUID, PK)
* `user_id` (UUID, FK $\rightarrow$ `users.id`)
* `created_by_id` (UUID, FK $\rightarrow$ `users.id`)
* `created_by_role` (Enum: `'doctor'`, `'self'`, `'ai_suggested'`)
* `shared_with_doctor` (Boolean, default `true` for patient, `false` for individual)
* `type` (Enum: `'medication'`, `'exercise'`, `'vital_bp'`, `'steps'`)
* `title` (String) — masalan: *"Amlodipin 5 mg (Ertalab)"* yoki *"Stuldan o‘tirib-turish mashqi"*
* `target_value` (Float) — masalan: `10` (takror) yoki `6000` (qadam)
* `period` (Enum: `'daily'`, `'weekly'`, `'monthly'`)
* `params_json` (JSON):
  * Dori uchun: `{"drug_name": "Amlodipin", "strength_mg": 5, "form": "tabletka", "Schedule": "08:00", "total_pills": 30, "remaining_pills": 4}`
  * Mashq uchun: `{"preset": "rehab_sit_to_stand", "stand_angle_min": 160, "sit_angle_max": 105, "baseline_angle": 115, "arms_crossed": false}`
  * Bosim uchun: `{"max_sys_yellow": 145, "max_sys_red": 160, "max_dia_red": 100}`

#### 5. `task_logs` (Bajarilgan vazifalar va Dalil narvoni yozuvlari)
* `id` (UUID, PK)
* `task_id` (UUID, FK $\rightarrow$ `tasks.id`)
* `user_id` (UUID, FK $\rightarrow$ `users.id`)
* `value_numeric` (Float) — bajarilgan son (masalan, `9` takror, `158` sistolik bosim, `5200` qadam)
* `value_secondary` (Float, nullable) — diastolik bosim (`96`)
* `source_type` (Enum: `'manual_button'`, `'photo_ocr'`, `'live_camera'`, `'uploaded_video'`)
* `evidence_level` (Integer: `0`, `1`, `2`, `3`, `4`)
* `confidence` (Float, nullable) — masalan, `0.86`
* `is_primary_daily` (Boolean) — kunlik 1 ta asosiy natija qoidasi uchun
* `file_sha256` (String, nullable) — yuklangan video xeshi
* `motion_signature` (JSON, nullable) — $20\text{ ta}$ burchak nuqtasidan iborat массив `[165, 152, 130, 104, ...]`
* `details_json` (JSON) — `{"valid_reps": 9, "shallow_reps": 1, "min_angle_deg": 102, "pain_reported": false, "symptoms": ["headache"], "ocr_extracted": {...}}`
* `flag_color` (Enum: `'green'`, `'yellow'`, `'red'`, `'critical'`)
* `flag_reason` (String, nullable)
* `created_at` (Timestamp)

#### 6. `review_requests` (Shifokor ko‘rib chiqish navbati va Video roziligi)
* `id` (UUID, PK)
* `log_id` (UUID, FK $\rightarrow$ `task_logs.id`)
* `patient_id` (UUID, FK $\rightarrow$ `users.id`)
* `doctor_id` (UUID, FK $\rightarrow$ `users.id`)
* `reason` (String) — masalan: *"Past ishonch (0.68) va 2 ta sayoz takror"*, *"Dori dozasi farqi (10mg vs 5mg)"*
* `consent_given` (Boolean) — bemor rozilik berdimi
* `consent_timestamp` (Timestamp)
* `media_data_url` (Text, nullable) — qisqa klip yoki dori qutisi surati
* `status` (Enum: `'pending'`, `'approved'`, `'retry_requested'`, `'visit_requested'`)
* `doctor_comment` (Text, nullable)
* `reviewed_at` (Timestamp, nullable)

---

## 6. AI PROMPTLAR VA FUNKSIYALAR SPETSIFIKASIYASI

Tizimda LLM/Vision API faqat **4 ta aniq, chegaralangan nuqtada** chaqiriladi va har doim qat’iy JSON qaytaradi (agar API ishlamay qolsa, tizim to‘xtab qolmasligi uchun `try/catch` fallback mavjud):

### 6.1. Endpoint 1: `/api/ai/verify-medication` (DoriMos OCR)
* **Kirish:** Dori qutisi rasmi (base64) + Shifokor tayinlagan dori (`params_json`).
* **System Prompt:**
  > "Sen tibbiy yorliqlarni o‘quvchi OCR yordamchisan. Foydalanuvchi yuborgan dori qutisi suratidan faqat bosma yozuvdagi dori nomini (`drug_name`), dozasi/kuchini milligrammda (`strength_mg` - faqat raqam) va shaklini (`form`) ajratib ol. Agar yozuv xira yoki ko‘rinmasa, `is_readable: false` qaytar. Hech qachon tibbiy maslahat berma. Faqat JSON qaytar."

### 6.2. Endpoint 2: `/api/ai/verify-vitals-or-steps` (Tonometr va Qadam Skrinshoti OCR)
* **Kirish:** Tonometr ekrani yoki qadam ilovasi skrinshoti (base64) + `type` (`'vital_bp'` yoki `'steps'`).
* **System Prompt:**
  > "Rasmda tonometr ekrani yoki qadam o‘lchagich skrinshoti berilgan. Agar tonometr bo‘lsa `systolic`, `diastolic`, `pulse` butun sonlarini, agar qadam skrinshoti bo‘lsa `steps` butun sonini JSON shaklida ajrat. O‘qib bo‘lmasa `is_readable: false` qaytar."

### 6.3. Endpoint 3: `/api/ai/teach-back` (Mini "Tushundimmi?" tekshiruvi)
* **Kirish:** Shifokor rejasining matni + Bemorning o‘z so‘zi bilan yozgan javobi.
* **System Prompt:**
  > "Shifokor ko‘rsatmasi va bemorning javobini solishtir. Bemor dori vaqtini va mashq sonini to‘g‘ri tushunganini tekshir. JSON qaytar: `{\"status\": \"verified\" | \"needs_clarification\", \"missing_or_wrong\": \"...\", \"friendly_explanation_uz\": \"...\"}`. O‘zingdan yangi davolash qo‘shma, faqat shifokor matniga tayan."

### 6.4. Endpoint 4: `/api/ai/doctor-summary` (Shifokor uchun 3 qatorli xulosa)
* **Kirish:** Bemorning oxirgi 7 kunlik `task_logs` massivi (JSON).
* **System Prompt:**
  > "Quyidagi 7 kunlik bemor loglari asosida shifokor uchun 3 ta qisqa jumlada faktik xulosa yoz (o‘zbek tilida): 1) Dori va qadamlarni bajarish foizi, 2) Mashq burchagi dinamikasi, 3) Qizil/sariq bayroqlar sababi. Tashxis qo‘yma va dori dozasini o‘zgartirishni buyurma."

---

## 7. EKRANLAR TUZILMASI VA HAKAMLAR UCHUN DEMO YO‘LI (UI/UX FLOW)

Hakamlar ilovani ochganda hech qanday tushunmovchilik bo‘lmasligi uchun ekranning eng yuqori qismida doim **"Judge Demo Switcher" (Hakamlar uchun tez rol almashtirish paneli)** turadi:
`[ 👨‍⚕️ Shifokor Paneli ]` | `[ 👴 Bemor: Anvar aka ]` | `[ 🏃 Mustaqil Foydalanuvchi ]` | `[ 👨‍👩‍👦 Yaqinim (Malayziyadagi farzand) ]`

### 1-Ekran: Bemor Asosiy Ekrani (`Bemor: Anvar aka, 60 yosh, Farg‘ona`)
* **Yuqori qism:** Favqulodda holat uchun doimiy `[ 🚑 103 Tez yordam ]` tugmasi + Rejani tushunganlik holati (*"Reja tasdiqlangan ✅"*).
* **Kunlik / Haftalik / Oylik Progress kartalari:** 3 ta vizual halqa yoki progress bar.
* **Bugungi Vazifalar Ro‘yxati (4 ta katta, aniq karta):**
  1. **Dori:** *Amlodipin 5 mg* (Qutida 4 dona qoldi ⚠️) $\rightarrow$ Tugmalar: `[✅ Ichdim]`, `[📷 DoriMos: Qutini tekshirish]`, `[❌ Icha olmadim]`.
  2. **Reabilitatsiya mashqi:** *Stuldan o‘tirib-turish (10 marta, maqsad burchak $\le 105^\circ$, shaxsiy baseline $115^\circ$)* $\rightarrow$ Tugmalar: `[🎥 Jonli Kamerada Bajarish]`, `[📁 Yozilgan Videoni Tahlil Qilish]`.
  3. **Qon bosimi:** *Ertalabki va kechki o‘lchov (Chegara: $< 150/95$)* $\rightarrow$ Tugmalar: `[🔢 Kiritish / 📷 Tonometr surati]`.
  4. **Qadamlar:** *Kunlik 6,000 qadam (Haftalik: 28,400 / 42,000)* $\rightarrow$ Tugmalar: `[👟 Qadam qo‘shish / Skrinshot]`.

### 2-Ekran: Kamera Mashq Ekrani (MediaPipe Pose Modal)
* **Chap/Markaziy qism:** Video oqimi (yoki yuklangan video) ustida yashil/qizil chiziqlarda **3D Skelet (`landmarks`)** jonli chiziladi va tizza yonida joriy burchak (masalan, `$102^\circ$`) katta raqamda ko‘rinib turadi.
* **Preset tanlash:** `[ Preset 1: Reabilitatsiya Squat ]` yoki `[ Preset 2: CDC 30s Stul Testi ]` + `[ 📏 Baseline Kalibrlash ]`.
* **O‘ng panel (Real-vaqt ko‘rsatkichlari):**
  * To‘liq takrorlar: `8 / 10`
  * Sayoz (chala) takrorlar: `1`
  * Minimal burchak: `$101^\circ$` (Baseline `$115^\circ$` dan `$+14^\circ$` yaxshilandi!)
  * Kadr va Poza Ishonchi (Confidence): `88%`
  * Aldov tekshiruvi: `SHA-256: Yagona fayl ✅ | Harakat imzosi: Haqiqiy ✅`
* **Pastki panel:** Katta qizil `[ 🛑 Og‘riq bor — To‘xtatish ]` va `[ ✅ Natijani Saqlash ]`.
* **Past ishonch yoki og‘riq bo‘lganda chiqadigan oyna:** *"Ishonch ko‘rsatkichi past (68%) yoki og‘riq belgilandi. Shifokor ko‘rib berishi uchun 10 soniyalik yozuvni yuborishga rozimisiz? [Roziman va Yuboraman] / [Faqat raqamni saqlash]"*.

### 3-Ekran: Shifokor "Istisnolar Paneli" (`Dr. Sardor Karimov`)
* **Statistika xulosasi:** Jami bemorlar: `24 ta` | 🔴 Qizil bayroq: `2 ta` | 🟡 Sariq bayroq: `3 ta` | 🟢 Me’yorda: `19 ta` (yashirilgan, filtrni bossa ko‘rinadi).
* **Bemor Kartasi (Anvar aka — 🔴 QIZIL BAYROQ):**
  * **Bayroq sabablari:** `1) DoriMos: Qutida 10 mg o‘qildi (rejada 5 mg)` | `2) Bosim 162/98 + Bosh og‘rig‘i`.
  * **AI 3-qatorli Xulosa:** Oxirgi 7 kunlik dinamika.
  * **Grafiklar:** Tizza burchagi yaxshilanishi grafigi ($118^\circ \rightarrow 102^\circ$) va Qon bosimi grafigi.
  * **Ko‘rib chiqish navbati (`Review Queue`):** Bemor roziligi bilan kelgan mashq klipi / dori qutisi surati.
  * **Harakat tugmalari:** `[✅ Ko‘rib chiqildi (4-daraja)]`, `[⚙️ Burchak chegarasini o‘zgartirish]`, `[📞 Qabulga chaqirish]`, `[📤 DMED Mock JSON Eksport]`.

### 4-Ekran: "Yaqinim" — Malayziyadagi Farzand Oynasi
* Bemorning farzandi uchun sodda, xotirjamlik beruvchi oyna:
  * *"Otam — Anvar aka (Farg‘ona). Bugungi holat: Mashq bajarildi (9/10), ertalabki bosim o‘lchandi, ammo Amlodipin dorisi tugashiga 4 kun qoldi."*

---

## 8. QATLAMLI QURISH REJASI (LAYERED BUILD PLAN)

Vaqtni hisoblamasdan, ammo har bir bosqich yakunida **to‘liq ishlaydigan mahsulot** bo‘lishini ta’minlaydigan 4 ta qatlam:

### 1-Qatlam: Yadro Sikl va Ma’lumotlar Bazasi (Foundation)
* [ ] Loyiha karkasini (Next.js + Tailwind + DB) ko‘tarish va **birinchi kuniyoq Vercel/Railway’ga deploy qilish**.
* [ ] Yuqori panelda 4 ta rol uchun **Demo Switcher** (login parol terib o‘tirmasdan bir klikda rol almashtirish + login formasi).
* [ ] Sintetik ma’lumotlar (Seed Data): Anvar aka (Qizil bayroq), Dilnoza opa (Sariq bayroq), Rustam aka (Yashil holat)ning 7 kunlik tarixi.
* [ ] Shifokor tomonidan shablon tanlab reja yaratish va bemor tomonidan 0-darajali tugmalar (`Ichdim`, bosim va qadam kiritish) orqali bajarish.
* [ ] Kunlik, haftalik va oylik progress hisob-kitobi hamda Qoidalar dvigateli (JSON Rules).

### 2-Qatlam: Kamera Mashq Motori va Vision AI (Asosiy Texnik Ustunlik)
* [ ] Brauzerda **MediaPipe Pose Landmarker** integratsiyasi, bo‘g‘im burchagi hisoblagichi va holat mashinasi (`STANDING` $\leftrightarrow$ `BOTTOM_REACHED`).
* [ ] 2 ta Preset: *Rehab Squat* (shaxsiy *Baseline* kalibrlash bilan) va *CDC 30-soniyalik Stul Testi*.
* [ ] **Jonli kamera** va **Yozilgan videoni yuklab tahlil qilish** rejimlari + 2 ta tayyor demo video.
* [ ] Aldovga qarshi 3 ta mexanizm: Kunlik 1 ta asosiy natija limiti, **SHA-256 fayl xeshi** va **20-nuqtali harakat imzosi (MAE)**.
* [ ] **DoriMos** (dori qutisi OCR + doza solishtirish) va **Tonometr/Qadam OCR** endpointlarini ulash.

### 3-Qatlam: Shifokor Halqasi va Rozilik Oqimi (The Loop)
* [ ] Past ishonch ($\text{confidence} < 0.75$), sayoz takrorlar, dori nomuvofiqligi yoki og‘riq tugmasi bosilganda rozilik oynasini chiqarish va `review_requests` jadvaliga yuborish.
* [ ] Shifokor panelida kelgan so‘rovni ko‘rish, `[Tasdiqlash]` bosilganda vazifa logini **4-darajali dalil (`CLINICIAN_REVIEWED`)** ga ko‘tarish va bemor ekranida shifokor javobini ko‘rsatish.

### 4-Qatlam: Yuqori Ball Olib Beruvchi Qo‘shimchalar (Polish & Differentiators)
* [ ] **"Yaqinim" (Caregiver Link)** sahifasi va **Dori qoldig‘i hisoblagichi (Smart Refill Counter)**.
* [ ] **Mini "Tushundimmi?" (Teach-back)** — reja qabul qilinganda 1 ta savol bilan tushunganlikni tekshirish.
* [ ] **Mustaqil foydalanuvchi** uchun PAR-Q xavfsizlik filtrli AI vazifa tavsiyasi.
* [ ] Shifokor panelida `[📤 DMED Mock JSON Eksport]` tugmasi.

---

## 9. HALOLLIK JADVALI VA TA’SIRNI (IMPACT - 20 BALL) ISBOTLASH REJASI

### 9.1. Nima Real Ishlaydi va Nima Simulyatsiya (Platforma Note uchun)
UzHack qoidalariga (3.1.4 va 3.2.4-bandlar) muvofiq, topshirish vaqtida quyidagi jadvalni ochiq ko‘rsatamiz:

| Tizim Qismi | MVPdagi Holati | Izoh |
| :--- | :--- | :--- |
| **Kamera orqali poza va burchak tahlili** | **100% Real** | Brauzerda MediaPipe Pose orqali jonli kamerada va yuklangan videoda ishlaydi. |
| **SHA-256 xesh va 20-nuqtali harakat imzosi** | **100% Real** | Web Crypto API va burchak vektorlari orqali real hisoblanadi. |
| **DoriMos (quti OCR) va Tonometr OCR** | **100% Real** | Vision LLM orqali real suratdan o‘qiydi va kod qoidasi bilan solishtiradi. |
| **Qoidalar dvigateli va Shifokor halqasi** | **100% Real** | Bemor kiritgan har bir o‘zgarish shifokor panelida real vaqtda bayroq ko‘taradi. |
| **Bemorlar va 7 kunlik tarixiy grafiklar** | **Sintetik (Simulated)** | Maxfiylik qoidasiga ko‘ra real bemor ma’lumotlari emas, sintetik profillar ishlatilgan. |
| **SMS / Telegram eslatmalar va DMED ulanishi** | **Simulyatsiya / Mock** | DMED uchun standartga mos JSON eksport tugmasi ko‘rsatilgan (Production API ruxsati talab etiladi). |

### 9.2. "Impact" (20 Ball) Mezonini Halol va Kuchli Yopish: Mini-Aniqlik Sinovi
Real bemorlar bazasi bo‘lmagan hackathon sharoitida hakamlarni qoyil qoldirish uchun jamoaning 3 a’zosi MVP tayyor bo‘lgach **15 daqiqalik real texnik sinov (Mini-Benchmark)** o‘tkazadi va natijasini Dashboardda ko‘rsatadi:
1. Jamoa a’zolari **10 ta qisqa o‘tirib-turish videosini** (yaxshi yorug‘likda, xira yorug‘likda, yarim o‘tirib, to‘liq o‘tirib) yozib oladi (jami masalan $100\text{ ta}$ takror).
2. Videolarni tizimga kiritib, haqiqiy natijani jadvalga yozadi:
   * *To‘g‘ri kadr va yorug‘likda sanash aniqligi:* $X / Y$ ($\%$)
   * *Sayoz (chala) takrorlarni tutish aniqligi:* $X / Y$
   * *Dori qutisi dozasini (5 mg vs 10 mg) farqlash:* $5\text{ ta}$ quti suratidan $5\text{ tasi}$ to‘g‘ri ajratildi.
3. Bu to‘qima statistika emas, balki **o‘z tizimingizda o‘tkazilgan real muhandislik sinovi** bo‘lib, hakamlar oldida ishonchni maksimal darajaga ko‘taradi.