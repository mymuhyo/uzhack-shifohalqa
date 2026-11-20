# ShifoHalqa · Task 2 ish rejasi

**19-noyabr 2026. Task 1 topshirilgan** (jamoa xabari). **Task 2 — 22-noyabr.** Ish jadvali bo‘yicha oxirgi vaqt 23:59 MYT / 20:59 UZT. Tashkilotchi sayti 22-noyabrni tasdiqlaydi. Topshirishda Platform ko‘rsatgan vaqt ustuvor. Mahalliy brief v1.0 dagi 12/15-noyabr sanalari eski. Hakam brauzerda kamida bitta ishni boshidan oxirigacha bajarishi kerak. Task 2 umumiy ballning 70 foizi. [UzHack](https://uzhack.uz/en) · [Rasmiy shartlar](https://uzhack.uz/en/terms) · [Brief, §3–4](brief/uzhack-online-stage-tasks-en.pdf)

**Birinchi demo.** Shifokor Anvar aka uchun uy rejasini biriktiradi. Bemor telefonida «Icha olmadim → Dori tugadi» deb belgilaydi. Shifokor navbatda sababni ko‘radi, aynan shu yozuvni ochib bemorga keyingi qadam haqida xabar qoldiradi. Bemor «Shifokor ko‘rib chiqdi» degan holatni va unga yozilgan xabarni ko‘radi. Bu yo‘l kamera, Telegram va bulutdagi AI kalitisiz ham to‘liq ishlashi kerak. Ikkinchi demo shu navbatga haqiqiy brauzer o‘lchovini olib keladi.

**Joriy holat.** `codex/dev` da **A–D va F–H** yakunlandi. E da mashq brauzerda tekshirildi va haqiqiy telefon qabuli ochiq. I uchun Codex reliz paketi tayyor. Jamoa HTTPS relizi va Platform topshirishini bajaradi. [Vazifalar jadvali](#ish-jadvali) · [Topshirish paketi](tasks/task-2/PLATFORM_NOTES.md)

## 1. Loyiha auditi va foydalaniladigan qismlar

| 19-noyabrdagi dalil | Rejaga ta’siri |
|---|---|
| Ikkala lokal worktree HEAD’i `f97fca1`. Joriy commitda hujjatlar, rasmiy brief va Task 1 materiallari bor. Ilova manbasi, `package.json`, lockfile va bajariladigan test skriptlari hali yo‘q. `main`da Task 1 matnlarining lokal tahrirlari ham bor. | Eski demo ko‘rsatkichlarini yangi bazaga ko‘chirmaymiz. Birinchi ish ishlaydigan vertikal oqim. Arxivdan tekshirilgan bo‘laklar olinadi. |
| 17-noyabrda to‘rtta prototip tarixga ajratilgan. `~/Projects/uzhack-reference-20261117.tar.zst` ichida Claude prototipining sxemasi va rule testlari, OpenCode kamera va OCR oqimi, Pi bemor kartalari bor. | Codex sxema, reja shablonlari, burchak hisoblash, silliqlash va test misollaridan joriy kontraktga mos bo‘laklarni oladi. Tozalash jurnali Git tarixida saqlangan (`git show f97fca1:PLAN.md`). |
| OpenCode’da yuklangan video ham ekranda «dalil 3» chiqadi. Nol uzunlikdagi suyak vektoridan 180° qaytadi. Pi dori rasmi o‘qilmagan yo‘lda ham `setOcrOk(true)` qiladi. Arxivdagi dori testi ketma-ket qoldirilgan uch dozani, yangi SPEC esa ketma-ket ikki kunni sanaydi. | Regressiya misollari yoziladi. Yetishmagan nuqta «o‘lchab bo‘lmadi» beradi. Kun, doza, urinish va kameraning turi alohida hisoblanadi. |
| OpenCode’dagi `approvePatientLatest` eng yangi qaydni tanlaydi. Antigravity bemor sahifasi taymer va boshlang‘ich 0.88 qiymati bilan L3 ko‘rsatadi. | D kartada bir bemorning ikki qaydi bilan ko‘rik sinovi bor. E kartada ishonch uchun haqiqiy kadrlar talab qilinadi. |
| Task 1 matnida shifokor, bemor, individual foydalanuvchi va yaqin qarindoshga oid to‘rtta ehtiyoj bor. Video ssenariysida esa shifokor, bemor va yaqin inson ko‘rsatilgan. | MVPda ikki faol rol. «Yaqinim» bemor roziligi bilan cheklangan ko‘rish huquqi. Individual mahsulotni alohida sinovga qoldiramiz. |

Texnik kontrakt [SPEC](docs/SPEC.md) da. Quyidagi scope va qoida takliflari kelishilgach, Codex mos SPEC bandlarini va topshirish matnini uyg‘unlashtiradi. Engine bilan UI orasidagi chegara [INTERFACES](docs/INTERFACES.md) da.

## 2. Muammo, yechim va tekshiriladigan va’da

**Platformadagi «Muammo» uchun tahrir taklifi**

> Farg‘onada poliklinika bemoriga uyda dori qabul qilish, bosimni yozish yoki reabilitatsiya mashqini bajarish buyuriladi. Keyingi qabulgacha dori tugagani, bemor nojo‘ya ta’sir sezgani yoki og‘riq sabab mashqni to‘xtatgani shifokorga kech yetishi mumkin. Bemor yoki uning yaqini bu haqda alohida qo‘ng‘iroq qiladi yoki messenjerga yozadi. Shifokorga bugun kim bilan bog‘lanish kerakligini, sababini va qaysi murojaat ko‘rib chiqilganini bir joyda ko‘rish kerak.

**Platformadagi «Yechim» uchun tahrir taklifi**

> ShifoHalqa shifokor yozgan rejani bemorning telefonida kunlik vazifalarga aylantiradi. Bemor bajargan ishini yoki bajarishga nima to‘sqinlik qilganini qayd etadi. Mashq uchun telefon kamerasi takrorlarni qurilmaning o‘zida sanaydi. Shifokor o‘zi belgilagan chegaradan chiqqan o‘lchovni yoki bemor bildirgan muammoni sabab va manbasi bilan ko‘radi. U qaydni ko‘rib, javob qoldiradi. Bemor javobni o‘sha vazifada ko‘radi.

Bu loyiha ta’rifi. Platformada «ishlaydi» degan bandlarni topshiriladigan buildda bajarilgan sinovga qarab yozamiz. Task 1 videosi va lokal ssenariylarni topshirilgan shaklida saqlaymiz.

- **JSST dalili.** 2003-yilgi hisobot rivojlangan mamlakatlarda surunkali kasallik davosiga uzoq muddatli rioya o‘rtacha 50% bo‘lganini bildiradi. Farg‘onaga oid dalil sifatida jamoaning shifokor bilan suhbatini, roziligi bo‘lsa, bitta intervyu deb keltiring. 10–15 daqiqa va 100+ bemor raqamlariga mahalliy o‘lchov bo‘lsa, davri va manbasini qo‘shing. [JSST](https://www.who.int/news/item/01-07-2003-failure-to-take-prescribed-medicine-for-chronic-diseases-is-a-massive-world-wide-problem)
- **Mahalliy taqqoslash.** DMED bemorga qabulga yozilish, natijalar, tibbiy tarix va elektron retseptni taklif qiladi. ShifoHalqa qiymatini retseptdan *keyingi* aniq voqea bilan ko‘rsating. Masalan, dori tugaganini shifokor qachon bildi va bemor javobni qayerda ko‘rdi? [DMED mahsulot tavsifi](https://dmed.uz/en/products/dmed-app)

## 3. Task 1 va’dalarining Task 2 dagi o‘rni

| Ustuvorlik | Qaror | Hakam yoki bemor ko‘radigan natija |
|---|---|---|
| Birinchi ishlaydigan oqim | Shablon, shifokor chegaralari, dori va sabab, qo‘lda bosim, og‘riq xabari, shifokor ko‘rigi va qaytgan javob | Bitta yozuv ikki rolda ham saqlanadi. Shifokor sabab, vaqt va dalil manbasini ko‘radi. |
| Ikkinchi namoyish | Shifokor tayinlagan bitta o‘tirib-turish mashqi. Jonli kamera va qurilmada ochiladigan namuna video. SHA-256, bir hisoblanadigan urinish va 20 nuqtali harakat imzosini real solishtirish | Kamera bilan L3. Yozilgan video tasdiqlansa L2. Past ishonchda qayta urinish yoki qo‘lda qayd. Qisqa o‘zbekcha ovoz uchun avval tekshirilgan yozuvlar, har birida matn va ovozni o‘chirish tugmasi. |
| Sodda ko‘rinishda | Qadamni qo‘lda kiritish, kunlik «Shifo halqasi», 7 kunlik bajarilish va javobsiz vazifalar | Bemor «bugun 4 vazifadan 2 tasi bajarildi» deb o‘qiydi. Shifokor qaysi kun va qaysi vazifa hisobga kirganini ko‘ra oladi. |
| Birinchi qo‘shimcha | **DoriMos**, sintetik quti bilan kamera talab qilmaydigan demo. Keyingi navbatda «Yaqinim» faqat ko‘rish havolasi | DoriMosda nom va **qutidagi kuch** bemor tasdig‘idan o‘tadi. Yaqin insonga faqat bemor ulashgan kunlik holat ochiladi. |
| MVP qo‘shimchasi | Telegram bot · alohida Python/aiogram servisi | Bemor `/bugun` orqali ilovani ochadi. Ulangan shifokorga yangi qizil qayd uchun umumiy xabar keladi. Jonli ulash uchun alohida bot va servisning ommaviy HTTPS manzili kerak. |
| Finalga | Tonometr/retsept OCR, audio Teach-Back, 30 soniyalik klinik stul testi, alohida rozilik bilan 10–15 soniya klip, Telegram vidjet, Health Connect, oylik grafik | Task 2 da bosim uchun qo‘lda kiritish, mashq uchun mahalliy tahlil, shifokorga raqam va bemorning izohi yetarli. Klip uchun ko‘rib chiqish, yuborishni bekor qilish, kirish va o‘chirish muddatlarini oldindan loyihalash kerak. CDC stul testi o‘tirgan holatdan boshlanadi va nazorat ostidagi alohida protokolga ega. [CDC protokoli](https://www.cdc.gov/steadi/media/pdfs/STEADI-Assessment-30Sec-508.pdf) |
| Alohida mahsulot sinovi | Individual wellness, Android APK, DMED integratsiyasi, serverda mashq videosini tahlil qilish, OpenAI orqali ikkinchi provayder | Avval klinika shifokori va hamshirasidan navbat kimning ishini qanday yengillashtirganini o‘rganamiz. Individual rejim o‘z maqsadi, onboarding va xaridoriga ega bo‘ladi. |

**Vaqt qisqarsa.** Birinchi bo‘lib «Yaqinim», keyin DoriMos qo‘shimchasi keyinga o‘tadi. Kamera yo‘li jismoniy telefonda qabul sinovidan o‘tmasa, qo‘lda qayd/taymer oqimi qoladi va topshirish qaydida L3 holati ochiq yoziladi. Video yuborish Task 1 matnida aytilgani uchun uning keyinga o‘tishi Task 2 izohida alohida ko‘rsatiladi.

## 4. UX va klinik holatlar

| Ekran | Asosiy harakat | Xato yoki noaniqlikda |
|---|---|---|
| Bemor · Bugun | Keyingi vazifa, vaqti, bitta katta harakat. «Ichdim» yoki «Icha olmadim». Sabablar «Dori tugadi», «Nojo‘ya ta’sir sezdim», «Unutdim», «Boshqa». Murojaat ostida shifokor javobi. | Aloqa uzilsa «Yuborilmadi · Qayta yuborish». Javob yozilganda holati yangilanadi. Takror bosish ikkinchi log yaratmaydi. «103» va «Og‘riq bor» barcha bemor ekranlaridan ochiladi. |
| Bemor · Mashq | Avval kameraga nima tushishi ko‘rsatiladi. «Boshlash», sanagich, «To‘xtatish». Kamera ruxsati faqat bosilganda. Neytral ovoz «Kamera tizzangizni ko‘rmayapti» yoki «Takror qayd etildi». | Og‘riq bosilsa mashq va ovoz darhol to‘xtaydi. Kamera ruxsati, model yoki kadr sifati yetishmasa matnli taymer/qo‘lda yo‘l ochiladi. Og‘riq xabari o‘lchovsiz ham yuboriladi. |
| Shifokor · Navbat | Sabab → vaqt → o‘lchov/manba → rejadagi chegara → ko‘rish. Avval ochiq qizil, keyin sariq, guruh ichida eng uzoq kutgan voqea. Har bemor qatorida ochiq sabablar soni. | «Ma’lumot kelmagan» alohida holat. Yashil — kuzatuv ma’lumoti bor va ochiq bayroq yo‘q. «Ko‘rib chiqish»da bemorga javob bilan ichki izoh alohida. |
| Shifokor · Reja | Bitta shablon → bemor → dori, vaqt va chegaralarni tekshirish → biriktirish. «60 soniya» foydalanish sinovida o‘lchanadigan maqsad. | Bo‘sh/mantiqan zid chegaralar saqlashdan oldin o‘z maydoni yonida ko‘rsatiladi. Bekor qilingan reja keyingi kun vazifasini yaratmaydi. |
| Yaqinim · Ixtiyoriy | Bemor ulashishga rozilik beradi. Yaqin inson bugungi ijro va oxirgi yangilanish vaqtini ko‘radi. Vaqt yonida Toshkent yoki Kuala-Lumpur mintaqasi yoziladi. | Bemor ruxsatni qaytarib olishi mumkin. Muddati o‘tgan va bekor qilingan havola ma’lumot bermaydi. |

**«Klinik daftar» dizayni.** Bemorning boshlang‘ich ekrani bir ustunli, shifokorniki sabablar ro‘yxati va ochilgan qayd tafsilotidan iborat. O‘zbek lotin yozuvi, self-hosted shrift, asosiy matn uchun 18 px boshlang‘ich o‘lcham, asosiy tugmalar kamida 48 CSS px. Qizil/sariq rangga ikonka va «Tez ko‘rib chiqish» / «Tekshirish» yozuvi qo‘shiladi. 360 px ekranda va 200% zoomda, klaviatura hamda ekran o‘quvchida og‘riq tugmasi, xato va ko‘rik holati tushunarli bo‘lsin. Dizayn prototipida birinchi bo‘lib yuborilmagan, yuborilgan va javob kelgan holatlarni chizing.

**SPEC §8 uchun aniqlik.** Bir xil dori uchun ikki ketma-ket rejalashtirilgan kunda bemor o‘zi qoldirganini bildirsa sariq. Task 1 matnida qizil deyilgani uchun demo matnini shu qoida bilan moslashtirish kerak. «Dori tugadi» xabari shifokor uni rejada belgilasa, sariq tekshiruv sababiga aylanadi. Ko‘krak og‘rig‘i xabari qo‘lda bosim oqimida o‘lchovsiz ham qabul qilinadi. Mashq vaqtida og‘riq xabari E kartaga tegishli. Amaliy pilotda tegishli chegaralar, sabablar va navbatni kim, qachon kuzatishini klinika tasdiqlaydi. «Qayd saqlandi» matni serverdagi yozuvga tayanadi.

**Eslatma va javob vaqti.** «Bugun» sahifasida navbatdagi dori va rejalashtirilgan vaqt ko‘rinadi. Telegram yangi qizil qayd haqida ulangan shifokorga umumiy bildirishnoma beradi. Bemor uchun rejali eslatmalar keyingi bosqichda. Klinik navbatdagi xabarning qachon ko‘rilishi va favqulodda chaqiruv tugmasi bemorga alohida tushuntiriladi.

**Haftalik hisob.** Bemorning Toshkent vaqti bilan oxirgi 7 kunida muddati yetgan faol vazifa birliklarini oling. Bajarilgan birliklar / shu birliklar soni. Misol tariqasida 5 ta bajarilgan, 1 ta qoldirilgani bildirilgan va 1 tasi javobsiz bo‘lsa, ijro 5/7, xabar berish 6/7. Maxraj 0 bo‘lsa «Rejalashtirilgan vazifa yo‘q». Birinchi versiyada har reja bandi bitta kunlik vaqtga ega. Ikki doza kerak bo‘lsa shifokor ikki vaqtni alohida band qiladi. Qayta urinish, kelajak va reja to‘xtatilgan davr maxrajni oshirmaydi. Ko‘rsatkich bemor qaydi va mavjud o‘lchovlarning manbasi bilan beriladi.

<a id="ish-jadvali"></a>

## 5. Bajarish tartibi

Barcha vaqtlar MYT. Quyidagi sanalar jamoaning ichki nishonlari. `[x]` faqat kodi, testi yoki jamoa tasdiqlagan natijasi bor ishga qo‘yiladi. A va B ning hujjat/test dizayni parallel. Kod integratsiyasi bitta scaffold va kelishilgan kontrakt orqali o‘tadi.

| Holat va ish | Egasi · old shart | Qabul mezoni va tekshiruv |
|---|---|---|
| [x] Task 1 va ish maydoni | Jamoa · 18–19 noyabr | Jamoa video yuklanganini va Project to‘ldirilganini bildirdi. Ikki lokal worktree va arxiv ko‘rildi. |
| [x] **A · 19 noyabr. Hakam kira oladi** | Codex · lokal production build, Neon `codex-dev` | Next.js app va lockfile bor. Ikki toza Chromium kontekstida imzolangan sessiya, ikkala rol, rol almashtirish va demo ish joylari izolyatsiyasi sinaldi. |
| [x] **B · 19–20 noyabr. Qayd va qoida kontrakti** | Codex · Vitest va Neon integratsiyasi | L0–L3 kontrakti, reja chegarasidagi tenglik, ikki alohida va javobsiz kunlar testdan o‘tdi. Parallel yuborish Neon’da bitta qayd yaratdi. |
| [x] **C · 20 noyabr. Reja → bemor qaydi** | Codex · lokal production build, Neon `codex-dev` | Reja bugungi dori va bosim vazifasini yaratdi. «Dori tugadi» va qo‘lda bosim saqlandi, qayta ochilganda ikkala qayd ko‘rindi. |
| [x] **D · 20 noyabr. Qayd → ko‘rik → javob** | Codex · lokal production build, Neon `codex-dev` | Ikki logdan tanlangan eski log L4 bo‘ldi, keyingisi L0 qoldi. Bemor aynan tanlangan logdagi javobni ko‘rdi. Boshqa demo ish joyidagi shifokor qaydni ko‘ra va tasdiqlay olmadi. |
| [ ] **E · 20–21 noyabr. Qurilmada mashq o‘lchanadi** | Codex · brauzer sinovi o‘tdi, real telefon sinovi ochiq | CDC klipida 2 to‘liq va 0 chala takror. L2 namuna asosiy urinishga kirmaydi. Past sifat, kamera ruxsati rad etilishi, qo‘lda qayd, og‘riq, SHA-256 va o‘xshash imzo sinovdan o‘tdi. [O‘lchovlar](docs/BENCHMARK.md) |
| [x] **F · 21 noyabr. Bemor hafta natijasini tushunadi** | Codex · unit test va Neon E2E | Qadam L0, kundalik halqa va 7 kunlik nisbat ishlaydi. «Icha olmadim» javobga kiradi. Qadamlar maxrajga ta’sir qilmaydi. Shifokor hisobga kirgan sanalar va vazifalarni ko‘radi. Jamoaning foydalanish sinovi topshirishda qoladi. |
| [x] **G · 21 noyabr. DoriMos** | Codex · haqiqiy Gemini va Neon `codex-dev` E2E | 7 ta o‘qiladigan rasm to‘g‘ri o‘qildi, 3 ta o‘qilmas rasm qayta urinishga yuborildi. 10 mg reja bilan mos kelmagach, bemor tasdig‘i L2 va shifokor tanlagan qayd L4 sinovdan o‘tdi. L0 fallback alohida ishlaydi. [Benchmark](docs/BENCHMARK.md#dorimos) |
| [x] **H · 21 noyabr. «Yaqinim»** | Codex · Neon `codex-dev` E2E | Bemor 24 soatlik havolani yoqadi, yangilaydi va bekor qiladi. Alohida brauzer faqat uchta kunlik hisobni ko‘radi. Muddati tugagan va bekor qilingan havolalar, yozish so‘rovlari va sessiyalar chegarasi sinovdan o‘tdi. |
| [ ] **I · 22 noyabr. Topshirish** | Codex paketi tayyor · jamoa HTTPS relizi va Platform | Ikki demo roli, reset, benchmark, AI-use va hakam ssenariysi tayyor. Lokal production build toza Chromium kontekstlarida sinaldi. Jamoa haqiqiy telefonda kamera va production havolasini tekshiradi, Platformga joylaydi. [Topshirish paketi](tasks/task-2/PLATFORM_NOTES.md) |

**Nazorat nuqtalari.** 20-noyabr yakunida D brauzerda yopilmasa, barcha qo‘shimchalar to‘xtaydi va jamoa shu oqimni tiklaydi. 21-noyabr oqshomida E real qurilmada tekshiriladi. Ommaga ochiq demo videosi uchun huquqi aniqlangan material yoki jamoaning namoyishga rozi bo‘lgan voyaga yetgan a’zosi tasviridan foydalaniladi. Jamoa to‘liq/chala takrorlarni qo‘lda sanab, yozuv bilan birga saqlaydi. 22-noyabr 15:00 MYT funksiyalarni muzlatish, 18:00 MYT Incognito sinovi va yuborishga tayyor nusxa. Codex `codex/dev` da reliz paketini tayyorlaydi, jamoa `main`ga birlashtirish, deploy va topshirishni bajaradi. Har bir pushdan oldin ikkala tekshiruv o‘tadi. Topshirilgan havola Grand Final yakunigacha ochiq turadi.

**B · 19-noyabr tekshiruvi.** L0–L3, bosim va dori kunlari bo‘yicha 49 Vitest testi ajratilgan vaqtinchalik Node muhitida o‘tdi. Shu manbalar TypeScript `--strict` bilan tekshirildi. Repo darajasidagi `verify` va `e2e` A scaffold bilan ishga tushadi. [Modul kontraktlari](docs/INTERFACES.md)

**A · 19-noyabr tekshiruvi.** `npm run verify` typecheck, lint, 61 unit test va production builddan o‘tdi. `npm run e2e` da ikki Chromium smoke o‘tdi. Production build alohida Neon `codex-dev` bazasiga ulandi. Rol almashtirilganda bitta demo ish joyi saqlandi, ikkita yangi Chromium kontekstida esa ikkita alohida ish joyi, bemor va shifokor yozuvi tekshirildi. [Topshirish qaydi](tasks/task-2/PLATFORM_NOTES.md)

**B–D · 19-noyabr tekshiruvi.** `npm run verify` 71 unit test, typecheck, lint va production builddan o‘tdi. Shu build haqiqiy Neon `codex-dev` bilan 4 ta Chromium E2E sinovidan o‘tdi. Sinov qamrovida reja, ikki bemor qaydi, tanlangan log, shifokor javobi, parallel yuborish, takroriy ko‘rik va ish joylari izolyatsiyasi bor. [Brauzer sinovlari](tests/e2e/clinical.spec.ts)

**E/F · 20-noyabr tekshiruvi.** `npm run verify` 97 unit test bilan o‘tdi. Lokal production build va Neon `codex-dev` bilan 8 ta Chromium E2E o‘tdi. Brauzer ulanishlari CSP orqali ilovaning o‘z manzili va lokal `blob:` bilan cheklangan. [Mashq benchmarki](docs/BENCHMARK.md) · [Reja ijrosi E2E](tests/e2e/adherence.spec.ts)

**G/H/I · 20-noyabr tekshiruvi.** `npm run verify` typecheck, lint, 120 unit test va production builddan o‘tdi. Shu build ajratilgan Neon `codex-dev` da 12 ta Chromium E2E sinovidan o‘tdi. Jonli Gemini sinovida o‘qilmas rasm qayta urinishga, 10 mg quti bemor tasdig‘idan keyin shifokor navbatiga bordi. «Yaqinim» boshqa brauzerda ochildi, havola o‘chirilganda kirish bekor bo‘ldi. [Hakam va reliz qaydi](tasks/task-2/PLATFORM_NOTES.md)

**Telegram · 20-noyabr tekshiruvi.** Bot alohida Python/aiogram servisida. 15 ta Python unit testi o‘tdi. Next.js va Python birga ishlagan E2E sinovida yetkazish mahalliy mock orqali tekshirildi. Telegram API ShifoHalqaning alohida `@shifohalqa_bot` botini tasdiqladi. Webhook hozircha ro‘yxatdan o‘tmagan. Jonli sinov uchun BotFather’da yangilangan token va Python servisining ommaviy HTTPS manzili kerak. [Telegram E2E](tests/e2e/telegram.spec.ts) · [Ulash yo‘riqnomasi](README.md#telegram-bot)

## 6. Texnologiya va yangiliklardan qayerda foydalanamiz

| Imkoniyat | ShifoHalqa uchun tanlov va tekshiruv |
|---|---|
| Brauzer va server | Next.js App Router **16.4.6**, React/React DOM **19.3.1**, TypeScript strict **5.9.3**, Tailwind CSS **4.3.5**, `@neondatabase/serverless` **1.2.1**, Zod **4.6.7**, Vitest **2.1.9** va Playwright **1.65.1** A scaffold’da o‘rnatildi va tekshirildi. Aniq versiyalar lockfile’da. [package.json](package.json) |
| Pose Landmarker | `@mediapipe/tasks-vision` **1.2.3**. JS/WASM ayni versiyadan, lite model mahalliy. Modul faqat mashq ochilganda yuklanadi. Video inference sinxron bo‘lgani uchun sekin telefonda kadrlar oralig‘i va UI javobini o‘lchang. Zarur joyda Web Worker, pastroq aniqlik yoki kamroq kadrni sinang. Mezon — «To‘xtatish» bosilganda sikl darhol to‘xtashi. [Google AI Edge](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker?tab=Web) |
| Gemini va Jev | Google 11-noyabrda yopiq javoblar uchun Gemini Decisions API’ni e’lon qildi. DoriMosda `gemini-decision-1` bilan «quti ko‘rinadimi?» va «yozuv o‘qiladimi?» savollari. Interactions API orqali `gemini-4-hydrogen` nom/kuchni ajratadi. `@google/genai` registrda **3.6.1**. Model ID env’dan, extraction fallback `gemini-3.5-flash-lite`. Dori nomi, kuchi va birlik solishtiruvi deterministik. Jevni finalda ayni sintetik rasmlarda alohida solishtirish mumkin — o‘qilmas suratni qabul qilish, qo‘lda yo‘lga o‘tish, kechikish va xarajat bo‘yicha. Ikkinchi xizmat faqat o‘lchangan foyda berganda qo‘shiladi. [Google e’loni](https://blog.google/innovation-and-ai/technology/developers-tools/gemini-decisions-api/) · [Jev va Gemini Decisions codelab](https://codelabs.developers.google.com/codelabs/discriminative-models) |
| Media va maxfiylik | Ochiq hackathon demosida bulutga faqat jamoa tayyorlagan sintetik quti rasmlari yuboriladi. Interactions uchun `store: false`. Bu interaksiya obyektini saqlash boshqaruvi. Providerning foydalanish shartlari alohida amal qiladi. Gemini API klinik amaliyotda foydalanishni cheklaydi. Haqiqiy klinika sinovida bulut OCR o‘chirilgan holda manual/mahalliy oqimdan boshlash, mos xizmat, ruxsat va ma’lumot siyosatini alohida tekshirish kerak. [Interactions](https://ai.google.dev/gemini-api/docs/interactions) · [Gemini API shartlari](https://ai.google.dev/gemini-api/terms) |
| Telegram | 9-noyabrdagi **Bot API 10.4** chat xabarida interaktiv HTML vidjetlarni qo‘shdi. Birinchi tajriba — botga ixtiyoriy ulangan bemorning shaxsiy chatida «Bugungi vazifalarni ochish». Eski klientda oddiy HTTPS tugma. Vidjet muhiti tarmoqqa bevosita chiqmaydi. Dori nomi, bosim, doktor izohi va tasdiq autentifikatsiyalangan veb-sahifada qoladi. Mini App qo‘shilsa `initData` imzosi va yoshi serverda, bot webhook uchun esa alohida secret token tekshiriladi. [10.4 relizi](https://core.telegram.org/bots/api-changelog#november-9-2026) · [Widgets](https://core.telegram.org/bots/widgets) · [Mini Apps](https://core.telegram.org/bots/webapps) |

| Google Stitch | Ikki sintetik ekran bilan prototiplang — bemorda dori tugashi va shifokorda shu qaydni ko‘rish. Bitta `DESIGN.md`ga o‘zbekcha atamalar, ranglar va holatlarni eksport qiling. 18-noyabrda e’lon qilingan **Stitch Loop** kutish ro‘yxati bilan ochildi. Oddiy Stitch yoki qog‘oz prototip hozir yetadi. [Stitch va DESIGN.md](https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-ai-ui-design/) · [Stitch Loop e’loni](https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-loop/) |

<a id="android-patient-app"></a>

### Android bemor ilovasi

1. **Native demo.** Kotlin va Jetpack Compose’da «Bugungi vazifalar → dori qaydi → shifokor javobi». `Documents` dagi «Sesame uslubidagi animatsiyali UI» qo‘llanmasidan bloklarning ketma-ket ochilishi va tugmalarning spring javobi olinadi. ShifoHalqaning palitrasi va bemorga tegishli holatlar qo‘llanadi. Qayd qurilmada saqlanadi, shifokor javobi namuna sifatida ochiladi. [Androidni ishga tushirish](README.md#android-demo)
2. **Veb-panel bilan integratsiya.** Shifokor sahifasidagi bir martalik kod orqali Android shu sintetik bemor ish joyiga ulanadi. Mavjud server validatsiyasi va deterministik qoidalar ishlaydi. Parallel qayta yuborishda bitta qayd saqlanadi. Bemor aynan shifokor ko‘rgan qayd javobini oladi. Tarmoq uzilishi, sessiya tugashi va bo‘sh reja uchun alohida holatlar bor. [Android API kontrakti](docs/INTERFACES.md#android-demo-api)
3. **Qurilmada qabul sinovi.** Haqiqiy telefonda TalkBack, katta shrift, tizim animatsiyalari o‘chirilgan holat va kadr barqarorligini tekshirish. Favqulodda yordam yo‘li mahsulot kontraktiga muvofiq integratsiya qilingach, test APK alohida qabul qilinadi.

**Birinchi demo tekshiruvi.** Debug APK va Android lint o‘tdi. API 37 emulyatorida uchta Compose UI testi dori qaydi, sabab tanlash, bekor qilish, holatni saqlash, namuna javob va demo resetni tekshirdi. 200% shrift va tizim animatsiyalari o‘chirilganda ham «Dori tugadi» qaydi saqlandi.

**Haqiqiy telefon tekshiruvi.** Samsung SM-S928B (Android 17, API 37) ga debug APK Wi-Fi ADB orqali o‘rnatildi. Uchta Compose UI testi o‘tdi. Sinov ma’lumoti tozalangach, demo «Bugun» sahifasida ochildi. TalkBack va animatsiya kadrlarining barqarorligi alohida tekshiriladi.

**Android–veb integratsiyasi.** Yangilangan APK haqiqiy telefonda bo‘sh reja holatini, vebda tayinlangan dori vazifasini, «Dori tugadi» qaydini va aynan shu qayd bo‘yicha vebda berilgan javobni ko‘rsatdi. Sinov tarmog‘i uzilganda xabar ko‘rindi va tiklangach yangilash ishladi. Shifokor yangi kod olganda avvalgi sessiya tugadi, telefon yangi kod bilan shu ish joyiga qayta ulandi. Lokal build ajratilgan Neon `codex-dev` bilan 122 unit va 13 brauzer sinovidan o‘tdi. App navigatsiyasi va dori sababini tanlash oynasining kadr vaqtlari telefonda o‘lchandi. TalkBack ovozli sinovi ochiq. [Kadr o‘lchovlari](docs/BENCHMARK.md#android-animatsiyalari)

<a id="papka-xaritasi"></a>

## 7. Papkalar va egalik

Codex `codex/dev` ish daraxtida bitta ilovani quradi. Subagentga ish berilsa, yoziladigan fayllar oldindan kelishiladi. Scaffold, UI va DB egaligi foydalanuvchi tasdig‘i bilan `AGENTS.md` ga kiritildi.

| Joy | Nima turadi · egasi |
|---|---|
| `PLAN.md`, `docs/SPEC.md`, `docs/INTERFACES.md` | Mos ravishda ustuvorlik/holat, mahsulot qoidalari, amaldagi public export va integratsiya kontraktlari. Mahsulot qoidasi bo‘yicha ochiq qarorlar foydalanuvchi bilan kelishiladi. README kirish va ishga tushirishga yo‘naltiradi. |
| `src/app/{patient,doctor,caregiver,api}/`, `src/components/` | Route, sessiya va sahifalar. Komponentni ikkinchi ekran ham ishlatsa umumlashtirish. |
| `schema.sql`, `src/lib/db.ts`, `src/lib/seed.ts` | Bitta sxema va sintetik demo seed. Codex testlari faqat Neon `codex-dev` branchida. |
| `src/lib/{rules,pose,ai,anticheat}/`, `public/models/` | Har modulda kichik typed kirish nuqtasi. Qoidalar DB, React yoki AI SDK import qilmaydi. SDK serverda, kamera brauzerda. SPEC’dagi eski tekis `pose.ts` / `rules.ts` yo‘llari shu chegaraga moslanadi. |
| `tests/{unit,e2e,fixtures}/`, `scripts/benchmark*`, `scripts/e2e*`, `docs/BENCHMARK.md` | Codex. Fixture kelib chiqishi va kutilgan javob bilan saqlanadi. Benchmark hujjati birinchi haqiqiy run bilan yaratiladi. |
| `brief/`, `competition/`, `tasks/task-1/`, `tasks/task-2/`, `archive/` | Rasmiy talab, baholash, topshirilgan material, topshirish paketi va tarix o‘z joyida. Codex `tasks/task-2/PLATFORM_NOTES.md`ni har ishlagan oqim bilan yangilaydi. |

**Scaffold bilan birga.** README’dagi sanalar/status va eski T0–T5 ko‘rsatkichlarini ushbu kartalarga bog‘lang. SPEC’da ranglar, bemorga qaytadigan javob, ixtiyoriy media va rejalashtirilgan ishlarni belgilang. 6 MB rasm kontrakti Vercel Functions’ning 4.5 MB tana chegarasidan katta. Sintetik fixture demo uchun kichik asset ID yetadi. Foto kirishi keyin ochilsa, JPEG’ni qurilmada kichraytirib, masalan, 3 MB fayl + multipart bilan transport sinovini bajaring. [Vercel limiti](https://vercel.com/docs/functions/limitations)

## 8. Hakam sinovi va keyingi qaror

1. **Kamerasiz Incognito.** Shifokor reja yaratadi → bemor dori tugaganini bildiradi → shifokor aynan shu yozuvni ko‘radi → bemor yangilangan holatni oladi. Keyin boshqa sintetik bemorga o‘tib rollar ajratilganini tekshiring. Rubrikadagi texnik ijro 25 ball, taqdimot 10 ball.
2. **Telefon va dalil.** Kamida bitta haqiqiy telefon va bitta kamerasiz desktop. Qurilma, brauzer, model yuklanish vaqti, kadr sifati, qo‘lda sanalgan takrorlar, model natijasi va uzilishlar qayd etiladi. DoriMos bo‘lsa xira rasmlar bo‘yicha xato qabul soni alohida chiqadi. Har natija bilan sana, commit, SDK/model, urinishlar soni va xatolarni saqlang. O‘qilmas quti mos deb qabul qilinsa, sabab tuzatilib, sinov takrorlanguncha OCR demo ochilmaydi. Innovatsiya 25 ball.
3. **Mahalliy foyda.** Imkon bo‘lsa bitta shifokor va telefon ishlatuvchi bir katta yoshli ishtirokchi bilan faqat sintetik vazifalar. Shifokor ayni hajmdagi ikkita tenglashtirilgan sintetik ro‘yxatda birinchi kerakli bemorni necha soniyada topdi, sababni to‘g‘ri aytdimi? Bemor yordamsiz sabab qoldirdimi va javobni topdimi? Urinishlar soni, xom vaqtlar, qiyinchilik va qurilmani yozing. Foydalanuvchi topilmasa ichki sinov deb belgilang. Mahalliy amaliylik 20 ball, ta’sir 20 ball.
4. **Finaldan keyin biznes sinovi.** Bitta klinika bilan qabuldan keyingi kuzatuv jarayonini xaritalang. Kim navbatga javob beradi, qaysi xabar ishini o‘zgartiradi, haftasiga nechta yozuv javobsiz qoladi? Shundan keyin klinika uchun faol kuzatilayotgan bemor bo‘yicha to‘lov gipotezasini tekshiring. «Yaqinim»ga qanchalik ehtiyoj borligini bemorning rozilik tanlovi va oila intervyusi bilan o‘lchang.

<a id="post-mvp-perf"></a>

### MVP’dan keyin · Yuklanish tezligi

**Boshlang‘ich o‘lchovlar.** Lokal production build va haqiqiy Neon `codex-dev` bilan 10 tadan takroriy so‘rovda median TTFB bemor sahifasida 91 ms, shifokor sahifasida 93 ms bo‘ldi. Yangi Next.js jarayonida shifokorning ilk ochilishi ikki urinishda 1.41 va 1.85 soniya bo‘ldi. Alohida takroriy sinovdagi bitta sahifa 10 soniyalik timeoutga urildi. Bu o‘lchovlar lokal serverdan olingan. Bemor sahifasi har ochilishda bazaga 4 ta, shifokor sahifasi 6 ta HTTPS so‘rov yubordi. [Demo sahifasi](src/components/demo-role-page.tsx) · [Baza so‘rovlari](src/lib/seed.ts)

1. **Preview’da boshlang‘ich natijani oling.** Reliz uchun tanlangan Neon regionini va Vercel funksiyalarining amaldagi regionini tasdiqlang. Funksiyalarni bazaga yaqin regionda sinang. Ayni sintetik oqimda bo‘sh turgandan keyingi ilk tashrif, takroriy tashrif, TTFB p50/p95, LCP, timeout va baza qatnovlari sonini yozing.
2. **Sahifaning ketma-ket baza qatnovlarini qisqartiring.** Demo yozuvlarini yangi ish joyi ochilganda yarating. Keyingi tashrifda tayyor yozuvlarni o‘qing. Ikkilamchi bo‘limlar yuklanayotganda asosiy vazifalar yoki shifokor navbatini ko‘rsatishni sinang. Sessiyalar ajratilishi, takroriy ochilish va qayd yozish oqimlarini E2E’da tekshiring. Bir xil sharoitda o‘lchovni takrorlang.
3. **Baza tanlovini natijaga bog‘lang.** Ilk so‘rov kechikishiga Neon compute uyqusi sabab bo‘lsa, faol compute tarifining narxini baholang. Sekinlik davom etsa, Neon va Supabase’ni ayni region, sintetik ma’lumot va so‘rovlar bilan yonma-yon sinang. Natijalar va migratsiya xarajatini ko‘rsatib, provayder tanlovini foydalanuvchi bilan kelishing. [Vercel regionlari](https://vercel.com/docs/functions/configuring-functions/region) · [Neon scale-to-zero](https://neon.com/docs/introduction/scale-to-zero)

<a id="agent-promptlari"></a>

## 9. Kodga o‘tish uchun tayyor agent promptlari

Har promptga joriy commit SHA, tegishli karta, kerakli SPEC bandi va INTERFACES holatini bering. Har yoziladigan faylning bitta egasi bo‘lsin. Mustaqil ish kerak bo‘lsa, Codex subagentga aniq qabul mezoni va fayl doirasini beradi. Codex integratsiyani yakunlaydi, tekshiruvchi tayyor diffni alohida o‘qiydi.

**Codex · A, keyin C/D**

> `codex/dev` da A kartaning ikkita rolini toza brauzerda tekshir. C/D da bitta sintetik bemor uchun reja → «Dori tugadi» → aniq log ko‘rigi → bemorga javobni ula. Engine kontraktini INTERFACES’dan ol. modern-web-guidance va frontend-ui-engineering bilan telefon holatlarini, neon-postgres bilan yozuv va ko‘rik tranzaksiyasini tekshir. Natijada o‘zgargan fayllar, tekshiruv buyrug‘i va kuzatilgan natijani ber.

**Codex · B**

> `codex/dev` da B kartani ol. test-driven-development va api-and-interface-design bilan avval bir dori ikki kunda qoldirilgan, bir kunda ikki marta bosilgan va umuman xabar kelmagan holatlarni ajratadigan sinovlarni yoz. Shifokor chegarasiga teng qiymatni ham tekshir. Rules, tests va INTERFACES’ga yoz. Zod bilan tekshiriladigan typed exportni hujjatla. DB va sessiya integratsiyasi uchun ehtiyojni PLAN’da qayd et. Haqiqiy test natijasi va ulanadigan joyni topshir.

**Codex subagenti · E yoki G kartalaridan bittasi**

> E uchun faqat pose, anticheat, public/models va tegishli tests bilan ishla. Context7 va Google AI Edge hujjatida tanlangan SDK’ni tekshir. Kadr yo‘q, yuklangan fayl, kadr nisbati va ikki marta yuklash bo‘yicha avval test yoz. Mahalliy video bilan natijani qo‘lda sanalgan takrorlarga solishtir. G tanlansa faqat ai, scripts/benchmark va OCR fixture/testlar senga tegishli. gemini-api-dev hamda geminiDocs bilan sintetik quti, xira quti, boshqa kuch va API timeoutni tekshir. Har ikki holatda modul kontrakti uchun o‘zgarish taklifini parentga qaytar. Parent INTERFACES’ni bir marta yangilaydi.

**UX subagenti · A bilan parallel, faqat prototip**

> Bitta sintetik bemor oqimini chiz. 360 px ekranda «Icha olmadim → Dori tugadi» va aloqasiz holatni, shifokor ekranida esa sababni ochish va bemorga javobni ko‘rsat. Ikkala rolda ayni yozuv va vaqt ko‘rinsin. Ranglarni yashirganda ustuvorlik tushunarlimi, matn 200% kattalashganda tugma qoladimi, tekshir. Natijada ikkita ekran, uchta xato holati va tayyor o‘zbekcha tugma matnini Codexga ber.

**Mustaqil tekshiruvchi subagent · D/E tayyor bo‘lganda**

> Faqat o‘qi va test muhitida tekshir. code-review-and-quality, security-and-hardening va webapp-testing bilan ikki logdan eskisini ko‘rish, boshqa bemor chegarasi, qabul qilinmagan rasm, kamera rad etilishi, aloqa uzilishi va caregiver ruxsati bekor qilinishini sinab ko‘r. Reja, kuzatilgan xatti-harakat, aniq fayl yoki ekran va qayta sinash usulini ber. Topilmani tuzatishni tegishli egaga qaytar. Hech qanday production ma’lumotidan foydalanma.

G‘oya shakllanayotganda UX prototipga Stitch va `ui-ux-pro-max`, integratsiyada `context7-mcp`, test yiqilganda `debugging-and-error-recovery` ishlatiladi. Ikki agent bir vaqtda sxema, dependencies, public export ro‘yxati yoki bitta sahifani tahrirlamaydi.

<a id="codex-workflow"></a>

## 10. Codex bilan ishlash yo‘riqnomasi

19-noyabrdagi `f97fca1` boshlang‘ich commitida ilova va lockfile yo‘q. Codex dalil darajasi kodini va testlarini boshladi. Ish holati §5 dagi A–I jadvalida, mahsulot qoidalari SPEC’da, egalik va ish chegaralari `AGENTS.md` da yuritiladi. [SPEC](docs/SPEC.md) · [INTERFACES](docs/INTERFACES.md) · [Codex qoidalari](AGENTS.md)

### O‘rnatilgan skilllar va qachon ishlatish

| Ish | Nimani yuklash va undan qanday natija olish |
|---|---|
| Har yangi karta va agentlar o‘rtasida topshirish | `using-agent-skills` va `context-engineering` bilan karta, tegishli SPEC bandi, ish daraxti va scaffold SHA’ni aniqlash. `incremental-implementation` bilan bitta ishlaydigan qismni yakunlash. Ko‘lami noaniq ishda `planning-and-task-breakdown` yoki `spec-driven-development` yordam beradi. |
| B · Dalil darajasi va qoidalar | `api-and-interface-design`, `context7-mcp`, `test-driven-development`. Server ishlatadigan typed Zod kontrakti va avtomatik regressiya sinovlari. Bosim chegarasiga tenglik, bir kunda ikki urinish, ikki alohida mahalliy kun va javobsiz kunni ajratish. |
| D/F/H · Ko‘rik, hisobot va ruxsatlar | `webapp-testing` va `security-and-hardening`. Sintetik yozuvlarda tasdiqlangan logning L4 ga o‘tishi, rollar ajratilishi, qayta yuborish, haftalik maxraj va rozilikni qaytarish oqimini tekshirish. |
| E · MediaPipe va takroriy dalil | `context7-mcp` bilan kutubxona, `modern-web-guidance` bilan brauzer imkoniyatlari, `test-driven-development` bilan kadrlar ketma-ketligi, `webapp-testing` bilan fallback. Telefon sinovi kadr tezligi yoki UI javobi muammosini ko‘rsatsa `performance-optimization` ishlatiladi. |
| G · Sintetik DoriMos | `gemini-api-dev`, `geminiDocs`, `context7-mcp` va `source-driven-development`. Avval amaldagi SDK va rasmiy kontrakt, keyin sintetik rasm, o‘qilmas rasm, kam ishonch va provayder xatosi sinovlari. |
| Scaffold, DB, UI va reliz | `neon-postgres` yoki `neon` bilan ajratilgan muhit, `modern-web-guidance` va `frontend-ui-engineering` bilan ekranlar. `better-accessibility` bilan 360 px, 200% zoom, klaviatura va status xabarlari. `better-writing` bilan o‘zbekcha tugma va xato matnlari. `shipping-and-launch` bilan jamoaga reliz paketi. |
| Nosozlik, diff va integratsiya | `debugging-and-error-recovery` bilan qayta kuzatish va regressiya testi. `code-review-and-quality` bilan ko‘rik, `git-workflow-and-versioning` bilan bir mavzuli o‘zgarish va topshirish. |

Bir vazifada natijaga ta’sir qiladigan skilllarni tanlang. `shadcn` va dizayn skilllari tanlangan UI usuliga qarab yordam beradi. Alohida animatsiya, media generatsiyasi, Neon Auth, Neon Realtime va ikkinchi AI provayder Task 2 oqimlariga bog‘lanmagan.

### MCP va amaliy vositalar

| Vosita | 19-noyabrdagi holat va qayerda ishlatiladi |
|---|---|
| `context7` | Lokal Codex sozlamasi va repo MCP ro‘yxatida bor. Zod ID topildi va dokumentatsiya qaytdi. Kutubxona savolida `resolve-library-id` → `query-docs`. Scaffold kelgach versiyani lockfile’dan oling. Mazkur sessiyada `query-code` ko‘rinmadi. API imzosi docs’da ochilmasa rasmiy repo manbasini tekshiring. [Sinovda qaytgan Zod docs](https://zod.dev/basics) |
| `geminiDocs` | Lokal Codex sozlamasi va repo ro‘yxatida bor. Interactions uchun rasmiy JS SDK qidiruvi va hujjatni olish ishladi. Bu tekshiruv modelga inference so‘rovi yuborishni o‘z ichiga olmadi. G boshida Decisions API hujjati va ayni SDK/kalit bilan sintetik smoke alohida tekshiriladi. [Interactions](https://ai.google.dev/gemini-api/docs/interactions) · [Decisions e’loni](https://blog.google/innovation-and-ai/technology/developers-tools/gemini-decisions-api/) |
| GitHub | Codex GitHub ulanishi joriy repo metama’lumotini o‘qidi. PR diff, review va CI natijasi uchun ishlating. Lokal ish holati `git status` va `git diff` orqali ko‘riladi. |
| Browser va Playwright | Brauzer boshqaruvi ushbu sessiyada bor, Playwright buyrug‘i PATH’da topildi. Qo‘lda oqimni kuzatish uchun brauzer, takrorlanadigan smoke uchun repodagi Playwright sinovlari. Skriptlar scaffold bilan keladi. Telefon kamerasi haqiqiy qurilmada alohida tekshiriladi. |
| Neon va Vercel | CLI buyruqlari PATH’da. A uchun Neon metadata orqali ikkala URL `codex-dev` endpointiga bog‘langani tasdiqlandi va demo sxemasi shu branchda tekshirildi. Vercel deployini jamoa yuritadi. |
| `shadcn`, `node_repl`, `opencode_console` | Uchalasining vositalari sessiyada ko‘rindi. `shadcn` komponent katalogi kerak bo‘lsa, `node_repl` vaqtinchalik lokal tekshiruvlar uchun. `opencode_console` OpenCode hisob boshqaruvi uchun. `21st` va Stitch MCP bu Codex sessiyasida ko‘rinmadi. |
| Codex ilovasi, veb qidiruvi va boshqa ilovalar | Veb qidiruvi rasmiy musobaqa talablari va birlamchi hujjatlarni kuzatishga, Codex ilovasi chat yoki worktree boshqarish so‘ralganda yordam beradi. Google Drive va hujjat vositalari jamoa topshirish materiallarini u yerda yuritsa ishlatiladi. Gmail, Calendar, Contacts, Sites va media vositalari joriy engine kartalariga bog‘lanmagan. |

**Yangi skill va MCP bo‘yicha tavsiya.** Task 2 uchun hozirgi to‘plam yetadi. Ikki yoki undan ko‘p topshirishda bir xil regressiya tekshiruvlari qayta yig‘ilsa, `skill-creator` bilan repo uchun kichik `shifohalqa-verify` skillini taklif qiling. U amaldagi loyiha qoidalariga havola qiladi, L0–L4, to‘g‘ri `evidence_log_id`, `ai_mode`, fallback va benchmark dalillarini tekshirish tartibini jamlaydi. Brauzerni boshqarish yoki qurilma profili bo‘yicha mavjud vosita bilan hal bo‘lmaydigan aniq ehtiyoj paydo bo‘lsa, shundan keyin maxsus brauzer vositasini baholang. Dizayn jamoasi tasdiqlangan Figma maketlarini manba qilsa, Figma ulanishi shu bosqichda foyda beradi.

### Boshlashdan topshirishgacha

1. **A va B dizayni.** Codex arxivdagi qoidalarni SPEC bilan solishtirib, B kartaning kirish/chiqishi va kutilgan natijalarini yozadi. A scaffold’da ikkala demo roli, ajratilgan sintetik DB, lockfile, `verify` va `e2e` buyruqlari tayyor.
2. **B va birinchi integratsiya.** Codex rules va evidence kontraktini Vitest bilan tekshiradi. `INTERFACES.md` ga haqiqiy import yo‘li, schema va xatolarni yozadi. C kartada shifokor chegarasini serverdagi qoida kirishiga bog‘laydi.
3. **C → D va birinchi brauzer mezoni.** Codex shifokor rejasi → «Dori tugadi» → navbat → aynan shu qayd ko‘rigi → bemorga javobni ulaydi. Smoke testda ikkita logdan eskisi ko‘rib tasdiqlanganda faqat o‘sha log L4 bo‘lishini, yuborishni takrorlaganda natija izchilligini va rollar ajratilishini tekshiradi. D ichki muddatiga yetmasa, qo‘shimcha ishlar kutadi va jamoa shu oqimga qaytadi.
4. **E va F.** B kontrakti va A scaffold’dan keyin E moduli D bilan parallel tayyorlanishi mumkin. Real telefonda jonli video (L3), fayldan yetarli tahlil va tasdiq (L2), sifatsiz kadr va rad etilgan ruxsat bo‘yicha qo‘lda yo‘l sinovdan o‘tadi. F C’dan keyin haftalik hisobni javobsiz kun, nol vazifa va qayta urinish bilan tekshiradi. Jamoa qo‘lda sanalgan takrorlar va qurilma tafsilotlarini beradi, Codex o‘lchagan natijani `docs/BENCHMARK.md` ga yozadi.
5. **G, so‘ng H, vaqt va asosiy oqim imkon bersa.** D ishlagach va E qurilma sinovi rejalashtirilgach G boshlanadi. DoriMos uchun kamida 8 ta belgilangan sintetik rasm va kuzatilgan fallback natijasi kerak. H da bemor ruxsatni beradi va qaytaradi, yaqin inson faqat ruxsat etilgan holatni ko‘radi.
6. **I · Reliz va topshirish.** Har Codex pushidan oldin `npm run verify` va `npm run e2e` o‘tadi. Codex `codex/dev` bo‘yicha tekshiruv, integratsiya qaydi va reliz paketini tayyorlaydi. Jamoa `main`ga birlashtiradi, deploy qiladi, telefon va toza Incognito oynasida sinaydi. Hakamga demo kirishi, haqiqiy benchmark va ish holatiga mos AI-use izohi beriladi. Platform ko‘rsatgan deadline va havola holatini jamoa tekshiradi. [Task 2 checklist](tasks/task-2/README.md) · [Baholash mezonlari](competition/RUBRIC.md)
7. **Final va pilot.** Topshirishdan keyin hakam yoki foydalanuvchi qaydlaridan keyingi vazifani tanlang. Tonometr, Teach-Back, Telegram yoki klip kabi yo‘llarni alohida qabul shartlari bilan oching. Haqiqiy bemor ma’lumotiga o‘tishdan avval klinika rozilik, chegaralar, navbatga javobgarlik va ma’lumot siyosatini kelishadi. Demo benchmarki va klinik pilot o‘lchovlari o‘z sharoitlari bilan qayd qilinadi. [MVP’dan keyingi tezlik ishlari](#post-mvp-perf)

### Siz va Codex uchun ish tartibi

- **Til va framework tanlovi.** Har komponent uchun vazifa, kutubxona ekotizimi, ishlash muhiti va jamoaning xizmatni yuritish imkonini solishtiring. ShifoHalqada veb-panel Next.js’da, Telegram Python/aiogram’da, native Android demo Kotlin/Compose’da. Komponentlar orasidagi kontraktni `docs/INTERFACES.md` da yuriting.

- **Siz beradigan kontekst.** Bitta karta, boshlang‘ich SHA, muhim SPEC bandi va nimani ko‘rsangiz ishni qabul qilishingizni ayting. Real telefon sinovi uchun jamoada bor qurilma va ruxsatli namunani ko‘rsating. Xato bo‘lsa reproduksiya qadami va qisqa, maxfiy qiymatlari olib tashlangan logni yuboring. AI hujjatlari qidiruvi va namunalarga sintetik ma’lumot ishlating.
- **Codex bajaradigan ish.** Mos skilllarni o‘zi tanlaydi, joriy holat va SDK hujjatini tekshiradi, test → kod → hujjat → qayta tekshiruv siklini olib boradi. Har tekshirilgan, mustaqil ish bo‘lagini `codex/dev` da keyingi bo‘lakka o‘tishdan oldin alohida commit qiladi. Integratsiya bog‘liqliklarini `PLAN.md` da yuritadi. Klinik qoida yoki scope o‘zgarishi kerak bo‘lsa, ochiq qarorni va uning sinovga ta’sirini ko‘rsatadi.
- **Kartani topshirish.** Karta/SHA, o‘zgargan fayllar, `INTERFACES.md` dagi import, bajarilgan test buyruqlari va real natija, qolgan bog‘liqlik hamda egasini bitta xabarga jamlang. Bu ma’lumot bilan keyingi chatni davom ettirish mumkin. Review so‘roviga aynan revision yoki diffni biriktiring.
- **`AGENTS.md` ni yaxshilash.** Milestone tugaganda yoki bir muammo qayta uchraganda, Codex doimiy qoida uchun qisqa diff va sababni taklif qiladi. Faqat o‘sha tahrir uchun foydalanuvchidan aniq tasdiq kelgach faylga yozadi. Bir martalik vazifa holati yoki bloklovchi dalil shu rejada yuritiladi.

> `codex/dev` da PLAN §5 B kartasini davom ettir. SPEC §5 va §8 hamda INTERFACES’ni o‘qi. Shifokor chegarasiga teng BP, ikki kun qoldirilgan dori, javobsiz kun va takror bosish ajralsin. Qoidalar, Vitest va public kontraktni yakunla. Yakunda integratsiya qadamlarini, test buyruqlari va kuzatilgan natijani ber. AGENTS.md uchun diff bo‘lsa, avval menga ko‘rsat.

> [SHA yoki PR] ni D kartadagi qabul mezonlari bo‘yicha tekshir. Ikkita log uchun ko‘rik, bemor javobi va rollar ajralishini sintetik demo orqali kuzat. Har topilma uchun ta’sir, fayl yoki ekran, tekshirilgan holat va mas’ul egani ko‘rsat.

> I kartasi uchun tayyorlikni bahola. `verify` va E2E natijalarini, haqiqiy telefon dalillarini va topshirish matnini solishtir. `codex/dev` doirasidagi tuzatishlarni bajar. Jamoaning deploy va topshirish qadamlarini qabul mezoni bilan yoz.
