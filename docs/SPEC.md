# docs/SPEC.md — ShifoHalqa mahsulot va texnik kontrakt (yagona joriy spetsifikatsiya)

> Eski reja fayllar `archive/` ga ko'chirildi; bu fayl — yagona joriy manba. Audit (17-nov-2026) va rasmiy brief asosida.

## 1. Muammo ("Ko'rinmas davr")
Farg'ona poliklinikalarida konsultatsiya ~10–15 daqiqa; undan keyin haftalar davomida uy davolanishi **nazoratsiz**: gipertenziya bemori dori dozasini adashtiradi (5 mg vs 10 mg quti), reabilitatsiya bemori mashqni qo'rquv/og'riq sabab tashlaydi, qon bosimi ko'tarilgani kech bilinadi. Shifokorda har kuni o'nlab bemorga qo'ng'iroq qilishga vaqt yo'q.

**Yechim:** shifokor bergan reja → bemor telefonida kundalik vazifalar → har vazifa **dalil darajasi** bilan qayd etiladi → deterministik qoidalar faqat **istisnolarni** (qizil/sariq) shifokor paneliga chiqaradi → shifokor qaror qiladi.

## 2. Oltin qoida (halollik shartnomasi)
> Kamera / Vision AI **o'lchaydi** → deterministik kod qoidalari **bayroq ko'taradi** → **shifokor qaror qiladi**.

AI hech qachon: tashxis qo'ymaydi, doza/mashq yukini o'zgartirmaydi, "dori ichildi isbotlandi" demaydi. Hech qachon: to'qima ma'lumot, iqtibos, foydalanuvchi fikri yoki benchmark natijasi. Barcha bemorlar sintetik va shunday belgilangan.

