# ShifoHalqa — Discord + OBS bilan jonli taqdimot: to‘liq qo‘llanma

> **Maqsad:** 3 kishi bitta Discord qo‘ng‘irog‘ida, OBS orqali 1080p/30fps qilib yozib olish.
> Video 3–5 daqiqa bo‘lishi shart. Ideal: **4:20–4:30**.
> Deadline: **18-noyabr, 20:59 UZT / 23:59 MYT** (tashkilotchi uzaytirgan sana).

---

## 0. Qisqa xulosa: nega bu usul?

Sizning reja — Discord + OBS — **to‘g‘ri tanlov**. Lekin bitta muhim tuzatish bor:

❌ Discord oynasini kesib, 2 kishilik oynani “yasash” — ishonchsiz va xunuk.
✅ **Kamerani yoqish/o‘chirish** orqali Discord o‘zi 3 → 2 → 1 kishilik oynaga o‘tadi.
✅ OBS’da esa tayyor **5 ta scena** bor: 3 kishilik to‘liq ekran, slayd + 1 kishi, slayd + 2 kishi, faqat slayd, yakuniy 3 kishilik.

Discord’da **“Hide Non-Video Participants”** yoqilsa, kamera o‘chgan odamlar umuman ko‘rinmaydi. Shunda:
- 3 ta kamera yoniq → 3 kishilik oyna
- 2 ta kamera yoniq → 2 kishilik oyna
- 1 ta kamera yoniq → 1 kishilik oyna

Bu siz xohlagan “3 kishidan 2/1 kishiga silliq o‘tish”ning eng sodda va ishonchli yo‘li.

**Muqobil variantlar:**
| Variant | Afzalligi | Kamchiligi | Tavsiya |
|---|---|---|---|
| **Discord + OBS (shu qo‘llanma)** | Tez, hamma biladi, jonli effekt | Discord 720p siqadi, UI chiqishi mumkin | ✅ **Asosiy** |
| Har kim o‘zini alohida yozib, CapCut’da montaj | Eng sifatli 1080p, xatoni qayta yozish oson | Montajga 1.5–2 soat ketadi | ⭐ Zaxira / agar vaqt bo‘lsa |
| Zoom + OBS | Tanish, gallery view | 40 daqiqa limit, layout baribir qotib qoladi | ❌ Shart emas |
| VDO.Ninja + OBS browser source | Har kim alohida source, chiroyli animatsiya | `obs-studio-plugin-browser` o‘rnatish + yangi murakkablik | ❌ Deadline oldidan tavsiya etilmaydi |

**Xulosa:** hozir Discord + OBS bilan ketamiz. Quyidagini hisobga oling — fayllar holati yangilandi (15-noyabr):

> ⚠️ **HOLAT (15-noyabr tekshirildi):** Slidelar va yozuvlar papkasi hozircha **mavjud emas**. OBS scene collection aynan `~/Projects/uzhack/slides` papkasidagi `01.png…07.png` fayllarini kutadi — ular yaratilishi shart (Canva’dan 1920×1080 PNG sifatida eksport qiling). `presentatsiya_runbook.md` va `cue_sheet.md` endi `tasks/task-1/` ichida.

---

## 1. Tayyor fayllar va qolgan ishlar

| Nima | Joyi | Holati |
|---|---|---|
| OBS scene collection | `~/.config/obs-studio/basic/scenes/ShifoHalqa.json` | ✅ Tayyor (F1–F5) |
| OBS profile (1080p30, QSV, recordings) | `~/.config/obs-studio/basic/profiles/ShifoHalqa/basic.ini` | ✅ Tayyor |
| 7 ta slayd (PNG, 1920×1080) | `~/Projects/uzhack/slides/` | ❌ **Yaratilmagan** — 18-noyabrdan oldin tayyorlash shart |
| Yozuvlar papkasi | `~/Projects/uzhack/recordings/` | ❌ Yaratilmagan — `mkdir -p ~/Projects/uzhack/recordings` |
| Shu qo‘llanma | `tasks/task-1/presentatsiya_runbook.md` | ✅ (ko‘chirib qo‘yildi, sanalar yangilandi) |
| Bir varaqli cue sheet | `tasks/task-1/cue_sheet.md` | ✅ (ko‘chirib qo‘yildi, sanalar yangilandi) |

Slaydlar — Task 1 hujjatidagi mazmun asosida tayyorlash kerak. Agar o‘z dizayningiz bo‘lsa, xuddi shu nomlar bilan (`01.png` … `07.png`) `slides/` papkasiga qo‘ying yoki OBS’da “Slaydlar” source’ining papkasini o‘zgartiring.

