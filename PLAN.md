# PLAN.md — ShifoHalqa qayta qurish rejasi (yagona master plan)

> **Holat: 2026-11-17.** Eski 4 agent-lane o'chirildi; loyiha **noldan**, bitta kod bazasida quriladi.
> Bu fayl — yagona task board. **[CLAUDE]** = Claude Code (`uzhack`, `main`), **[CODEX]** = Codex (`uzhack-codex`, `codex/dev`).
> Kontraktlar: `CLAUDE.md`, `AGENTS.md`, `docs/SPEC.md`. Deadline: Task 1 = **18-nov 23:59 MYT**, Task 2 = **22-nov 23:59 MYT**.

## 1. Qarorlar tarixi (nega shunday)

**Audit xulosasi (17-nov, 4 lane):**
- `claude` — eng toza baza: 9 normalizatsiyalangan SQL jadval, "Klinik daftar" dizayn, 25 unit + 19 E2E test, halollik 5/5 (L4 aynan `evidence_log_id` ni ko'taradi, `ai_mode` enum, demo reset). MediaPipe ataylab yo'q edi.
- `opencode` — eng to'liq funksional: real Web MediaPipe Pose, real Gemini OCR, PWA, Telegram Mini App, Android CameraX APK, 8/8 benchmark. Buglar: `approvePatientLatest` noto'g'ri logni L4 qiladi; yuklangan video L3 deb belgilanadi; motion signature saqlanadi-yu solishtirilmaydi.
- `pi` — tonometr OCR, interaktiv PAR-Q+, 3 til, Android Health Connect. Buglar: L4 DB ga umuman yozilmaydi; o'qilmagan rasm `ocrOk=true`; shifokor reja yarata olmaydi; 0 test.
- `antigravity` — **diskvalifikatsiya xavfi**: soxta `setInterval` "MediaPipe L3", soxta OCR fallback, 0 commit, deploy yo'q.

**Foydalanuvchi qarori (17-nov):** hammasini tozalab, noldan bitta mukammal MVP; AI = **Hybrid** (`gemini-decision-1` + `gemini-4-hydrogen` + on-device MediaPipe); workflow = **2 worktree** (Claude yetakchi, Codex dvigatellar).

**Tozalash logi (17-nov, bajarildi):**
| Resurs | O'chirildi | Qoldi |
|---|---|---|
| Lokal worktree | `uzhack-agent-{antigravity,claude,opencode,pi}` | `uzhack` (main) + `uzhack-codex` (codex/dev) |
| GitHub branch | `agent/{antigravity,claude,opencode,pi}` (local+remote) | `main`, `codex/dev` |
| Vercel | `shifohalqa-claude`, `shifohalqa-opencode`, `uzhack-pi` | **`shifohalqa`** → https://shifohalqa.vercel.app |
| Neon | `uzhack-opencode`, `uzhack-antigravity`, `uzhack-pi` | **`shifohalqa`** (`purple-union-46131605`, PG17, `suspend_timeout=0`) + `codex-dev` branch |
| Eski plan fayllar | root'dagi 4 ta md + `docs/ideas/` → `archive/` ga ko'chirildi | `PLAN.md`, `docs/SPEC.md` — yagona joriy manba |

**Kod arxivi (o'chirishdan oldin saqlandi):** `~/Projects/uzhack-reference-20261117.tar.zst` (24 MB) — porting uchun manba; `AGENTS.md` da yo'llar ko'rsatilgan. API kalitlar `uzhack/.env.local` da saqlangan.

## 2. Ish muhiti

| Worktree | Branch | Agent | Rol |
|---|---|---|---|
| `~/Projects/uzhack` | `main` | **Claude Code** | Arxitektura, DB, UI/UX, klinik halqa, integratsiya, deploy |
| `~/Projects/uzhack-codex` | `codex/dev` | **Codex** | AI/CV/rules/anticheat dvigatellari, testlar, benchmark |

- **DB:** Neon `shifohalqa` — production default branch (Claude); `codex-dev` branch (Codex, izolyatsiya). Schema o'zgarishi faqat Claude'da; Codex `schema.sql` ni o'qiydi, o'zgartirmaydi.
- **Deploy:** Vercel `shifohalqa` faqat `main` dan (`vercel deploy --prod`). Codex hech qachon deploy qilmaydi.
- **MCP:** Claude — `.mcp.json` (`geminiDocs`, `context7`; global `shadcn`, `21st`). Codex — `~/.codex/config.toml` (`geminiDocs`, `context7`).
- **Skillar:** ikkala agentga symlink qilingan (`~/.claude/skills`, `~/.codex/skills`): `context7-mcp`, `gemini-api-dev`, `neon`, `neon-postgres`, `deploy-to-vercel`, `vercel-react-best-practices`, `vercel-optimize`, `test-driven-development`, `webapp-testing`, `modern-web-guidance`, `security-and-hardening`, `code-review-and-quality`, `debugging-and-error-recovery`, `incremental-implementation`, `planning-and-task-breakdown`, `source-driven-development`, `git-workflow-and-versioning`, `frontend-design`, `ui-ux-pro-max`, `domain-modeling`, `codebase-design` va h.k.
- **Merge oqimi:** Codex `codex/dev` ga push → Claude diff'ni `code-review-and-quality` bilan ko'radi → `main` ga merge → `npm run verify` + E2E → deploy.

## 3. Arxitektura (qisqa; to'liq: `docs/SPEC.md`)

```
Bemor brauzeri                          Server (Next.js 16, Vercel)              Neon Postgres
┌────────────────────────┐   ┌──────────────────────────────────┐   ┌─────────────────┐
│ MediaPipe Pose (L3)    │   │ rules.ts — deterministik bayroqlar│   │ 9 jadval        │
│  video qurilmada qoladi│──▶│  (shifokor chegaralari)           │──▶│ evidence_logs   │
│ DoriMos / Tonometr     │   │ ai/interactions.ts                │   │ flags           │
│  rasm → server OCR     │──▶│  gemini-4-hydrogen (extract,zod)  │   │ plans/tasks     │
│ Teach-Back matn/audio  │──▶│ ai/decisions.ts                   │   │ audit_events    │
│                        │   │  gemini-decision-1 (gate,score)   │   └─────────────────┘
└────────────────────────┘   │  store:false, confidence≥0.80     │
                             └──────────────────────────────────┘
   AI o'lchaydi → kod bayroq ko'taradi → SHIFOKOR qaror qiladi (L4)
```

## 4. Bosqichlar va task board

### Faza 0 — Poydevor [CLAUDE] · 17-nov
| # | Task | Skill / MCP |
|---|---|---|
| T0.1 | Next.js 16 + React 19 + TS strict + Tailwind 4 scaffold; versiyalarni context7'dan tekshirib pin qilish; `verify` skriptlari | `context7-mcp`, `vercel-react-best-practices` |
| T0.2 | `schema.sql` (9 jadval, SPEC §6) + `db:setup` / `db:seed` (sintetik 9 bemor, `sql.transaction`) | `neon-postgres` |
| T0.3 | Demo sessiya: HMAC-SHA256 httpOnly cookie, 1-click rol kirish, middleware | `security-and-hardening` |
| T0.4 | `.env.example` to'liq; Vercel `shifohalqa` env yangilash; `vercel link` | `deploy-to-vercel`, `vercel-cli-with-tokens` |
| T0.5 | Codex muhiti: `codex-dev` Neon branch + `uzhack-codex/.env.local` (bajarildi — tekshirish) | `neon-postgres` |

### Faza 1 — Klinik halqa [CLAUDE] · 17–18-nov
| # | Task | Skill / MCP |
|---|---|---|
| T1.1 | Shifokor reja shablonlari ("Gipertenziya 14 kun", "Rehab Squat") + `/doctor/plans/new` + chegaralar (BP, tizza burchagi) | `domain-modeling`, `context7-mcp` |
| T1.2 | `ensureToday()` — `Asia/Tashkent` bo'yicha kunlik `task_instances` generatsiyasi | `neon-postgres` |
| T1.3 | Bemor "Bugun" sahifasi: dori L0, BP+simptom L0, qadam L0, mashq taymer L1; `103` / `Og'riq bor` doim ko'rinadi | `modern-web-guidance`, `ui-ux-pro-max` |
| T1.4 | Log API: level **serverda** hisoblanadi; vaqtinchalik minimal rules (Codex `rules.ts` kelganda almashtiriladi) | `security-and-hardening`, `test-driven-development` |
| T1.5 | Exception dashboard (qizil/sariq navbat) + resolve → **aynan `evidence_log_id` L4** | `codebase-design` |
| T1.6 | Caregiver `/caregiver/[token]` — read-only, `noindex`, audit, Farg'ona/Kuala-Lumpur soatlari | `security-and-hardening` |

### Faza 2 — Dvigatellar [CODEX] · parallel, 17–19-nov
| # | Task | Skill / MCP |
|---|---|---|
| T2.1 | `rules.ts` + 25+ unit test: shifokor chegaralari, BP, doza mismatch, mashq `confidence<0.75`, og'riq, ketma-ket 2 dori o'tkazib yuborish | `test-driven-development`, `context7-mcp` |
| T2.2 | `pose.ts` MediaPipe engine (arxivdan port + modernizatsiya): smoothing, hysteresis, valid/shallow reps, confidence; `public/models/` self-host | `context7-mcp`, `webapp-testing` |
| T2.3 | `ai/interactions.ts`: `gemini-4-hydrogen` OCR extract (dori quti + tonometr), zod, `store:false`, 12s timeout, 6MB limit, manual fallback | `gemini-api-dev`, MCP `geminiDocs` |
| T2.4 | `ai/decisions.ts`: `gemini-decision-1` gate — DoriMos 4 savol, tonometr sifati, Teach-Back rubric (SPEC §7) | `gemini-api-dev`, MCP `geminiDocs` |
| T2.5 | `anticheat.ts`: SHA-256 dup, kuniga 1 primary urinish, motion-signature **MAE solishtiruv (haqiqiy!)** | `test-driven-development` |
| T2.6 | `scripts/benchmark.mjs` + `docs/BENCHMARK.md` — 8+ sintetik rasm, **real run**, natijalar Note'ga | `webapp-testing` |
| T2.7 | `scripts/e2e` smoke (Playwright) — Claude UI bilan sinxron | `webapp-testing`, `context7-mcp` |

### Faza 3 — Integratsiya [CLAUDE, Codex review] · 19–20-nov
| # | Task | Skill / MCP |
|---|---|---|
| T3.1 | `codex/dev` → `main` review + merge; `docs/INTERFACES.md` bo'yicha ulash | `code-review-and-quality` |
| T3.2 | DoriMos UI: 3 demo quti rasmi + kamera + decision gate + bemor tasdig'i → L2; doza mismatch → qizil | `modern-web-guidance`, `gemini-api-dev` |
| T3.3 | Tonometr OCR UI → L2; o'qilmasa **aniq retake/manual** (pi-bug takrorlanmasin) | `modern-web-guidance` |
| T3.4 | Mashq UI: live kamera → L3, yuklangan video → L2; anti-cheat + confidence ko'rsatkich | `webapp-testing` |
| T3.5 | Teach-Back (matn/audio) → `score` → past ball = sariq + shifokor navbati | `gemini-api-dev` |
| T3.6 | Shifokor 7-kunlik fakt-xulosa (hydrogen) + BP sparkline | `vercel-react-best-practices` |

### Faza 4 — Kengaytmalar (vaqt qolsa; ustuvorlik tartibida)
| # | Task | Owner | Skill / MCP |
|---|---|---|---|
| T4.1 | Telegram qizil-bayroq push + webhook (HMAC `initData` tekshiruv) | [CLAUDE] | `context7-mcp`, `security-and-hardening` |
| T4.2 | PWA manifest + offline shell | [CLAUDE] | `modern-web-guidance` |
| T4.3 | Individual PAR-Q+ oqimi (pi-lane'dan port) | [CODEX]+[CLAUDE] | `test-driven-development` |
| T4.4 | Telegram Mini App / Android | **MVP'dan chiqarildi** — roadmap (arxivda namuna bor) | — |

### Faza 5 — Topshirish [CLAUDE] · 21–22-nov
| # | Task | Skill / MCP |
|---|---|---|
| T5.1 | `/about` halollik sahifasi + demo reset + `PLATFORM_NOTES.md` + AI-use note | `shipping-and-launch` |
| T5.2 | `verify` + E2E production + **Incognito sinov** + benchmark real natijalari | `webapp-testing` |
| T5.3 | `vercel deploy --prod`; havola Grand Finalgacha jonli (Neon `suspend_timeout=0`) | `deploy-to-vercel`, `vercel-optimize` |
| T5.4 | **Task 1 video** (deadline 18-nov!) — `tasks/task-1/` runbook bo'yicha yozib olish + platforma `Project` maydonlari | — |

## 5. Risklar va fallback
| Risk | Fallback |
|---|---|
| `gemini-decision-1` (`v1beta`) mavjud bo'lmasa / xato | `gemini-4-hydrogen` structured extract + **aniq "past ishonch — qo'lda kiriting"** yo'li; soxta confidence YO'Q |
| Gemini kvota/kalit tugashi | Manual L0 fallback, UI'da ochiq `manual` label; ilova baribir ishlaydi |
| MediaPipe Telegram WebView'da ishlamasa | Mashq demo web'da; Mini App — roadmap |
| Task 1 deadline ertaga (18-nov) | Video matnlari/runbook tayyor (`tasks/task-1/`); faqat yozib olish + topshirish qoldi — **bugun boshlash** |
| Neon cold-start | `suspend_timeout_seconds=0` (saqlangan); seed `sql.transaction` ~1.2s |
| Codex/Claude merge konflikti | Fayl egaligi chegaralari (CLAUDE.md/AGENTS.md jadvali); faqat Claude merge qiladi |

## 6. Definition of Done (rasmiy Task 2 rubric × bizning dalil)
| Ball | Mezon | Bizning dalil |
|---|---|---|
| 25 | Innovation | Hybrid calibrated AI (decision-1 gate + hydrogen extract), Dalil narvoni L0–L4, caregiver diaspora halqasi |
| 25 | Technical execution | To'liq workflow: reja → vazifa → dalil → bayroq → L4; `verify` green; E2E; real benchmark |
| 20 | Practicality (Uzbekistan) | Farg'ona konteksti, o'zbekcha UI, `103`, Telegram push, arzon uy davolanish kuzatuvi |
| 20 | Impact | Exception-first dashboard (shifokor vaqti), doza-xato himoyasi, 7-kunlik fakt-xulosa |
| 10 | Presentation | 1-click demo, `/about`, `PLATFORM_NOTES` + AI-use note, Incognito'da tekshirilgan |

## 7. Ochiq scope-cut'lar (halollik bilan hujjatlashtiriladi)
Android APK, Telegram Mini App, DMED FHIR export, Individual roli (ixtiyoriy T4.3), motion-signature anti-cheat'ning ML qismi — **roadmap**; `PLATFORM_NOTES.md` da "qurilmagan" deb ochiq yoziladi.

## 8. Task board holati
`[ ]` ochiq · `[~]` jarayonda · `[x]` bajarildi (commit sha bilan)
- [x] T0.5 Codex muhiti (17-nov, cleanup sessiyasi)
- [ ] T0.1–T0.4 [CLAUDE] — **keyingi qadam**
- [ ] T2.1–T2.7 [CODEX] — T0.1 scaffold'dan keyin parallel boshlanadi
- [ ] Faza 1, 3, 4, 5 — yuqoridagi tartibda
