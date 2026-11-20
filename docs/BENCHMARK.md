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
