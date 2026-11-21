# ShifoHalqa · Demo benchmarklari

## MediaPipe

20-noyabr 2026 (MYT) · `codex/dev` ish daraxti · lokal production build · Chromium 159.0.8154.6, Linux x64, 360 px viewport · `@mediapipe/tasks-vision` 1.2.3, Lite, CPU. Natija vaqti video tanlash yoki namuna tugmasini bosishdan boshlab o‘lchandi. Vaqt model yuklanishi va real vaqt rejimidagi video ijrosini ham o‘z ichiga oladi.

| Sinov | Kutilgan holat | Kuzatilgan natija |
|---|---|---|
| CDC klipi · 360 × 568, 24 fps, 8.792 s | Kadrlarni qo‘lda ko‘rishda ikki to‘liq tik turish → o‘tirish → tik turish sikli. | 2 to‘liq, 0 chala. 103 kadr tahlil qilindi. Eng kichik burchak 89.3°, landmarklarga asoslangan ishonch 0.866. Natijagacha 9.608 s. Bemor tasdig‘idan so‘ng `L2`, `sample: true`, `primary: false` saqlandi. |
| Odam bo‘lmagan video · 320 × 240, 1 s | Kadr sifati yetishmasligi va qo‘lda kiritish yo‘li. | 1.915 s ichida qayta urinish xabari chiqdi. Tahlilda beshta GET va xom video uchun nol upload. Qo‘lda kiritilgan qiymat L0 bo‘lib saqlandi. |
| Kamera ruxsati rad etilishi · Chromium test sharoiti | Video tanlash yoki qo‘lda qayd yo‘li. | Tushunarli xabar chiqdi. Model sinovi qurilmadagi video bilan davom etdi. |

