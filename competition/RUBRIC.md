# RUBRIC — rasmiy baholash va ichki sifat darvozasi

## 1. Rasmiy Task 2 (100 ball, umumiy ballning 70%)
| Ball | Mezon | Nimani ko'rsatamiz |
|---|---|---|
| 25 | Innovation & originality | Hybrid calibrated AI (`gemini-decision-1` gate + `gemini-4-hydrogen` extract + on-device MediaPipe), Dalil narvoni L0–L4, caregiver diaspora halqasi |
| 25 | Technical execution | Bitta to'liq workflow boshidan oxirigacha: shifokor reja → bemor vazifa → dalil → bayroq → shifokor L4; `verify` green; E2E o'tgan |
| 20 | Practicality (Uzbekistan) | Farg'ona konteksti, o'zbekcha UI, `103` tugmasi, Telegram push, uy davolanish real muammosi |
| 20 | Impact & effectiveness | Exception-first dashboard (shifokor vaqtini tejaydi), doza-xato himoyasi, real mini-benchmark natijalari |
| 10 | Presentation | 1-click demo login, `/about` halollik sahifasi, `PLATFORM_NOTES` + AI-use note, Incognito'da sinalgan |

Task 1 (100 ball, 30%): problem clarity 30 · affected people 20 · solution strength 30 · presentation 20.
Online score = 0.30·T1 + 0.70·T2; min 50; track'dan top 5 finalga.

## 2. Ichki sifat darvozasi (har merge/deploy oldidan — 6×5 = 30)
1. **End-to-end:** demo loginlardan to'liq workflow brauzerda o'tadi (5).
2. **Spec qamrovi:** reja → dori/mashq/BP/qadam → dalil → exception panel → L4 (5).
3. **Texnik sifat:** `npm run verify` (typecheck+lint+unit+build) green; E2E green; arxitektura SPEC'ga mos (5).
4. **Deployability:** README, `.env.example`, seed/demo data, barqaror havola, demo reset (5).
5. **Halollik:** AI tashxis qo'ymaydi; simulyatsiya belgilangan; har da'vo kod bilan 1:1; benchmark real (5).
6. **UX:** notexnik hakam va bemor uchun tushunarli; o'zbekcha; katta tugmalar; `103` doim ko'rinadi (5).

**Qoida:** halollik yoki xavfsizlik buzilishi (soxta L3/L2, to'qima natija) — ball qat'i nazar **diskvalifikatsiya**. Eski antigravity lane shu sabab o'chirildi.
