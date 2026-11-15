# UzHack 2026 — ShifoHalqa

**Track:** 01 Smart Healthcare · **Musobaqa:** UzHack 2026 (Uzbekistan–Malaysia Tech Bridge)  
**Project:** ShifoHalqa — shifokor bergan uy davolanish rejasini bemor telefonida kundalik vazifalarga aylantirib, dalil darajasi bilan shifokorga "ko'rinmas davr"ni ko'rsatadigan veb-platforma.

> **Status (15-nov-2026):** g'oya va arxitektura yozilgan; MVP kodi hali yo'q. Ushbu repo bir vaqtning o'zida (a) jamoa uchun yagona manba, (b) parallel agent sprint'lari uchun asos.

## Deadline (as posted by organizers — verify on uzhack.uz / Platform)
| Vazifa | MYT | UZT | Nima topshiriladi |
|---|---|---|---|
| **Task 1** — Video + Project information | **18-noyabr 2026, 23:59** | 20:59 | 3–5 daqiqalik video (YouTube Unlisted) + Platformadagi `Project` to'ldiriladi |
| **Task 2** — Working MVP | **22-noyabr 2026, 23:59** | 20:59 | Brauzer havolasi + Demo loginlar + "what works / what's simulated" + AI-use note |

> `brief/uzhack-online-stage-tasks-en.pdf` — Brief v1.0 (eski sanalar: 12/15-nov). Saqlanadi tarixiy manba sifatida; current sanalarni rasmiy kanallardan tekshiring.

## Read in this order
| File | Purpose |
|---|---|
| [`docs/ideas/shifohalqa-mvp.md`](docs/ideas/shifohalqa-mvp.md) | **MVP yo'nalishi (eng yangi).** Bitta workflow, 3 sirtlama (web / Telegram Mini App / Android shell), Telegram scope, risklar. |
| [`ShifoHalqa — yakuniy reja (v1).md`](ShifoHalqa%20—%20yakuniy%20reja%20%28v1%29.md) | Jamoaning "yagona manbasi" — g'oya, rollar, UX, qisqa texnik yo'l. |
| [`shifohalqa_to_liq_loyiha_rejasi_va_texnik_arxitekturasi.md`](shifohalqa_to_liq_loyiha_rejasi_va_texnik_arxitekturasi.md) | To'liq texnik spetsifikatsiya: DB sxema, AI promptlar, anti-cheat, halollik jadvali. |
| [`master_plan.md`](master_plan.md) | G'oya yadrosi va arxitekturasi (qisqartirilgan 1–3 qism). |
| [`loyiha_qo_llanmasi_3_azo_uchun.md`](loyiha_qo_llanmasi_3_azo_uchun.md) | Kod bilmaydigan jamoa a'zosi uchun qo'llanma (video/taqdimot roli). |
| [`tasks/task-1/`](tasks/task-1/) | Task 1: video ssenariysi, runbook, cue sheet, platforma matnlari. |
| [`tasks/task-2/README.md`](tasks/task-2/README.md) | Task 2: MVP topshirish checklist. |
| [`competition/`](competition/) | Parallel agent sprint qoidalari va rubric. |
| [`brief/uzhack-online-stage-tasks-en.pdf`](brief/uzhack-online-stage-tasks-en.pdf) | Rasmiy Brief v1.0 (tarixiy). |
| [`archive/`](archive/) | Eski/xom hujjatlar — joriy emas. |

## Repository layout
```text
.
├── brief/                  # rasmiy brief PDF (eski sanalar)
├── docs/ideas/             # MVP yo'nalishi (eng yangi spec)
├── tasks/task-1/           # video + Project information
├── tasks/task-2/           # MVP submission checklist
├── competition/            # parallel agent sprint rules + rubric
├── archive/                # deprecated material (kept for history)
└── *.md                    # asosiy reja / texnik spetsifikatsiya
```

## Working on the MVP (parallel agents)
Three lanes will be implemented from the same base commit, each in its own git worktree:

| Lane | Branch | Worktree |
|---|---|---|
| OpenCode | `agent/opencode` | `../uzhack-agent-opencode` |
| Pi | `agent/pi` | `../uzhack-agent-pi` |
| Antigravity | `agent/antigravity` | `../uzhack-agent-antigravity` |

Each lane may implement the MVP end-to-end. Final selection happens after review; differences are merged back into `main`.

## Status / TODO
- [x] Idea, roles, architecture, anti-cheat, honesty rules — written
- [x] Task 1 materials (video plan, runbook, platform text) — drafted
- [ ] MVP code — not in repo yet
- [ ] Slides (`slides/01.png…07.png`) + `recordings/` — not created
- [ ] Demo link / demo logins — not deployed
- [ ] Mini-Benchmark results — not run
- [ ] WHO adherence source check — not done

## Honesty rule (non-negotiable)
AI o'lchaydi, kod qoidalari bayroq ko'taradi, shifokor qaror qiladi. Hech qachon "AI isbotladi" deb yozilmaydi. Brief: **what works / what's simulated** va **AI-use note** har bir submission bilan birga keladi.
