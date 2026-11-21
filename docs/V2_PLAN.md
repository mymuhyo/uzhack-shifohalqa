# V2 · Androidda uy reabilitatsiyasi

**Joriy yo‘nalish.** Bemor Kotlin va Compose ilovasida uy mashqini bajaradi. Kamera va MediaPipe Lite telefonda ishlaydi. Klinik reja va urinishga javob web panelda. Hakam Android o‘rnatmasdan CDC klipi, sintetik og‘riq xabari va javob oqimini brauzerda o‘tadi. Telegram yordamchi bildirishnoma va havola kanali.

| Bosqich | Qabul mezoni |
|---|---|
| Android kamera va qo‘lda qayd | Kadrda tayanch nuqtalari yetarli bo‘lsa holat va takror sanog‘i ko‘rinadi. Yetarli bo‘lmasa qayta urinish yoki qo‘lda qayd ochiladi. To‘xtatish, og‘riq va fon rejimi kamerani yopadi. |
| Klinik halqa | Mashq rejasi, urinish, alohida og‘riq xabari va aynan shu qaydga shifokor javobi bir demo ish joyida ishlaydi. Android va web javobni ko‘rsatadi. |
| Sust aloqa | Oldingi reja telefondan ochiladi. Yuborilmagan xabar va server olgan xabar turli holatda ko‘rinadi. Qayta yuborish ikki yozuv yaratmaydi. |
| Sifat o‘lchovi | Arzon Android va nazorat telefonida qo‘lda belgilangan 24 urinish. Yaroqli namunalarning kamida 90 foizida takror soni mos. Fizioterapevtning to‘g‘ri javobgacha faol vaqti uchun 10× faraz alohida tajribada tekshiriladi. |

Keyingi native ishlar qo‘lda bosim, DoriMos, «Yaqinim» va qadam qaydi. Ular uchun navbatdagi mahsulot bo‘laklari tanlanadi.

## Avvalgi V2 · Brauzerda mashq o‘lchovi va ommaviy klip tahlili

**Joriy ustuvorlik.** Hakam «Mashq demosini ochish»dan tayyor klipni ishga tushiradi. Jonli kamerada MediaPipe kadr ustida o‘lchanayotgan son–tizza–to‘piq chizig‘ini va joriy burchakni ko‘rsatadi. Kadrlar tahlilidan to‘liq sikllar sanaladi. Natija har bir sikl vaqti, eng kichik burchagi va demo maqsadiga yetganini beradi. Gemini o‘sha ommaviy klipni mustaqil ko‘radi. Hakam ikki sanoqni solishtiradi. Ma’lumotlar bazasi yoki akkaunt mashq demosini ochish uchun kerak emas.

| Ish | Hajm | Bog‘liqlik | Qabul mezoni va holat |
|---|---|---|---|
| Jonli CV va har bir sikl dalili | O‘rta | MediaPipe, masofaviy modelga bog‘liqlik yo‘q | Haqiqiy dekodlangan kadrda tayanch chizig‘i va burchak chiqadi. Natijada sikllar va vaqtlar bor. Yomon kadrda qayta urinish taklif qilinadi. `exp/mashq-cv-ai` filialida. |
| Videoni mustaqil Gemini tahlili | O‘rta | Ommaviy CDC klipi, server kaliti va demo flag | Model klipni CV sanoqisiz tahlil qiladi. Ikki o‘lchov ko‘rinadi. Gemini ishlamasa CV natijasi turadi. Real kamera va yuklangan shaxsiy video brauzerda qoladi. `exp/mashq-cv-ai` filialida. |
| Mahalliy video tahlil vaqti | O‘rta | Bir xil klipda oldingi va ketma-ket dekoder o‘lchovi | Kadr izlash soni kamayadi. Ikkita sikl va bo‘sh kadrni rad etish o‘z kuchida. Gemini tugmasi CV tahlili ketayotganda ham ishlaydi. |
| Telefon va alohida kadr sinovlari | O‘rta | Jismoniy Android/iOS, mos litsenziyali turli kliplar, qo‘lda belgilangan sikllar | To‘liq va chala harakat, kadrdan chiqish, yorug‘lik va kamera burchagi bo‘yicha etalon bilan solishtiring. Qurilma, brauzer, muvaffaqiyat va rad holatlarini yozing. |
| Ovozli jonli kuzatuv | O‘rta | Telefon sinovi, qo‘llanadigan provayder shartlari | Keyingi tajriba. CV belgilagan «kadrda ko‘rinmayapti» kabi o‘lchov holatlaridan ovoz chiqishi va brauzerda ovozni darhol to‘xtatish tekshiriladi. Gemini Live uchun faqat shu maqsadga ruxsat berilgan namuna muhitida alohida sinov. |

