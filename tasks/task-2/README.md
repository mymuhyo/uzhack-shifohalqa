# Task 2 · Hakam checklisti

[Ochiq demo](https://shifohalqa.vercel.app/) · [Platformaga qo‘yiladigan qisqa inglizcha matn](SUBMISSION.md) · [Ommaviy sinov dalillari](../../docs/AUDIT.md)

## Topshirishdan oldin

### Reabilitatsiya relizi uchun yangi 90 soniyalik oqim

1. Toza brauzerda shifokor rolini oching va «Mashqni biriktirish»ni bosing.
2. Shu oynada bemor roliga o‘ting. «O‘tirib-turish mashqi» → «CDC namunasini sinash» orqali ikki siklni ko‘ring, tasdiqlang va namuna qaydini yuboring.
3. Sintetik ssenariyda «Og‘riq bor»ni bosing. Shifokor rolida «Og‘riq bildirildi» kartasiga javob yozing. CDC namunasi va og‘riq ikkita alohida qayd.
4. Bemor roliga qayting. Mashq sahifasidagi «Mashq bo‘yicha javoblar»da matnni tekshiring. Kamera ruxsati, APK va AI provayder kaliti kerak bo‘lmaydi.

Reliz uchun avval maqsad bazasiga yangi `schema.sql` ustunlarini qo‘llang. So‘ng aynan topshiriladigan HTTPS havolada yuqoridagi mashq oqimi va quyidagi dori oqimini tekshiring.

Har yakuniy relizda toza Incognito oynada ushbu ketma-ketlikni bajaring. 20-noyabrdagi mavjud ommaviy reliz shu oqimdan o‘tdi. Lokal V2 natijalari [V2 rejasida](../../docs/V2_PLAN.md).

- [ ] HTTPS bosh sahifasi va «Demo haqida» ochiladi. APK, parol, kamera yoki Telegram so‘ralmasdan ikkala demo roli ishlaydi. Shifokor va bemorni bir xil oynada almashtiring.
- [ ] Mashq demosida **CDC namunasini sinash** tugmasi real MediaPipe natijasini chiqaradi. Gemini’ni yoqilgan bo‘lsa alohida ishga tushiring va taxminiy vaqtlarni MediaPipe sikllari bilan solishtiring. Kamera ruxsati talab qilinadigan jonli sinovdan oldin yozilgan klipni ko‘rsatish mumkin. Tirsak yo‘li chiqarilgan bo‘lsa, uning CDC namunasi ham ochiladi.
- [ ] **Shifokor sifatida kirish** → «Dori tugadi» bandi yoqilganini tekshirish → **Rejani biriktirish**.
- [ ] **Bemor sifatida kirish** → **Icha olmadim** → **Dori tugadi** → **Sababni yuborish**. Alohida ikkinchi qayd uchun faqat sintetik misol sifatida bosimni rejaning kuzatuv chegarasida kiriting.
- [ ] **Shifokor** → «Dori tugadi» → **Ko‘rib chiqish** → **Bemorga javob** → **Qaydni tasdiqlash**. **Bemor** rolida o‘sha dori qaydida javob va L4 bor. Ikkinchi bosim qaydi L0 bo‘lib qolgan.
- [ ] Ixtiyoriy «Yaqinim» ssenariysi uchun bemor ulashishni yoqadi. Boshqa brauzer/profilda uchta kunlik hisob ko‘rinadi. Bemor ulashishni o‘chiradi va o‘sha havola qayta ochilganda yopiq bo‘ladi.
- [ ] **Simulyatsiya izohi** matnda va ekranda mos. Bemor, shifokor, reja va dori qutilari sintetik. CDC mashqi yozib olingan namuna, tasdiqlangan video L2. Jismoniy kamera qabul natijasi faqat haqiqiy qurilmada o‘lchangach yoziladi.
- [ ] **AI-use note** bor. Codex dasturlash va tekshiruvda, MediaPipe brauzerdagi harakatni o‘lchashda, Gemini sintetik quti sifatini tekshirish va yozuvini o‘qishda ishlatilgan. Shartli bayroqni qoidalar hisoblaydi, javobni shifokor yozadi.
- [ ] Jamoa kabinetida Task 2 sanasi, soati va mintaqasini tekshiradi. Ochiq FAQ 22-noyabrni ko‘rsatadi. Jamoa 22-noyabr 23:59 MYT (20:59 UZT) vaqtini tasdiqladi. Jamoa havola va [submission matni](SUBMISSION.md)ni yuborib, Platform qabul tasdig‘ini saqlaydi. [FAQ](https://uzhack.uz/en#faq) · [Platform](https://uzhack.uz/en/login)
- [ ] Grand Final yakunigacha mas’ul a’zo domen, Vercel va Neon holatini kuzatadi. Har relizdan keyin yangi Incognito oynada asosiy oqimni takrorlaydi. O‘chirilishi mumkin bo‘lgan test filiali faqat lokal ishlash uchun.