---

## 2. Hozir qiladigan 6 ta qadam (10 daqiqa)

### 2.1. OBS’da scene collection’ni almashtirish
1. OBS ochiq bo‘lsin.
2. Yuqoridagi menyu: **Scene Collection → ShifoHalqa**.
   - Agar ro‘yxatda ko‘rinmasa: OBS’ni bir marta yopib, qayta oching (u avvalgi “Untitled”ni saqlab qo‘yadi), keyin yana tanlang.
3. Keyin: **Profile → ShifoHalqa**.
   - Ko‘rinmasa, xuddi shunday OBS’ni qayta oching.

### 2.2. Discord oynasini OBS’ga ulash
1. Avval **Discord’ni oching** va serverdagi voice channel’ga kiring (hozir Discord yopiq edi).
2. OBS’da **Sources** panelida **“Discord oynasi”**ni ikki marta bosing.
3. **Open Selector** tugmasini bosing.
4. Ochilgan portal oynasida **Window** bo‘limini tanlang va **Discord** oynasini belgilang:
   `Meeting Room | Uzhack Idrok - Discord`.
5. **Share** (yoki **Select**) tugmasini bosing.
6. **Show Cursor** belgisi o‘chiq bo‘lsin (men JSON’da o‘chirib qo‘ydim, lekin tekshirib ko‘ring).

Tekshirish: OBS preview’da Discord oynasi ko‘rinishi kerak. Agar qora bo‘lsa — Discord’ni minimize qilmang, oynani ochiq qoldiring va **Open Selector** bilan qayta tanlang. Agar butun ekran ko‘rinsa — portalda monitor emas, aynan **Window → Discord** tanlanganini tekshiring.

### 2.3. Slaydlarni tekshirish
1. **02 Slayd + 1 ma’ruzachi** scene’ini tanlang.
2. Preview’da 1-slayd ko‘rinishi kerak.
3. OBS’da **Right / Left** strelkalari bilan slaydlarni almashtirib ko‘ring.
   - Agar ishlamasa: **Settings → Hotkeys** → “Slide Show: Next Slide” / “Previous Slide” ni topib, Right/Left qo‘ying.
4. Har bir slayd 1920×1080 va o‘ng pastki burchakda PiP uchun joy borligini tekshiring.

### 2.4. Ovozni tekshirish
1. OBS **Audio Mixer** panelida **Desktop Audio** va **Mic/Aux** ko‘rinadi.
2. Discord’da boshqa odam gapirganda **Desktop Audio** ko‘rsatkichi harakatlanishi kerak.
3. O‘zingiz gapirganda **Mic/Aux** harakatlanishi kerak.
4. Ikkalasi ham qizil zonaga chiqmasin (clipping). Agar chiqsa, OBS’da shu source’ning slayderini pastga tushiring.
5. **Quloqchin taqing** — dinamik bilan mikrofon aks-sado beradi.
6. Discord’dagi **mic test / “Let’s Check”** oynasini yozuvdan oldin yoping — u mikrofon ovozini dinamikka chiqarib, OBS’da aks-sado yasashi mumkin.

### 2.5. Sinov yozuvi
1. **Start Recording** tugmasini bosing (yoki F9 — pastga qarang).
2. 15 soniya gapiring, scene’larni almashtiring, slaydni o‘zgartiring.
3. **Stop Recording**.
4. `~/Projects/uzhack/recordings/` papkasidagi faylni ochib ko‘ring:
   - Discord oynasi to‘g‘ri kesilganmi?
   - Slaydlar aniqmi?
   - PiP o‘ng pastda, slayd matnini yopmayaptimi?
   - Ovoz balansi yaxshimi? Aks-sado yo‘qmi?

### 2.6. F9 hotkey (agar kerak bo‘lsa)
OBS → **Settings → Hotkeys** → “Start Recording” → **F9**, “Stop Recording” → **F9** (yoki F10).
OBS fokusda bo‘lganda ishlaydi. Direktor OBS’ni fokusda ushlab tursin — Discord oynasi yonma-yon ko‘rinib tursin.

### 2.7. Bitta ekranda ishlash
- Discord oynasini chapga (~60%), OBS’ni o‘ngga (~40%) joylashtiring.
- OBS UI katta bo‘lsa: **Settings → Appearance → Font Scale 8 / Density 0.8**.
- Discord oynasi OBS bilan to‘liq yopilib qolmasin — aks holda Wayland capture’i qotishi mumkin. Yonma-yon turing.
- Imkon bo‘lsa, HDMI orqali ikkinchi monitor/TV ulang — direktor uchun eng qulay variant.

