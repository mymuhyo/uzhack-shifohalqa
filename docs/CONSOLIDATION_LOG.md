# Konsolidatsiya qarorlari

2026-yil 20-noyabr. Asosiy ish papkasi `~/Projects/uzhack`, filial `main`. O‘zgarishdan oldin ikkala papka yashirin va Git fayllari bilan alohida shaxsiy `~/Projects/uzhack-backup-20261120-OGL9Jy/` papkasiga nusxalandi. Ikkala manba ham nusxasiga `diff -qr --no-dereference` bilan solishtirildi, farq chiqmadi. Zaxirada maxfiy lokal sozlamalar bor, uni ulashmang. Codex ishchi daraxtining `.git` fayli asl umumiy repoga ishora qiladi. Git tarixini tiklashda zaxiradagi asosiy `uzhack/.git`dan foydalaning.

| Yo‘l yoki guruh | Qaysi variant olindi va nega |
|---|---|
| Veb, Android, Telegram, sxema, testlar, lockfile, demo media | `uzhack-codex` toza, detached `b135fda` edi. Yangilangan `origin/main` ham shu commit. Lokal `main` esa `99d297f`da 11 commit orqada edi. Fast-forward butun reliz tarixini asl commitlari bilan olib keldi, jumladan jonli kamera sozlanishi tuzatishini. |
| `tasks/task-1/{cue_sheet,presentatsiya_runbook,task_1_video_va_topshirish_rejasi,uzhack_task_1_video_va_platform_matnlari}.md` va `video_script_4m25.md` | Asosiy papkadagi to‘rtta tahrir yakuniy ssenariyga ishora qilgan. Reliz bu yo‘llarni o‘zgartirmagan. To‘rtta tahrir va avval kuzatilmagan ssenariy aynan saqlandi, lokal `615463c`. |
| `AGENTS.md`, `CLAUDE.md`, reja va topshirish fayllari | Eski ikki agentga taqsimlash yo‘riqnomasi kodga mos kelmagan. Joriy buyruqlar va shartnomaga asoslangan bitta qo‘llanma, Claude uchun ishora, tarixiy A–I doskasidan alohida V2 rejasi olindi. |
| `.env.local`, `.vercel/`, botning lokal muhiti | Baza manzillari bir-biriga zid edi. Eski qiymatlar yopiq zaxirada. Asosiy web papkasi `codex-dev` test bazasiga ulandi. Sxema ko‘chirildi va ulanishda 0 ta demo ish joyi borligi tekshirildi. Sinov filiali 24-noyabr 08:00 MYT da tugaydi. Vercel bog‘lanishi asosiy papkada qoldi. Jonli botning servis siri lokal sinovga kerak emas. |
| `node_modules`, WASM, build, test keshlar, shaxsiy arxivlar | Web bog‘liqliklari ikkala daraxt uchun bir xil lockfile’dan. Asosiy papkada build va WASM qayta hosil qilinadi. Android/Python keshlar, xususiy transkriptlar va boshqa ishchi daraxtlarning to‘liq holati zaxirada saqlandi. |

Mavjud ommaviy link va ikkala rol alohida sintetik sessiyada tekshirildi. V2 uchun lokal Git integratsiyasi va nashr holati [V2 rejasida](V2_PLAN.md), ommaviy sinov dalillari [auditda](AUDIT.md).
