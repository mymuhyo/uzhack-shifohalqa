# Task 2 — MVP (22-noyabr 2026, 23:59 MYT / 20:59 UZT)

**Status:** qayta qurish boshlanmoqda — master plan `PLAN.md`, kontrakt `docs/SPEC.md`. Bu fayl — topshirish checklist.

## Brief talablari (`brief/uzhack-online-stage-tasks-en.pdf`, §3.2, §3.4, §5.1.2)
- [ ] Ishlaydigan havola + **demo loginlar** — hakamlar Incognito'da hech narsa o'rnatmay ochishi kerak
- [ ] Kamida **bitta to'liq workflow boshidan oxirigacha** (reja → vazifa → dalil → bayroq → shifokor L4)
- [ ] Statik ekran/slayd/video MVP sanalmaydi — **"what works / what's simulated"** + **AI-use note** majburiy
- [ ] AI-use note: qaysi AI vositalar (Claude Code, Codex, Gemini), nima uchun; har a'zo MVP'ni tushuntira olishi shart
- [ ] Havola **Grand Finalgacha** ishlab turishi kerak

## Baholash (100 ball)
Innovation 25 · Technical execution 25 · Practicality 20 · Impact 20 · Presentation 10 → `competition/RUBRIC.md`

## Topshirish checklist (Faza 5)
- [ ] `PLATFORM_NOTES.md`: what works / what's simulated jadvali (SPEC §12 non-goals bilan birga)
- [ ] AI-use note: build (Claude Code + Codex, skill/MCP) va mahsulot ichida (MediaPipe, gemini-4-hydrogen, gemini-decision-1)
- [ ] Demo: 1-click rollar (`/`), `/about`, `/api/demo/reset`, 3 demo dori qutisi rasmi
- [ ] Incognito sinovi: havola + loginlar + to'liq workflow
- [ ] Mini-Benchmark **real** natijalari (`docs/BENCHMARK.md`) Note'ga qo'shilgan
- [ ] `npm run verify` + E2E production'da green
- [ ] Neon `suspend_timeout=0` (cold-start yo'q); Vercel prod `main` dan

## Eslatmalar
- MediaPipe kamera: HTTPS + ruxsat; yuklangan video — zaxira yo'l (L2, L3 EMAS)
- API buzilsa ham ilova ishlashi shart: manual L0 fallback, ochiq label
- Topshirishdan keyin havolaga tegmang; Incognito'da qayta tekshiring
