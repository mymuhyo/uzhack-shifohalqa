# V2 · Uy davosidagi to‘siqqa javob

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
