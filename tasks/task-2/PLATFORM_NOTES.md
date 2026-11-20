# ShifoHalqa · Task 2 holati

20-noyabr 2026 · Quyida avvalgi reliz tekshiruvlari ham saqlangan. Eng so‘nggi mustaqil ommaviy sinov [auditda](../../docs/AUDIT.md). [Ochiq demo manzili](https://shifohalqa.vercel.app/) · [Platform formasi uchun matn](SUBMISSION.md)

| Oqim | Holat |
|---|---|
| Demo kirishi | Bosh sahifada «Shifokor sifatida kirish» yoki «Bemor sifatida kirish» tugmasini bosing. Dr. Sardor va Anvar aka sintetik foydalanuvchilar. Rol almashtirish shu demo ish joyini saqlaydi. Har yangi brauzer sessiyasi o‘z ish joyini oladi. |
| Reja va bemor qaydi | Shifokor dori, vaqt va bosim chegaralarini belgilaydi. Bemor dori holatini yoki o‘zi o‘lchagan bosimni qayd etadi. Bitta kunlik vazifa bitta qaydni qabul qiladi. |
| Shifokor ko‘rigi | Navbatda sabab, Toshkent vaqti va manba ko‘rinadi. Shifokor tanlangan qaydni tasdiqlaydi yoki qayta o‘lchashni so‘raydi. Bemor o‘sha qaydda javobni ko‘radi. |
| Mashq | Shifokor mashq rejasini biriktiradi. Bemor brauzerda jonli kamera, o‘z videosi yoki CDC namunasidan foydalanadi. Kadrlar qurilmada qoladi. Server demoda brauzerdan kelgan o‘lchovni saqlaydi. Namuna uchun 2 to‘liq takror topildi va L2 saqlandi. Qo‘lda takror va og‘riq xabari L0. Haqiqiy telefon kamerasi qabul sinovi ochiq. |
| Reja ijrosi va qadamlar | Bemor bugungi va yetti kunlik dori va bosim hisobini ko‘radi. Shifokor hisobga kirgan vazifalar va sanalarni ochadi. Qo‘lda qadam L0 va alohida saqlanadi. |
| DoriMos | Bemor to‘rtta tayyor sintetik qutidan birini tanlaydi. Haqiqiy Gemini o‘qiydi. Bemor yozuvni tasdiqlaydi. Mos kelmagan nom yoki kuch shifokor navbatiga L2 sifatida tushadi. Xira rasm qayta urinishga yo‘naltiriladi, xizmat ishlamasa L0 qo‘lda qayd bor. |
| «Yaqinim» | Bemor yoqqan 24 soatlik havola muddati kelgan, javob berilgan va bajarilgan vazifalar sonini ko‘rsatadi. Yaqin inson alohida brauzerda havolani ochadi. Bemor havolani yangilashi yoki bekor qilishi mumkin. |
| Telegram bot | `/bugun` orqali bemor ilovani ochadi. Shifokor shaxsiy chatini ulasa, yangi qizil qayd haqida umumiy bildirishnoma oladi. Jonli webhook va xabar yetkazilishi alohida bot hamda HTTPS relizidan keyin tekshiriladi. |
| Android | Alohida debug demo telefonda bir martalik kod bilan veb ish joyiga ulandi. Dori qaydi va aynan shu qayd bo‘yicha shifokor javobi ishladi. Task 2 hakam oqimi veb-ilovada bajariladi. |

## Demo ketma-ketligi

1. Shifokor sifatida kirib, rejada «Dori tugadi» xabarini tekshiruv navbatiga chiqarish bandi yoqilganini tekshiring va rejani biriktiring.
2. Bemor roliga o‘ting. «Icha olmadim» ostidan «Dori tugadi»ni tanlab yuboring. Ikkinchi dalil uchun shifokor belgilagan yuqori bosim chegarasiga teng namunaviy qiymat kiriting.
3. Shifokor roliga qayting. Navbatdan «Dori tugadi»ni oching, bemorga javob yozing va tasdiqlang. Shu qayd L4, bosim qaydi L0 bo‘lib qoladi.
4. Bemor rolida aynan dori qaydi ostidagi javobni ko‘ring.

**DoriMos.** Shifokor rejada «Namuna dori» va 5 mg ni qoldiradi. Bemor «DoriMos · qutini tekshirish»ni ochadi. Avval «Xira quti»ni sinang. Keyin «Namuna dori 10 mg»ni o‘qing va yozuvni tasdiqlang. Shifokor navbatida quti uchun alohida qayd chiqadi. Har dori vazifasi bittadan DoriMos qaydi oladi. Mos 5 mg natijani alohida sinash uchun «Demo haqida»dan yangi ish joyini boshlang va rejani qayta biriktiring.

**«Yaqinim».** Bemor sahifasida ulashishni yoqing va havolani ikkinchi Incognito oynada oching. Kundalik hisoblarni tekshiring. Bemor ulashishni o‘chirganidan keyin ikkinchi oynani yangilang. Havola faolligi tugaganini ko‘ring.

## Benchmark va demo chegaralari

- `npm run verify` typecheck, lint, 123 veb unit testi va production builddan o‘tdi. Python botining 18 ta unit testi o‘tdi. Ajratilgan Neon `codex-dev` va haqiqiy Gemini bilan 14 ta Chromium E2E o‘tdi. Telegram mock transportida 429 javobiga kutib qayta urinish, bir qaydga bitta bildirishnoma va oldingi `/stop` takrorlanganda yangi ulanish saqlanishi tekshirildi. DoriMos brauzer sinovi 390 px kenglikda ishladi.
- MediaPipe haqiqiy model bilan ommaviy klipdagi 2 ta to‘liq takrorni topdi. Namuna klipi L2, real telefon kamerasi qabuli jamoada ochiq.
- DoriMosning yakuniy Gemini sinovida 7 ta o‘qiladigan namuna to‘g‘ri o‘qildi va 3 ta o‘qilmas namuna qayta urinishga yuborildi. O‘qilgan yozuvlar zaxira modeldan qaytdi. Oldingi sinovda 12 soniyalik umumiy limit qo‘lda qayd yo‘lini ishga tushirgani kuzatildi. [O‘lchovlar](../../docs/BENCHMARK.md)
- Bemor va shifokor profillari hamda DoriMos qutilari sintetik. Real qutini yuklash, tonometr OCR, Teach-Back, Telegram Mini App, Android ommaviy relizi va klinik pilot keyingi bosqichda. Demo ish holati va shifokor javobi bazada saqlanadi.
- Klinik pilotdan oldin qo‘shimcha ko‘krak og‘rig‘i xabarini saqlangan bosim qaydidan keyin ham yuborish, ko‘rib chiqilmagan shoshilinch mashq qaydlarini navbatda saqlash va mashq o‘lchovi manbasini mustaqil tekshirish kerak.

## AI’dan foydalanish

Codex, uning subagentlari, Context7 va rasmiy Gemini hujjatlari kodlash hamda tekshiruvda ishlatildi. MediaPipe mashq kadrlarini brauzerda o‘lchaydi. `gemini-decision-1` sintetik qutining ko‘rinishi va yozuv sifatini tekshiradi. `gemini-4-hydrogen` va `gemini-3.5-flash-lite` zaxira modeli yozuvni ajratadi. Moslikni deterministik kod baholaydi. Klinika qarori shifokorga tegishli.

## Jamoaga topshirish

Ochiq relizda bosh sahifa va `/about` 200 javob berdi. Birinchi toza Chromium sinovida shifokor roli ochildi va panel «Demo ma’lumotlarini ochib bo‘lmadi» xabarini ko‘rsatdi. Neon `main` katalogida `shifohalqa` sxemasi yo‘qligi tasdiqlandi. Relizning `schema.sql` fayli bitta tranzaksiyada yangi sxema va 19 ta jadval yaratdi. Keyingi toza Chromium sessiyasida sintetik reja, «Dori tugadi», tanlangan qaydning L0 dan L4 ga o‘tishi va shifokor javobining bemorga ko‘rinishi o‘tdi. Bu tekshiruv 15,7 s davom etdi.

Ochiq relizning boshqa sintetik sessiyalarida DoriMos xira qutida qayta urinishni ko‘rsatdi va 5 mg rejaga qarshi tasdiqlangan 10 mg namunani shifokor navbatiga L2 qilib yozdi. «Yaqinim» havolasi boshqa sessiyada ochildi va bemor ulashishni bekor qilganidan keyin yopildi. Ochiq relizdagi MediaPipe modeli va CDC video namunasining SHA-256 qiymatlari ish daraxtidagi fayllarga mos keldi.

1. Real telefonda jonli kamera ruxsati, takrorlar, to‘xtatish va L3 saqlanishini o‘lchang. Qurilma va brauzer versiyasini benchmarkga yozing.
2. Platformga ishlayotgan URL, demo rollari, demo chegaralari va AI-use izohini joylang. [Platform formasi uchun matn](SUBMISSION.md)
3. `@shifohalqa_bot` webhooki Railway HTTPS servisiga ulangan. Vercel va Railway GitHub `main`dan chiqadi, Neon `shifohalqa/main`dan foydalanadi. Railway’da `/healthz`, imzoli sintetik `/bugun` va Vercel’dagi ikkala rol tugmasi tekshirildi. Shaxsiy chatga bitta sintetik qizil bildirishnoma yetib borishini qabul qilish ochiq. [Railway sozlamasi](../../README.md#railway-relizi)