---

## 3. Discord sozlamalari (bir marta)

### 3.1. Har bir a’zo uchun
- **User Settings → Voice & Video:**
  - Input: o‘z mikrofoni
  - Output: **quloqchin**
  - **Echo Cancellation: ON**
  - **Noise Suppression: ON** (Krisp)
  - **Automatic Gain Control: ON**
  - Mic test: “Let’s Check” bilan tekshirish.
- **User Settings → Notifications:**
  - Desktop notifications: **OFF**
  - Notification sounds: **OFF**
  - Status: **Do Not Disturb**.
- Boshqa ilovalar (Telegram, Slack, mail) ovoz chiqarmasin.
- Discord oynasini minimize qilmang; kamera va mikrofon barqaror bo‘lsin.

### 3.2. Qo‘ng‘iroqda
- **Server voice channel**da bo‘ling (DM emas) — “Hide Non-Video Participants” shu yerda ishlaydi.
- Video grid’dagi **⋯ menyu** → **“Hide Non-Video Participants”** (yoki “Show Non-Video Participants”ni o‘chirish).
  - Agar bu option ko‘rinmasa: video ustiga bosing → **Focus** rejimi. Asosiy gapirayotgan kishi katta, qolganlari kichik thumbnail bo‘ladi. Bu ham ishlaydi, lekin “Hide Non-Video” tozaroq.
- Har bir a’zoning server nickname’ini `Ism — Rol` qilib qo‘ying (masalan, `Sardor — Tech Lead`). Bu videoda chiroyli ko‘rinadi.
- Hamma quloqchin taqsin. Aks holda mikrofon boshqalarning ovozini ham yozib oladi.
- Gapirmayotgan odam o‘zini **mute** qilsin. Faqat gapirayotgan odam unmute bo‘lsin.
- Kamera yoqish/o‘chirish — cue sheet bo‘yicha. Buni har bir a’zo o‘zi qiladi.

---

## 4. OBS scene’lari va hotkey’lar

| Scene | Hotkey | Nima ko‘rinadi | Qachon |
|---|---|---|---|
| **01 Intro — 3 kishi** | **F1** | Discord to‘liq ekran, 3 ta kamera | Intro, yakun |
| **02 Slayd + 1 ma’ruzachi** | **F2** | Slayd to‘liq + o‘ng pastda 560×315 PiP | Muammo, yechim |
| **03 Slayd + 2 ma’ruzachi** | **F3** | Slayd to‘liq + o‘ng pastda 640×360 PiP (2 kishi) | Texnik, MVP |
| **04 Slayd to‘liq** | **F4** | Faqat slayd | Murakkab sxema/grafik |
| **05 Yakun — 3 kishi** | **F5** | Discord to‘liq ekran, 3 ta kamera | Yakuniy so‘z |

- Slaydlar: **Right / Left**.
- Yozish: **F9** (o‘zingiz qo‘yasiz) yoki ekrandagi tugma.
- Transition: **Fade 400 ms** (default). Agar “slayd surilishi” effekti kerak bo‘lsa, OBS’dagi transition ro‘yxatidan **Slide** ni tanlang.
- **Cut** — tez slayd almashtirish uchun.

> **PiP’ni kattaroq va tozaroq qilish:** Discord oynasida o‘ng tomondagi **member list**ni yoping va chap paneldagi kanal ro‘yxatini minimal kenglikka torting. Video maydonini iloji boricha katta qoldiring. 1 kishilik segmentda video ustiga bosib **Focus** rejimini yoqish mumkin — yuz kattaroq ko‘rinadi. OBS’da PiP o‘lchamini preview’da sichqoncha bilan cho‘zib moslashtirsangiz ham bo‘ladi.

### Ixtiyoriy: “3 kishilik oyna PiP’ga aylanib kichrayishi”
Bu effekt uchun OBS’ning standart transition’i yetmaydi. `obs-move-transition` plugin’i kerak:
```bash
yay -S obs-move-transition
```
O‘rnatgandan keyin OBS’ni qayta oching → transition ro‘yxatida **Move** paydo bo‘ladi → duration **500 ms**.
Shunda F1 → F2 bosilganda Discord oynasi shunchaki fade bo‘lmay, **haqiqatan kichrayib o‘ng pastga suriladi**.
Agar plugin muammo qilsa, uni olib tashlang; Fade/Slide ham yetarli darajada chiroyli.

---

## 5. Taqdimot cue sheet (4:25)

> Bu jadvalni `cue_sheet.md` faylidan chop etib yoki ikkinchi ekranda ochib qo‘ying.