## 3. Rollar
| Rol | Kirish | Imkoniyat |
|---|---|---|
| `doctor` | 1-click demo | Reja shablonidan biriktirish, chegaralar (BP, tizza burchagi), exception dashboard, dalil ko'rish, L4 tasdiq, 7-kunlik xulosa |
| `patient` | 1-click demo | Bugungi vazifalar (o'zbekcha, katta tugmalar), dori/BP/qadam/mashq qayd, DoriMos, Teach-Back, `103` va `Og'riq bor` doim ko'rinadi |
| `caregiver` ("Yaqinim") | `/caregiver/[token]` | Read-only: oila a'zosi (mas. Malayziyadagi farzand) Farg'onadagi ota-onaning kunlik holatini ko'radi; `noindex`, audit |
| `individual` | ixtiyoriy (T4.3) | PAR-Q+ xavfsizlik filtri → xavfsiz profilga shablon vazifalar |

## 4. To'rt ustun
1. **Dori + DoriMos:** `Ichdim` / `Icha olmadim` (+sabab) → dori qutisi rasmi → OCR extract → calibrated gate → **bemor tasdig'i** → doza mismatch deterministik tekshiruv (5 mg vs 10 mg → qizil). Refill hisoblagichi kamayadi.
2. **Mashq (sit-to-stand):** on-device MediaPipe Pose — hip–knee–ankle burchagi, 5-frame smoothing, hysteresis state machine, valid vs shallow reps, confidence. Live kamera (L3) yoki yuklangan video (L2). Video sukut bo'yicha qurilmada qoladi.
3. **Vitals:** BP qo'lda yoki tonometr OCR (L2) + simptom checkbox (`bosh og'rig'i`, `bosh aylanishi`, `ko'krak og'rig'i`) → shifokor chegaralari bilan solishtirish.
4. **Qadam/faollik:** qo'lda kiritish → kunlik/haftalik/oylik SQL agregatsiya.

F demo bemorning qadamlarini L0 `manual` sifatida Toshkent kuni bo‘yicha saqlaydi. Kunlik va haftalik reja maxrajiga muddati kelgan dori va bosim vazifalari kiradi. «Icha olmadim» javob berilganini saqlaydi. Mashq urinishlari va qo‘lda yozilgan qadamlar alohida ko‘rsatiladi.

## 5. Dalil narvoni (L0–L4)
| L | Manba | Hisoblash |
|---|---|---|
| 0 | self-report | `source='self_report'` |
| 1 | taymer / davomiylik / qadam sinxron | `source='timer'` |
| 2 | foto OCR **yoki yuklangan video** + bemor tasdig'i | `source IN ('photo_ocr','uploaded_video')` AND `patient_confirmed` |
| 3 | live kamera MediaPipe CV + confidence | `source='live_camera'` |
| 4 | shifokor tasdig'i | flag resolve → **aynan o'sha `evidence_log_id`**, `source` o'zgarmaydi |

`level` faqat **serverda** hisoblanadi (`source` + `ai_mode` + `patient_confirmed`). `ai_mode IN ('live','manual','synthetic','none')`. Seed = `synthetic`.

## 6. DB sxema (Neon Postgres)

`shifohalqa` sxemasida har demo ish joyi imzolangan sessiyadagi UUID bilan ajratiladi. Shifokor, bemor, reja, vazifa, dalil, bayroq va audit bog‘lanishlari `workspace_id` ni ham tekshiradi. C va D bosqichida bitta bemor uchun bitta biriktirilgan reja va har kunlik vazifaga bitta qayd mavjud. Quyidagi ro‘yxat yakuniy mahsulot jadvallari uchun yo‘nalish beradi. Amaldagi DDL [schema.sql](../schema.sql) da.

```sql
doctors(id, name, demo_key)
patients(id, doctor_id, name, demo_key, profile jsonb)          -- sintetik
plans(id, patient_id, doctor_id, template_key, status,
      vitals_target jsonb,   -- {maxSystolic, maxDiastolic, warnSystolic, warnDiastolic}
      exercise_target jsonb) -- {targetAngle, reps, maxShallow}
plan_items(id, plan_id, type,  -- medication|exercise|vitals|steps
           title_uz, config jsonb)  -- {drug_name, strength_mg, dose_schedule,...}
task_instances(id, plan_item_id, date, status)                  -- Asia/Tashkent, ensureToday()
evidence_logs(id, task_instance_id, patient_id, level CHECK 0..4,
              source, ai_model, ai_mode CHECK(...), confidence,
              patient_confirmed bool, file_sha256, motion_signature jsonb,
              payload jsonb, created_at)
flags(id, patient_id, evidence_log_id, color CHECK red|yellow,
      rule_key, status CHECK open|resolved, doctor_note, resolved_at)
caregiver_links(workspace_id, patient_id, token_hash, expires_at, revoked_at)
audit_events(id, actor, action, entity, meta jsonb, created_at)
```
Indekslar: `evidence_logs(file_sha256)` unique (dup bloklash), `task_instances(plan_item_id, date)` unique, `flags(patient_id, status)`.

## 7. AI pipeline kontraktlari (Codex egaligi: `src/lib/ai/`)

### 7.1 Extract — Interactions API, `gemini-4-hydrogen` (fallback `gemini-3.5-flash-lite`)
- `client.interactions.create({ model: env.GEMINI_MODEL, store: false, ... })` — bemor media'si **hech qachon saqlanmaydi**.
- Client: rasm 1600px JPEG downscale; server: 6MB limit, 12s timeout, zod schema, 10 req/min/IP rate limit.
- Dori quti: `{ drug_name, strength_mg, raw_text, language }`. Tonometr: `{ systolic, diastolic, pulse }`.
- Xato/kalit yo'q → `{ mode: 'manual' }` → L0, **soxta qiymat yo'q**.

G demo DoriMos uchun brauzerdan faqat tayyor namuna ID sini qabul qiladi. Rasm serverdagi sintetik PNG to‘plamidan olinadi. IP yoki media yuborish mumkin bo‘lgan bemor yuklamasi bu oqimga kirmaydi. Model so‘rovlari bir demo ish joyi uchun daqiqasiga 10 ta va butun demo bo‘yicha daqiqasiga 30 ta bilan cheklangan. Quti kuchi reja bandida alohida saqlanadi. Dori qutisi qaydi «Ichdim» va «Icha olmadim» qaydidan mustaqil.

### 7.2 Gate — Decisions API, `gemini-decision-1` (`apiVersion: 'v1beta'`)
Bitta chaqiruvda parallel savollar (0 output token, kalibrlangan `confidence`):
- **DoriMos:** `is_packaging_visible` (noul), `is_label_legible` (noul), `matches_prescribed_drug` (noul, instructions'da shifokor yozgan dori nomi), `detected_dose_bucket` (choice: `2.5mg|5mg|10mg|20mg|50mg|100mg|other`).
- **Tonometr:** `is_tonometer_screen` (noul), `is_display_legible` (noul).
- **Teach-Back:** `comprehension_score` (score: 0=xavfli/noto'g'ri doza yoki vaqt, 1=qisman, 2=to'liq to'g'ri), `shows_confusion_or_distress` (noul). Audio to'g'ridan-to'g'ri beriladi (transkripsiya shart emas).
- **Gate qoidasi:** barcha `confidence ≥ 0.80` → extract qiymatlari bemorga ko'rsatiladi → **bemor tasdiqlaydi** → L2. Aks holda → aniq "qayta rasmga oling yoki qo'lda kiriting" (L0 manual). Teach-Back `score < 1` yoki distress ≥ 0.80 → sariq bayroq.

### 7.3 Xulosa — `gemini-4-hydrogen`
Shifokor 7-kunlik brief: loglar+flaglar JSON (matn sifatida) → ≤3 jumla o'zbekcha, **faqat faktlar**, tashxis yo'q, `store:false`.

### 7.4 Mashq — MediaPipe ONLY
LLM ishlatilmaydi. `@mediapipe/tasks-vision` PoseLandmarker, self-hosted WASM + `pose_landmarker_lite.task` (`public/models/`). Burchak = hip–knee–ankle (yaxshi ko'ringan tomon), 5-frame moving average, hysteresis: `WAITING→STANDING→DESCENDING→BOTTOM→ASCENDING→STANDING`. Chiqish: `{ validReps, shallowReps, minAngle, confidence, motionSignature[20] }`.

CDC ochiq demo klipi video tahlil yo‘lini ko‘rsatadi. U `sample` sifatida yorliqlanadi va kunlik asosiy urinishga kirmaydi. Brauzer tarmoq siyosati MediaPipe telemetriyasining tashqi endpointiga ulanishni bloklaydi. [Benchmark](BENCHMARK.md)

## 8. Deterministik qoidalar (`src/lib/rules.ts` — Codex)
Kirish: log + plan (shifokor chegaralari). Chiqish: `flag | null` + `rule_key`.
- BP ≥ `maxSystolic/maxDiastolic` → **qizil**; ≥ warn band → sariq. `ko'krak og'rig'i` → darhol qizil.
- Tasdiqlangan doza mismatch (`detected_dose_bucket` ≠ reja `strength_mg`) → **qizil**.
- Mashq: `shallowReps > maxShallow` yoki `confidence < 0.75` → sariq; `pain_reported` → sariq/qizil (config).
- Ketma-ket ≥2 kun dori o'tkazib yuborish → sariq.
- Shifokor demo rejada yoqsa, bemor bildirgan «Dori tugadi» xabari tekshiruv navbatida sariq ko‘rinadi.
- **Chegaralar har doim plan'dan o'qiladi** — hardcode yo'q. 25+ unit test majburiy.

## 9. Anti-cheat (`src/lib/anticheat.ts` — Codex)
- Fayl SHA-256: bir xil video/rasm ikkinchi marta → rad (DB unique index).
- Kuniga 1 primary urinish (qayta urinishlar `retry` deb belgilanadi, shifokor ko'radi).
- Motion signature (20 nuqta): oldingi loglar bilan **MAE solishtiruv haqiqatan hisoblanadi**; juda o'xshash (mas. MAE < chegara) → shubha → sariq.

## 10. UX qoidalari
- "Klinik daftar" (clinical ledger) dizayn: self-hosted fontlar, light/dark, o'zbekcha Lotin (asosiy), kirill toggle ixtiyoriy.
- Bemor: katta tugmalar, sodda o'zbekcha; `103` va `Og'riq bor` **har ekranda**.
- Hakamlar: `/` da 1-click rollar; `/about` — what works / what's simulated / AI-use; `/api/demo/reset`; 3 tayyor dori qutisi rasmi (`public/demo/box-{5mg,10mg,other}.png`) — kamerasiz OCR sinovi.
- Sanalar dinamik (`Asia/Tashkent`); hardcoded sana **taqiqlanadi**.
- Caregiver: token-verified, read-only, `noindex`, Farg'ona + Kuala-Lumpur soatlari.
- «Yaqinim» havolasini bemor yaratadi, yangilaydi yoki bekor qiladi. U 24 soat amalda. Sahifa faqat Farg‘ona kuni bo‘yicha muddati kelgan, javob berilgan va bajarilgan vazifalar sonini ko‘rsatadi. Havola ochilishlari auditga yoziladi.

## 11. Demo ma'lumot (seed)
Har demo ish joyida Dr. Sardor va Anvar aka ismli sintetik shifokor va bemor yaratiladi. Reja, qayd va tarix demo oqimida hosil bo‘ladi. To‘qqiz bemorli oldindan tayyorlangan to‘plam keyingi mahsulot sinovi uchun rejalashtirilgan.

## 12. Non-goals (MVP'da YO'Q — ochiq roadmap)
Task 2 topshiriladigan mahsulot veb-demo. Alohida Android debug APK sintetik dori oqimini sinash uchun ishlaydi. Android ommaviy relizi, Telegram Mini App, DMED FHIR eksporti, to‘liq native CV, ML anti-cheat, to‘lovlar va Play Store keyingi bosqichda. Individual roli ixtiyoriy T4.3.

## 13. Telegram bot (MVP qo‘shimchasi)

Bemor botdagi `/bugun` buyrug‘i orqali ShifoHalqani ochadi. Shifokor veb-sahifadan 10 daqiqalik havola yaratib, shaxsiy Telegram chatini bog‘lashi mumkin. Yangi qizil klinik qayd yaratilganda bot umumiy bildirishnoma va ilova havolasini yuboradi. Bemor ismi, o‘lchovi, dori nomi, shifokor izohi va sessiya identifikatori veb-ilovada qoladi. Ulanish veb-paneldan yoki botdagi `/stop` bilan uziladi. Bot bildirishnomasi yordamchi kanal, asosiy shifokor navbati veb-ilovada saqlanadi.
