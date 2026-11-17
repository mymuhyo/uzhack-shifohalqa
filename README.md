# UzHack 2026 — ShifoHalqa

**Track:** 01 Smart Healthcare · **Musobaqa:** UzHack 2026 (Uzbekistan–Malaysia Tech Bridge)
**Mahsulot:** shifokor bergan uy davolanish rejasini bemor telefonida kundalik vazifalarga aylantiradi; har vazifa **dalil darajasi (L0–L4)** bilan qayd etiladi; deterministik qoidalar faqat istisnolarni shifokor paneliga chiqaradi — "ko'rinmas davr"ni yopadi.

> **Status (17-nov-2026):** eski 4 agent-lane tozalandi; loyiha **noldan**, bitta kod bazasida quriladi. Reja va kontraktlar tayyor — kod hali yozilmagan.

## Deadline (tashkilotchi kanallarida tekshiring: uzhack.uz / Platform)
| Vazifa | MYT | UZT | Nima topshiriladi |
|---|---|---|---|
| **Task 1** — Video + Project info | **18-noyabr 2026, 23:59** | 20:59 | 3–5 daqiqa video (YouTube Unlisted) + platformadagi `Project` maydonlari |
| **Task 2** — Working MVP | **22-noyabr 2026, 23:59** | 20:59 | Brauzer havolasi + demo loginlar + "what works / what's simulated" + AI-use note |

Ball = 0.30·Task1 + 0.70·Task2; ikkalasi ham majburiy; havola Grand Finalgacha jonli turishi shart.

## Ish muhiti (2 worktree, 2 agent)
| Worktree | Branch | Agent | Rol |
|---|---|---|---|
| `~/Projects/uzhack` | `main` | **Claude Code** | Arxitektura, DB, UI, klinik halqa, integratsiya, deploy |
| `~/Projects/uzhack-codex` | `codex/dev` | **Codex** | AI/CV/rules/anticheat dvigatellari, testlar, benchmark |

- **Production:** https://shifohalqa.vercel.app (Vercel `shifohalqa`, faqat `main` dan)
- **DB:** Neon `shifohalqa` (production branch) + `codex-dev` branch (Codex izolyatsiyasi)
- **AI:** Hybrid — on-device MediaPipe Pose (L3) + `gemini-4-hydrogen` (OCR/extract) + `gemini-decision-1` (calibrated gate/score, Decisions API `v1beta`)

## O'qish tartibi
| Fayl | Maqsad |
|---|---|
| [`PLAN.md`](PLAN.md) | **Yagona master plan** — fazalar, task board, skill/MCP xaritasi, tozalash logi |
| [`CLAUDE.md`](CLAUDE.md) | Claude Code kontrakti: egalik chegaralari, halollik, Gemini qoidalari |
| [`AGENTS.md`](AGENTS.md) | Codex kontrakti: dvigatel egaligi, porting manbalari, verify gate |
| [`docs/SPEC.md`](docs/SPEC.md) | Mahsulot + texnik kontrakt: rollar, sxema, AI pipeline, qoidalar |
| [`competition/RUBRIC.md`](competition/RUBRIC.md) | Rasmiy Task 2 baholash × ichki sifat darvozasi |
| [`tasks/task-1/`](tasks/task-1/) | Video ssenariysi, runbook, platforma matnlari (deadline 18-nov!) |
| [`tasks/task-2/README.md`](tasks/task-2/README.md) | MVP topshirish checklist |
| [`brief/uzhack-online-stage-tasks-en.pdf`](brief/uzhack-online-stage-tasks-en.pdf) | Rasmiy Brief v1.0 (tarixiy sanalar bilan) |
| [`archive/`](archive/) | Eski reja fayllar — joriy emas |

Eski 4 lane kodi arxivi: `~/Projects/uzhack-reference-20261117.tar.zst` (porting uchun; `AGENTS.md` da yo'llar).

## Boshlash (Faza 0 — Claude)
```bash
cd ~/Projects/uzhack
# scaffold + DB (PLAN.md T0.1–T0.2):
npm install
npm run db:setup && npm run db:seed   # Neon shifohalqa, sintetik demo data
npm run dev
# sifat darvozasi:
npm run verify                        # typecheck + lint + test + build
npm run e2e                           # Playwright
# Codex lane:
cd ~/Projects/uzhack-codex && codex   # AGENTS.md avtomatik o'qiladi
```
Kalitlar: `.env.local` (gitignored) — `.env.example` shabloniga qarang.

## Halollik qoidasi (muzokaraga yopiq)
**AI o'lchaydi → kod qoidalari bayroq ko'taradi → shifokor qaror qiladi.** Hech qachon "AI isbotladi/tashxis qo'ydi" yozilmaydi; simulyatsiya qismlar ochiq belgilanadi; har submission bilan "what works / what's simulated" + AI-use note keladi.

## Status / TODO
- [x] Audit + tozalash (GitHub/Vercel/Neon/worktree) — 17-nov
- [x] PLAN.md, CLAUDE.md, AGENTS.md, docs/SPEC.md, MCP/skill sozlamalari
- [ ] Faza 0: scaffold + schema + seed + demo sessiya
- [ ] Faza 1: klinik halqa (reja → vazifa → dalil → bayroq → L4)
- [ ] Faza 2: Codex dvigatellari (rules, pose, AI gate, anticheat, benchmark)
- [ ] Faza 3–5: integratsiya, topshirish, Task 1 video