CDC videosining 51.55 s dan boshlangan bo‘lagi kesilib, tahlil qilinadigan odam atrofida toraytirildi va audio olib tashlandi. Bu ommaviy namuna klipi. Modelning `confidence` qiymati tayanch nuqtalar ko‘rinishini va kadrlar qamrovini ifodalaydi. [CDC videosi va public-domain litsenziyasi](https://commons.wikimedia.org/wiki/File:30-Second_Chair_Stand_Test.webm)

Repodagi Pose Landmarker Lite modeli Google e’lon qilgan `float16/1` fayliga mos. SHA-256 `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`. [Model fayli](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task) · [Google model kartasi](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf) · [Apache 2.0 litsenziyasi](../public/models/LICENSE.txt)

Qo‘shimcha API sinovida sintetik o‘lchovlar bilan fayl L2, jonli kamera manbasi L3, past ishonchda qayta urinish, aynan bir faylga rad javobi va o‘xshash harakat signali tekshirildi. Bu sinov kamera aniqligini o‘lchamaydi. Haqiqiy telefon kamerasi, turli burchaklar va bir nechta qo‘lda belgilangan kliplar bilan qabul sinovi ochiq. [Playwright sinovlari](../tests/e2e/exercise.spec.ts)

20-noyabr 2026 (MYT) · Chromium 159.0.8154.6, Linux x64, 390 px viewport. Kamera o‘rnida bo‘sh kadrlar bilan boshlangan va tugagan CDC klipidan `MediaStream` berildi. Avvalgi kod ikki takrorni ko‘rsatdi, «To‘xtatish» bosilganda esa qayta urinish xabarini chiqardi. Tuzatilgan kod tayyorlanish, kuzatish va kadrdan chiqish holatlarini ko‘rsatdi. «To‘xtatish»dan so‘ng ekranda 2 to‘liq, 0 chala takror, 89° va 85% ishonch ko‘rindi. Bu sinov natijani bazaga yuborishdan oldin tugatildi.

## DoriMos

20-noyabr 2026 (MYT) · `codex/dev` ish daraxti · `@google/genai` 3.6.1 · haqiqiy Gemini API. Oldindan belgilangan 10 ta sintetik PNG har biri bir marta ishlandi. Reja namunasi «Namuna dori 5 mg». Vaqt modelga bog‘liq barcha so‘rovlar uchun o‘lchandi. Ishonch ustunida to‘rtta Decisions javobining eng past confidence qiymati berilgan.

| Namuna | Kutilgan natija | Kuzatilgan natija | Min. ishonch | Vaqt |
|---|---|---|---:|---:|
| `box-5mg` | Namuna dori 5 mg | Namuna dori 5 mg · mos | 0.852 | 9.270 s |
| `box-10mg` | Namuna dori 10 mg | Namuna dori 10 mg · kuchi farq qiladi | 0.870 | 9.310 s |
| `box-other` | Andoza dori 5 mg | Andoza dori 5 mg · nomi farq qiladi | 0.842 | 8.924 s |
| `box-unreadable` | Xira · qayta urinish | Qayta urinish | 0.377 | 0.771 s |
| `box-5mg-angled` | Namuna dori 5 mg | Namuna dori 5 mg · mos | 0.808 | 6.900 s |
| `box-5mg-low-light` | Namuna dori 5 mg | Namuna dori 5 mg · mos | 0.859 | 8.796 s |
| `box-2-5mg` | Namuna dori 2.5 mg | Namuna dori 2.5 mg · kuchi farq qiladi | 0.843 | 8.979 s |
| `box-20mg` | Namuna dori 20 mg | Namuna dori 20 mg · kuchi farq qiladi | 0.846 | 9.693 s |
| `box-label-covered` | Yozuv yopilgan · qayta urinish | Qayta urinish | 0.818 | 0.671 s |
| `box-side-only` | Qutining yoni · qayta urinish | Qayta urinish | 0.789 | 0.779 s |

O‘qiladigan 7 ta rasmning barchasida nom, kuch va birlik to‘g‘ri ajratildi. Uchta o‘qilmas namunaning barchasi qayta urinishga yo‘naltirildi. `gemini-decision-1` barcha 10 ta rasmda javob berdi. Ajratish uchun `gemini-4-hydrogen` asosiy model edi. Yakuniy testda 7 ta yozuvni `gemini-3.5-flash-lite` zaxira modeli o‘qidi. Yorlig‘i yopiq namunaning o‘qilish ehtimoli 0.070 bo‘lgani sababli qayta urinish berildi. Bu natijalar shu sintetik to‘plamga tegishli.

Oldingi ishga tushirishda zaxira modelga vaqt ajratilmaganida 20 mg namuna 12.004 soniyada `manual/timeout` qaytardi. O‘sha ishga tushirishda Hydrogen 5 ta yozuvni, Flash-Lite 1 ta yozuvni o‘qigan. Yangilangan oqimda umumiy 12 soniyaning oxirgi 4 soniyasi zaxira model uchun ajratilgan.

Ilova tasdiqlanmagan OCR natijasini dalilga aylantirmaydi. Bemor tasdiqlagan mos kelmaslik qizil bayroq chiqaradi. Xizmatdan javob kelmasa, bemor quti tekshirilmaganini L0 qilib qayd eta oladi. [Fixture manifesti](../src/lib/dorimos-samples.ts) · [Benchmark buyrug‘i](../scripts/dorimos-benchmark.ts) · [Interactions v1](https://aistudio.google.com/api-reference/interactions-api/create-interaction.md?api-version=v1) · [Decisions](https://aistudio.google.com/docs/decisions-api.md)

## Android animatsiyalari

20-noyabr 2026 (MYT) · Samsung SM-S928B, Android 17 (API 37) · native debug APK · tizim animatsiyalari 1×. Mustaqil demoda «Bugun» va «Javoblar» orasida besh marta ikki tomonlama o‘tish bajarildi. Ilovaga tegishli `dumpsys gfxinfo` o‘lchovida 486 kadrdan 10 tasi muddatidan kechikdi (2,06%). Kadr vaqti p50 5 ms, p95 8 ms va p99 36 ms. Bu raqamlar shu telefon va shu o‘tishlar uchun olingan.

Ulangan demoda shu telefonda «Icha olmadim» oynasini ochish, sabab tanlash va qaydni server javobi bilan yopish ikki marta o‘lchandi. Birinchi urinishda 211 kadrdan 9 tasi kechikdi (4,27%). Kadr vaqti p50 5 ms, p95 11 ms va p99 40 ms. Ikkinchisida 231 kadrdan 11 tasi kechikdi (4,76%). Kadr vaqti p50 5 ms, p95 12 ms va p99 36 ms.

### Lokal V2 · sintetik 10 mg quti

20-noyabr. Birinchi to‘liq Chromium sinovida o‘qiladigan quti `manual` qaytardi. Xuddi shu eski vaqt sozlamasi bilan alohida qayta o‘lchashda sifat so‘rovi HTTP 200 (1 010 ms), birinchi model so‘rovi timeout (6 962 ms), zaxira model so‘rovi HTTP 200 (3 858 ms) bo‘ldi. Natija `needs_confirmation`, jami 11 886 ms. Bu bitta ishlash tezligi kuzatuvi. Birinchi model oynasi 5 soniyaga tushirilgach, alohida urinishda sifat so‘rovi HTTP 200 (793 ms), birinchi model HTTP 503 (3 013 ms) qaytardi, zaxira so‘rovi esa qolgan 8 170 ms ichida tugamadi. V2 sifat talabini saqlab, umumiy limitni 18 soniyaga uzaytiradi.


Yangi limitda to‘liq brauzer sinovi o‘tdi. Xira sintetik quti qayta urinishga yuborildi. 10 mg quti o‘qildi, bemor tasdiqlagach 5 mg namunaviy rejadan farqi shifokor navbatiga tushdi. Bitta brauzer ssenariysining umumiy vaqti 17,4 s. Bu alohida API javobi vaqti yoki xizmat darajasi ko‘rsatkichi sifatida ishlatilmaydi.

### Lokal V2 · yozilgan CDC klipi

Avval ikki worker ostidagi bitta Chromium ishga tushirishda 1 to‘liq va 1 chala takror qaytdi. Kadrlar taqdimot vaqtiga bog‘lanib qolgan ekan. V2 yozilgan klipni 80 ms oralig‘idagi media nuqtalari bo‘yicha izlaydi va bir xil dekodlangan kadrni ikkinchi marta sanamaydi. To‘liq suite va uchta alohida takrorda har safar **2 to‘liq, 0 chala, 109 kadr, 0,861 ishonch, 88,3°**. Tugmadan natijagacha 9 130, 10 754, 10 836 va 8 688 ms o‘lchandi. Bu bitta klip va Chromium uchun natija. Kamera ochiq turgan jismoniy telefon shu V2 tekshiruviga kirmadi. [Sinov](../tests/e2e/exercise.spec.ts)

### Mashq prototipi · Jonli kamera yo‘li

Chromiumga ommaviy CDC WebM klipidan tayyorlangan 360×568 Y4M fayli aylanib turuvchi kamera manbasi qilib berildi. Dastlabki kamera so‘rovi oqimni 360×480 qilib kesdi va sinovda tizza burchagi chiqmagan. Brauzerga kadr nisbatini tanlash qoldirilgach, 390×844 ekranda tayanch chizig‘i va burchak ko‘rindi. To‘xtatishdan oldin ekranda 1 to‘liq va 4 chala takror ko‘rindi. Kamera yopildi, kadr yuboradigan POST so‘rovi kuzatilmadi. Takrorlanuvchi klipdagi bu sanoq **kamera yo‘lining ishlashini** tekshiradi. Bitta klipning etalon sanog‘i va jismoniy telefondagi aniqlik alohida tekshiriladi.

### Mashq prototipi · CV va Gemini bir sahifada

21-noyabr 2026 · Chromium, 360×800 · repodagi 8,792 soniyalik ommaviy CDC klipi. MediaPipe ikkita to‘liq siklni qaytardi. 1,2–4,2 s oralig‘idagi siklning minimumi 94°, 5,3–8,5 s oralig‘idagisi 88°. Tugmadan jadvalgacha 59 405 ms kuzatildi. Oldingi mahalliy sinovlar va hozirgi yuklama ostidagi o‘lchov bir xil tezlikni va’da qilishga yetarli emas.

Gemini `gemini-3.5-flash-lite` shu klipni MediaPipe raqamlarisiz tahlil qildi va taxminan 2 s va 6 s da o‘tirish kuzatilganini qaytardi. Interfeys ikki modelning ikkita tugallangan sikl sanaganini ko‘rsatdi. Gemini tugmasidan tekshirilgan javobgacha 11 740 ms. Bu bir klipdagi moslik, boshqa odamlar va kamera sharoitlarida aniqlik o‘lchanmagan. [Mashq rejasi](V2_PLAN.md) · [Sinov](../tests/e2e/exercise-preview.spec.ts)

Yakuniy CSS tuzatishidan keyin ayni 360×800 Chromium oqimi boshidan oxirigacha o‘tdi. Ikki CV sikli va Gemini vaqtlari aynan takrorlandi. Bu urinishda CV 58 578 ms, Gemini 18 752 ms oldi. Sahifa 360 px eniga sig‘di. Mashq tahlili endpointi foydalanuvchi videosi maydonini HTTP 400 bilan rad etdi.

### Mashq prototipi · ketma-ket video dekodlash

21-noyabr 2026 · Chromium, 360×800, bir xil ommaviy CDC klipi. O‘lchov tugma bosilishidan jadvalgacha. Seek vaqti brauzerdagi `seeking` va `seeked` hodisalari oralig‘ining yig‘indisi.

| Yo‘l | Jami vaqt | Seek soni va yig‘indi vaqt | O‘lchov |
|---|---:|---:|---|
| Oldingi build | 54 103 ms | 110, 20 184 ms | 2 to‘liq, 0 chala |
| Yangilangan WebCodecs/Mediabunny | 40 803 ms | 0 | 2 to‘liq, 0 chala |
| O‘sha yangilangan buildda `VideoDecoder` o‘chirilgan | 63 589 ms | 110, 23 769 ms | 2 to‘liq, 0 chala |

Uchala yo‘lda 1,2–4,2 s sikli 94°, 5,3–8,5 s sikli 88° bo‘ldi. Bir xil builddagi ikki alohida urinishda ketma-ket dekoder jami vaqtni taxminan 36% kamaytirdi. Bu mahalliy qurilmada bitta klip o‘lchovi. Odam ko‘rinmaydigan WebM 10 737 ms da qayta urinishga yo‘naltirildi. Kamera yoki video ma’lumotini jo‘natadigan POST kuzatilmadi.

Yakuniy 360×800 brauzer sinovida CDC klipi ishga tushgach, CV tugashidan oldin alohida Gemini tugmasi bosildi. MediaPipe 37 145 ms da jadvalni ko‘rsatdi. Gemini so‘rovi 2 994 ms da, CV dan oldin tugadi va 2 s hamda 6 s ni qaytardi. Birinchi tugmadan ikkala natija ko‘rinishigacha 37 389 ms o‘tdi. Bu bitta brauzer urinishidagi tarmoq va qurilma natijasi.

### Jonli kamerada sekin kadr oqimi

21-noyabr 2026 (MYT). Sintetik tayanch nuqtalari testida eski hisoblagich ko‘rinish ballari almashganda yoki oqim 4 kadr/soniyaga tushganda 0 sikl qaytardi. Tuzatilgan hisoblagich har ikkala testda 1 ta to‘liq sikl topdi. Alohida test 400 ms dan uzoq uzilish ustidan sikl tuzilmasligini tekshirdi.

Desktop Chromium mobil emulyatsiyasida ommaviy CDC klipini taxminan 8 kadr/soniyada virtual kamera sifatida uzatdik. Ikki yurishda 2 sikl topildi, har safar 1 to‘liq va 1 chala. Birinchi siklning hisoblangan eng kichik burchagi 101° va 102° chiqdi, demo chegarasi 100°. Yozilgan klip rejimi 2 to‘liq va 0 chala sikl berdi. Virtual kamera to‘xtatilganda trek yopildi va POST so‘rovi kuzatilmadi.

Jismoniy Android telefonida loyiha egasi lokal `1c7ddd7` tuzatishini sinab, ekranda **8 to‘liq, 2 chala** takror hamda tizza va to‘piq ustidagi yashil chiziq ko‘ringanini bildirdi. Bajarilgan takrorlarning qo‘lda belgilangan soni va burchaklari qayd etilmagan, shuning uchun aniqlik hisoblanmadi.

### Tirsak demo klipi

21-noyabr 2026 (MYT). 360×800 Chromium sinovida real MediaPipe CDC klipining bir to‘liq tirsak bukish va yozish siklini topdi. Natija 1 to‘liq, 0 chala. Namuna CDC videosining 46.2 soniyasidan olingan, 8.7 soniyaga kesilgan, bitta ijrochi atrofi qirqilgan va audio olib tashlangan. Bu bitta yozilgan klip natijasi. Tirsak uchun jismoniy kamera aniqligi hali o‘lchanmagan. [CDC klipi va litsenziya](https://commons.wikimedia.org/wiki/File:Muscle_Strengthening_at_Home_-_Bicep_Curls.webm)

Yakuniy buildda WebCodecs o‘chirilgan Chromium eski izlash bilan 56 078 ms da ayni ikki siklni berdi. Odam ko‘rinmaydigan klip ketma-ket yo‘lda 8 267 ms da qayta urinishni ko‘rsatdi. CDC klipining H.264 MP4 ga qayta kodlangan varianti fayl tanlash orqali 38 806 ms da 2 to‘liq va 0 chala sikl qaytardi. Ikki siklda 93° va 87° minimum o‘lchandi. MP4 brauzerda tahlil qilindi, Gemini paneli ochilmadi va POST kuzatilmadi.

Jonli kamera uchun yakuniy virtual sinovlardan birida ekranga 0 to‘liq va 6 chala sikl chiqdi. Oldingi aylanuvchi klip urinishida 1 to‘liq va 4 chala bo‘lgan. Aylanma klip sikllari etalon sifatida ishlatilmadi. Alohida resurs sinovi 360×568 oqim saqlanishini, tayanch chizig‘i va joriy burchak chiqishini, «To‘xtatish» treklarni yakunlashini va POST bo‘lmasligini tekshirdi. USB orqali jismoniy telefon topilmadi. Jonli sikl aniqligi qurilma va kadr tezligi bilan alohida sinov talab qiladi.