| Vaqt | Scene | Kamera yoniq | Kim gapiradi | Slayd | Harakat |
|---|---|---|---|---|---|
| 0:00–0:30 | **01 (F1)** | 3 ta | Har biri 8–10 soniya | 1 | Ism + rol. “Assalomu alaykum…” |
| 0:30–1:40 | **02 (F2)** | 3-a’zo | 3-a’zo | 2–3 | Muammo: Anvar aka, 3 uzilish, WHO |
| 1:40–2:30 | **02** | 1-a’zo | 1-a’zo | 4–5 | Yechim: ShifoHalqa, dalil narvoni |
| 2:30–3:15 | **03 (F3)** | 1-a’zo + 2-a’zo | 1 + 2 | 5 | Texnik: brauzer, MediaPipe, xavfsizlik |
| 3:15–4:00 | **03** | 2-a’zo + 3-a’zo | 2 + 3 | 6 | MVP: 4 qadamli oqim |
| 4:00–4:25 | **05 (F5)** | 3 ta | Har biri 1 gap | 7 | Yakun: ko‘prik, rahmat |

### Kamera almashinuvi qoidalari
- Kamera o‘chirish/yoqishni **scene almashtirishdan 1–2 soniya oldin** qiling.
- Masalan: 3-a’zo gapirib bo‘ldi → 3-a’zo kamerasini o‘chiradi, 1-a’zo yoqadi → Discord 1 kishilik oynaga o‘tadi → direktor F2/F3 bosadi.
- 2 kishilik segmentda **aynan 2 ta kamera** yoniq bo‘lsin; uchinchisi o‘chiq.
- Yakunda hamma kamerasini yoqadi → F5 → 3 kishilik oyna.

### Cue berish
- Direktor OBS’ni fokusda ushlab turadi.
- Jamoaga cue’larni **Discord text chat**da yozing (ovozli cue yozuvga tushib qolmasin):
  - `3-a'zo kamera OFF, 1-a'zo ON`
  - `F2 — slayd 2`
  - `F3 — 2 kishi`
- Yoki oldindan kelishilgan qo‘l ishoralari.

---

## 6. Mashq (rehearsal) — 20 daqiqa

### 6.1. Texnik mashq (10 daq)
- [ ] Har bir a’zo kamerasini yoqadi; yuz yorug‘likda, kamera ko‘z darajasida.
- [ ] Har bir a’zo 10 soniya gapiradi; OBS’da ovoz balansi tekshiriladi.
- [ ] 3 ta kamera yoniq → F1 preview.
- [ ] 2 ta kamera yoniq → F3 preview; ikkala yuz ko‘rinadimi?
- [ ] 1 ta kamera yoniq → F2 preview; PiP’da yuz aniqmi?
- [ ] Slaydlar Right/Left bilan almashadimi?
- [ ] F1 → F2 → F3 → F5 o‘tishlarini 2 marta takrorlang.
- [ ] 30 soniyalik sinov yozuvi; faylni birga ko‘ring.

### 6.2. To‘liq mashq (10 daq)
- [ ] Cue sheet bo‘yicha 4:25 ni boshidan oxirigacha o‘tish (yozmasdan).
- [ ] Kamera almashinuvlari va slayd o‘tishlarini sinxronlash.
- [ ] Vaqtni o‘lchash: 4:15–4:35 oralig‘ida tugashi kerak.
- [ ] Xatolar bo‘lsa, faqat o‘sha segmentni qayta mashq qilish.

### 6.3. Yakuniy yozuv
- [ ] Hamma tayyor; telefonlar jim; Discord DND.
- [ ] Direktor F9 bosadi; 2 soniya kutadi; “Assalomu alaykum…”.
- [ ] Cue sheet bo‘yicha boring.
- [ ] Yakunda 2 soniya jim turing; F9 bilan to‘xtating.
- [ ] Faylni darhol ochib ko‘ring: ovoz, video, davomiylik.

Agar bitta joyda xato bo‘lsa — **to‘xtamang**, davom eting. Keyin CapCut’da o‘sha joyni kesib, qayta yozilgan segment bilan almashtirsangiz bo‘ladi. Bir urinishda mukammal bo‘lishi shart emas.

---

## 7. Zaxira rejalar

### 7.1. Agar Discord video sifati past bo‘lsa
- Discord’da kamera sifatini “720p” yoki “Source” qilib qo‘ying (agar sozlama bo‘lsa).
- Yozuvda yuzlar kichik bo‘lsa, bu jiddiy emas; hakamlar uchun slaydlar va ovoz muhimroq.
- Agar imkon bo‘lsa, 3 kishilik intro’ni alohida 1080p telefon videolar bilan almashtiring (montajda).

