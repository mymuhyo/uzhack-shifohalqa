# competition/ — baholash va sifat

> **17-nov-2026 dan:** eski "parallel lane competition" (4 agent worktree) **yakunlandi va tozalandi**.
> Endi bitta jamoa, bitta kod bazasi, 2 agentli workflow: Claude (`main`) + Codex (`codex/dev`).
> Eski lane natijalari va tozalash logi: `PLAN.md` §1. Kod arxivi: `~/Projects/uzhack-reference-20261117.tar.zst`.

## Joriy qoidalar
- Yagona kontrakt: `docs/SPEC.md`; task board: `PLAN.md`; agent kontraktlari: `CLAUDE.md` / `AGENTS.md`.
- Claude merge qiladi, Codex faqat `codex/dev` ga push qiladi; deploy faqat `main` dan.
- Har merge oldidan: `code-review-and-quality` + `npm run verify` + E2E.
- Halollik buzilishi (soxta dalil/AI da'vosi) — istalgan bosqichda to'xtatuvchi omil.

## Baholash
- Rasmiy: `RUBRIC.md` (Task 2 × 100 ball) + `brief/uzhack-online-stage-tasks-en.pdf`.
- Ichki sifat darvozasi: `RUBRIC.md` §2.