**Lokal sinash.** `DEMO_MODE=true` va alohida `SESSION_SECRET` bilan ishga tushiring. `/demo/mashq` da **CDC namunasini sinash** ni bosing. Gemini tugmasi uchun `EXERCISE_GEMINI_DEMO=true` va serverdagi `GEMINI_API_KEY` kerak. Jonli provayder brauzer testini `SHIFO_E2E_EXERCISE_GEMINI=1 npm run e2e -- tests/e2e/exercise-preview.spec.ts --workers=1` bilan tanlang. [Video tahlili](https://aistudio.google.com/docs/video-understanding) · [Gemini foydalanish shartlari](https://aistudio.google.com/docs/terms)

## Telefon sinovidan keyingi ketma-ketlik

Vercel’dagi demo `ffdc850`dan chiqarilgan. Lokal `1c7ddd7` hisoblagich tuzatishi bilan loyiha egasi Android brauzerida 8 to‘liq va 2 chala takror hamda yashil tayanch chizig‘ini ko‘rdi. Bajarilgan takrorlarning etalon sanog‘i yozilmagan. Ushbu sinov kamera oqimi ishlaganini tasdiqlaydi. [Benchmark](BENCHMARK.md#jonli-kamerada-sekin-kadr-oqimi)

| Tartib | Ish | Hajm va bog‘liqlik | Qabul mezoni |
|---|---|---|---|
| 1 | Web relizni yakunlash | Kichik. Kamera tuzatishi va egasi roziligi | Test ma’lumotlari bilan Chrome Android’da oldindan belgilangan takrorlar, kadrdan chiqish va qayta kirish tekshiriladi. Boshqa qurilmada, imkon bo‘lsa iOS Safari’da, CDC va kamera oqimi qaytariladi. Hakam yo‘riqnomasida kamera, CDC va Gemini qadamlarini ko‘rsating. Qabuldan keyin ikkala HTTPS domenda yangi reliz, demo rollari va Gemini namunasi ochiladi. |
| 2 | O‘lchov sifatini yaxshilash | O‘rta. 1 va qo‘lda belgilangan test misollari | Kamera tayyorligini tik turgan holat aniqlangandan keyin ko‘rsating. Takror sanalmaganida kadr yetishmasligi va tugallanmagan siklni ajrating. Iloji boricha turli yorug‘lik, burchak va tezlikda qo‘lda belgilangan sikllar bo‘yicha o‘tkazib yuborilgan, ortiqcha va chala sanalgan takrorlarni yozing. Test natijasini o‘lchov ishonchidan alohida ko‘rsating. |
| 3 | Telegram Mini App’da mashqni ochish | Kichik sinov. 1 va alohida test bot | Bot menyusi bor HTTPS mashq sahifasini Telegram ichida ochadi. CDC klipi Android va iOS’dagi Telegram klientida tekshiriladi. Jonli kamera shu muhitda tekshiriladi, ruxsat yoki API yetishmasa brauzerda ochish tugmasi ishlaydi. Birinchi versiya ommaviy namuna bilan ishlaydi. Mavjud bildirishnomalar saqlanadi. [Telegram Mini Apps](https://core.telegram.org/bots/webapps) |
| 4 | Mashq bo‘yicha tahlil va ovoz | O‘rta. 2 va bir xil etalon sinovlar | Dastlab CV’dagi «kadrga qayting», sikl va tizza burchagi kabi kuzatuvlardan tushunarli yakun tuzing. Gemini Live’ni ommaviy namuna bilan alohida solishtiring. Ovozli yo‘l aniqroq fikr yoki tezroq qayta aloqa bersagina demo oqimiga qo‘shiladi. Shaxsiy kadrlar qurilmada qoladi. |
| 5 | Android’da mashq sinov APKsi | O‘rta. 2 va bir xil tayanch nuqtalari testlari | Mavjud Compose ilovasiga bitta nativ mashq ekrani qo‘shiladi. CameraX va qurilmadagi pose modeli bilan takror, tayanch chizig‘i va tizza burchagi ko‘rinadi. Shu trayektoriyalar web bilan solishtiriladi. Debug APK, lint va ulangan qurilmadagi UI sinovi o‘tadi. Klinik qayd yuborishdan oldin mobil mashq API’si uchun alohida kontrakt kerak. [CameraX](https://developer.android.com/media/camera/camerax/analyze) |
| 6 | Telegram bemor sessiyasi va Play sinov tarqatishi | Alohida ishlar. 3 yoki 5 natijasiga bog‘liq | Telegram sessiyasi kerak bo‘lsa server `initData`ni tekshiradi va tasdiqlangan bog‘lash orqali bemor rolini beradi. Android tarqatishda imzolangan build avval Play Internal Testing’da kichik guruhga beriladi. Hakam oqimi oddiy web havola orqali davom etadi. [Telegram sessiyasi](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) · [Play sinov kanallari](https://support.google.com/googleplay/android-developer/answer/9845334) |

Web, Telegram va Android bir xil vazifa va dalil kontraktiga ulanadi. Telegram birinchi bosqichda web interfeysni qayta ishlatadi. Android esa qurilmadagi kamera boshqaruvi va o‘lchov barqarorligi uchun alohida klient bo‘lib qoladi.

**Mashq prototipi.** `exp/mashq-cv-ai` da kamera boshlang‘ich holat tasdiqlanganda «Sanoq tayyor»ni ko‘rsatadi va yakunda kuzatuv uzilgan sikllarni tugallanmagan harakatlardan ajratadi. `/demo/mashq/tirsak` da CDC klipi, jonli kamera va lokal video bor. O‘tirib-turish sahifasida AI va MediaPipe vaqt oraliqlari solishtiriladi. OpenRouter’ning bepul video modeli ixtiyoriy va server kaliti bilan yoqiladi. Mashqning asosiy o‘lchovi MediaPipe’da ishlaydi. [Benchmark](BENCHMARK.md)

**Git va reliz.** Har commit bitta mantiqiy o‘zgarishni saqlaydi. Kerakli paytda ish filialini GitHub’ga push qilish mumkin. `main` push Vercel va Railway’ni ishga tushirishi mumkin. Vercel `promote` esa tekshirilgan buildga production domenlarini o‘tkazadi. Eksperimentni `main`ga birlashtirish va production reliz uchun egasi tasdig‘i olinadi. [Vercel promote](https://vercel.com/docs/deployments/promoting-a-deployment)

## Oldingi V2 · Uy davosidagi to‘siqqa javob

Hakam muvaffaqiyatni bitta natijadan ko‘ra oladi. Bemor dori tugaganini bildiradi, shifokor o‘sha yozuvga javob beradi, bemor javobni ko‘radi. Klinik natijani keyin bemor bilan tekshirish kerak. Task 2 uchun shu oqimdagi uzilishlarni tuzatamiz. [Audit](AUDIT.md) · [Uch mahsulot yo‘nalishi](FUTURE.md)

| Ish | Hajm | Bog‘liqlik | Qabul mezoni |
|---|---|---|---|
| 1. Ish joyi va relizni solishtirish | Kichik | Ikkala papkaning tekshirilgan zaxirasi | Asosiy papkada reliz tarixi hamda Task 1 ning yakuniy ssenariysi bor. Ommaviy havolada asosiy oqim takrorlanadi. |
| 2. Hakamning birinchi urinishini tuzatish | Kichik | 1 | Kirishda ikki rolning vazifasi tushunarli. Namuna rejaning odatiy sozlamasi dori tugaganini navbatga chiqaradi, shifokor buni o‘chirishi mumkin. 360 px ekranda rollar sahifasini pastga aylantirmasdan almashtirish mumkin. |
| 3. Eski murojaatga yangi javobni yetkazish | O‘rta | Tanlangan log bo‘yicha ko‘rik va test bazasi | Shifokor oldingi haftadagi ochiq murojaatga bugun javob bersa, bemor javobni va murojaat sanasini ko‘radi. Aloqasiz eski dalil ochilmaydi. Haftalik ijro hisobi o‘zgarmaydi. |
| 4. Media yo‘llarini barqarorlashtirish | O‘rta | Haqiqiy CDC klipi va sintetik Gemini namunasi | Yozilgan video kadrlar vaqtini fayldan olib tahlil qiladi. L2 uchun bemor tasdig‘i talab qilinadi. DoriMosda zaxira modelga vaqt qoladi, sifatsiz rasm qayta urinishga yuboriladi. |
| 5. Topshirish va qayta sinash | Kichik | 2–4 | Lokal production build, unit va brauzer testlari natijalari yoziladi. Ko‘rik va L4 ma’nosi, namuna quti/video, kamera chegarasi, AI vazifasi tushuntiriladi. Jamoa tasdiqlagan muddat 22-noyabr 23:59 MYT. Topshirishdagi qabul tasdig‘i kabinetda saqlanadi. |
| 6. Bir nechta bemorning murojaatini qabul qilish va topshirish | O‘rta · topshirishdan keyin | Klinika xodimining ish tartibi va alohida eksperimental filial | Ikki sintetik bemor bir xil sabab yuboradi. Mas’ul birini qabul qilib, boshqa xodimga topshira oladi. Noto‘g‘ri bemor yozuviga ko‘rik o‘tmaydi. Integratsiyadan oldin jamoa demoni sinaydi. |

**Alohida namoyish.** `exp/murojaat-natijasi` filialida bemor shifokor ko‘rgan «Dori tugadi» yozuvi uchun dorini olganini yoki hali yordam kerakligini bildiradi. Bu javob L4 va dori qabul qilish hisobidan mustaqil. Alohida sinov bazasidan foydalaniladi. `8c248e7` da 129 web unit va 4 klinik Chromium sinovi o‘tdi. Sinash uchun shifokor «Dori tugadi»ga javob berib qaydni tasdiqlaydi, bemor avval «Hali yordam kerak»ni yuboradi, shifokor qayta bog‘lanish navbatini ko‘radi, keyin bemor «Dorini oldim»ni yuboradi. Birlashtirish bitta qo‘shimcha jadvalni va egasining roziligini talab qiladi. Yakuniy xato xabarni tuzatish tajriba doirasidan tashqarida.

**Chiqarish qarori.** Lokal `main` ishonchlilik ishlari uchun. Eksperiment alohida filialda. Remote `main`ga push Vercel va Railway chiqishini boshlaydi. Egasi rozilik bergach avval test natijalarini ko‘rib chiqing, so‘ng aynan yuboriladigan havolada [hakam checklisti](../tasks/task-2/README.md)ni qaytaring. Ommaviy tekshiruv muvaffaqiyatsiz bo‘lsa jamoaga qaysi qadam buzilganini bildiring va oldingi tekshirilgan relizni tiklashni kelishing.

**Topshirishdan keyingi klinik ishlar.** Simptom va takroriy o‘lchov uchun mustaqil yozuv, mashq og‘rig‘i uchun ko‘rilguncha saqlanadigan navbat, bemor roziligi va kirish nazorati kerak. Bu talablarga [audit](AUDIT.md) va [pilot rejasi](FUTURE.md)da qabul misollari berilgan.


## Bajarilgan tekshiruvlar · 20-noyabr

- Lokal `main` uchun `npm run verify` o‘tdi. 127 web unit, typecheck, lint va production build. Python Telegram uchun 18 unit test o‘tdi.
- Bo‘sh sxemadan ochilgan Neon `codex-dev` bazasida 15 Chromium testi o‘tdi. Bunda eski qaydga javob, 360 px ekranda rol almashtirish, real MediaPipe namuna videosi, haqiqiy Gemini sintetik OCR, Android web API va mock Telegram bor. CDC bo‘yicha yana 3 ta mustaqil sinov o‘tdi. [Media o‘lchovlari](BENCHMARK.md)
- Ommaviy demo va «Demo haqida» HTTP 200, Railway healthcheck HTTP 200. Ommaviy tekshiruv chiqarilgan `b135fda`ga tegishli. V2 lokal `main`da. [Ommaviy sinov](AUDIT.md)
- Lokal ilova `~/Projects/uzhack` dan `http://127.0.0.1:3000` manzilida ishga tushirildi. `codex-dev` bazasi 24-noyabr soat 08:00 MYT da avtomatik tugaydi. Keyin lokal demo uchun yangi ajratilgan bazani sozlang. Ommaviy Vercel relizi production bazasiga ulangan.