### 7.2. Agar Discord/OBS buzilsa — individual yozuv
Har bir a’zo o‘z qismini telefon/noutbukda yozadi:
1. Telefon gorizontal (16:9), yorug‘lik yuzga, quloqchin bilan.
2. 2–3 martagacha takrorlash mumkin; eng yaxshisini olish.
3. Faylni Telegram’da **“Send as File”** yoki Google Drive orqali yuborish.
4. CapCut’da: intro — 3 ta video yonma-yon; asosiy qism — slayd + o‘sha gapirayotgan odamning PiP’i.
5. Bu usul sekinroq, lekin eng sifatli natija beradi.

### 7.3. Agar OBS crash bo‘lsa
- `hybrid_mp4` format ishlatilgani uchun fayl ko‘p hollarda o‘qiladi.
- OBS → **File → Remux Recordings** bilan `.mp4`ga o‘tkazing.
- `recordings/` papkasidagi eng yangi faylni tekshiring.

---

## 8. Tez-tez uchraydigan muammolar

| Muammo | Yechim |
|---|---|
| Discord oynasi qora | Discord’ni minimize qilmang; source’ni qayta tanlang; OBS’ni qayta oching |
| Butun ekran ko‘rinadi | Source → **Open Selector** → **Window** → Discord oynasini tanlang |
| Desktop Audio jim | Discord output = quloqchin; OBS Desktop Audio = **Default**; Discord’da ovoz chiqarib ko‘ring |
| Mic jim | OBS Mic/Aux = default input; Discord’da mic test; tizim mikrofoni tanlanganini tekshiring |
| Aks-sado | Hamma quloqchin taqsin; Discord echo cancellation ON; gapirmayotganlar mute |
| Ovoz qizil (clipping) | OBS mixer’da Desktop Audio / Mic slayderini pasaytiring; limiter bor |
| Hotkey ishlamayapti | OBS’ni bir marta bosing (fokus); Settings → Hotkeys; F1–F5 band bo‘lsa Ctrl+Alt+1…5 qo‘ying |
| Slayd almishmayapti | OBS fokusda bo‘lsin; Right/Left; Settings → Hotkeys → “Slide Show: Next Slide” |
| PiP slayd matnini yopadi | Slaydning o‘ng pastki qismini bo‘sh qoldiring yoki F4 (to‘liq slayd) ishlating |
| OBS preview qotadi | Boshqa og‘ir ilovalarni yoping; Discord’ni 720p qiling; OBS’ni qayta ishga tushiring |
| QSV encoder xato beradi | Settings → Output → Recording → Encoder: **x264**; preset: **veryfast** |
| Discord UI (pastki tugmalar) yozuvga tushadi | Sichqonchani Discord oynasidan uzoqlashtiring; yoki “Discord oynasi” source’iga **Crop** filter qo‘shib, yuqori/pastki qismini kesing |
| 2 kishilik oynada 3 kishi ko‘rinadi | Discord ⋯ → **Hide Non-Video Participants** yoqilganini tekshiring; uchinchi kamera o‘chiq bo‘lsin |

---

## 9. Topshirishdan oldin (Task 1)

- [ ] Video davomiyligi **3:00–5:00** (ideal 4:15–4:35).
- [ ] Uchala a’zo ham kamera oldida ko‘rinib, ismi va rolini aytdi.
- [ ] Slaydlar o‘qiladi; PiP yuzlarni yopmaydi.
- [ ] Ovoz bir tekis; aks-sado yo‘q; fon musiqasi yo‘q.
- [ ] Hech qanday to‘qilgan statistika/iqtibos yo‘q.
- [ ] YouTube’ga **Unlisted** qilib yuklash.
- [ ] Google Drive’ga zaxira nusxa, “Anyone with the link can view”.
- [ ] Incognito oynada havolani tekshirish.
- [ ] UzHack platformasidagi **Project** maydonlarini to‘ldirish.
- [ ] Deadline: **18-noyabr, 20:59 UZT / 23:59 MYT**.

---

## 10. Bir qarashda eng muhim 5 narsa

1. **Quloqchin** — aks-sadoning oldini oladi.
2. **Hide Non-Video Participants** — 3→2→1 oynaning siri.
3. **Kamera on/off** — scene almashishdan 1–2 soniya oldin.
4. **F1–F5 + Right/Left** — direktor OBS’da, Discord yonma-yon.
5. **Avval 30 soniyalik test yozuv** — keyin to‘liq yozuv.

Omad! 🎬
