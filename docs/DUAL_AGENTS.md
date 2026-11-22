# ShifoHalqa · Ikki agent tajribasi

`shifohalqa-base-20261121` asl loyiha snapshoti. `shifohalqa-dual-start-20261121` ikkala agentning umumiy boshlanishi. Unga worktree yo‘riqnomasi, ishga tushirish buyruqlari va test portlarini sozlash qo‘shilgan.

| Resurs | Codex | Antigravity |
|---|---|---|
| Papka | `~/Projects/shifohalqa-codex` | `~/Projects/shifohalqa-antigravity` |
| Git branch | `exp/dual-codex` | `exp/dual-antigravity` |
| Veb | `http://codex.localhost:3030` | `http://antigravity.localhost:3130` |
| Host port rezervi | 3030–3099 | 3100–3199 |
| Playwright web / Telegram mock | 3040 / 3041 | 3140 / 3141 |
| Neon branch | `dual-codex-20261121` | `dual-antigravity-20261121` |
| Dev / E2E bazasi | `neondb` / `shifo_e2e` | `neondb` / `shifo_e2e` |
| Android AVD / ADB serial | `Shifo-codex` / `emulator-5580` | `Shifo-antigravity` / `emulator-5582` |
| Android host portlari | 5580–5581 | 5582–5583 |

Hostdagi 3000 port asl loyiha uchun qoladi. Brauzerda jadvaldagi hostnamelardan foydalaning. Cookie portga qarab ajralmaydi. Build natijalari, `node_modules`, Python venv, Gradle’ning loyiha papkalari va AVD disklari alohida saqlanadi. Global paket yuklama keshlari umumiy bo‘lishi mumkin.

## Boshlash

Yangi Codex sessiyasini Codex papkasida, yangi Antigravity sessiyasini Antigravity papkasida oching. Antigravity’da Local Mode ni tanlang, chunki Git worktree allaqachon tayyorlangan. Ikkalasiga bir xil topshiriq, qabul mezonlari va sinov ssenariysini bering. Taqqoslash tugaguncha agentlar bir-birining kodini ko‘rmasin.

```sh
npm run lane -- check
npm run lane -- dev
npm run lane -- smoke
npm run lane -- e2e -- --workers=1
npm run lane -- db-apply
```

`smoke` bazasiz brauzer sinovi. `e2e` buildni yangilaydi va ajratilgan `shifo_e2e` bazasida ishlaydi. `db-apply` ikkala tayinlangan bazaga `schema.sql` ni qo‘llaydi. Launcher meros qolgan xizmat konfiguratsiyasini olib tashlaydi va lokal ulanish satrlarining hostname hamda baza nomini tekshiradi. `.env.lane` resurs identifikatorini, `.env.local` esa kalitlarni saqlaydi. Ikkalasi Git’dan chiqarilgan.

Android sinovi uchun bir terminalda `npm run lane -- emulator` ni ishga tushiring, ikkinchisida `npm run lane -- android-test` ni ishlating. Launcher AVD nomini va serialini tekshiradi, o‘sha qurilmaga APK o‘rnatadi va Android ichidagi 3000 portni shu agentning dev portiga yo‘naltiradi. Birinchi yuklanishda AVD’larni navbat bilan ishga tushiring va bir paytda to‘liq brauzer testlarini yuritmang. Emulyatorni o‘z terminalida Ctrl+C bilan yoping. Jismoniy telefon kerak bo‘lsa, egasi bilan navbatni kelishib, aniq serialdan foydalaning.

## Kalitlar va yangi resurslar

`dev`, `smoke` va `e2e` odatda tashqi AI chaqiruvlarini o‘chiradi. Jonli demo uchun egasi shu worktree’dagi `.env.local` ga alohida kalit va demo flaglarini qo‘yadi, keyin `npm run lane -- dev --live` orqali ishga tushiradi. Bitta provayder akkauntidagi ikkita kalit akkaunt kvotasini bo‘lishishi mumkin. Jonli sessiyalar odatda bitta lock bilan navbatlanadi. Egasi kvotalar alohida ekanini tasdiqlasa, `.env.lane` ga `SHIFO_LIVE_ISOLATED=true` qo‘yishi mumkin. Haqiqiy Telegram webhook yoki tunnel uchun alohida bot, webhook kaliti va URL ajrating.

Yangi port, queue, tunnel, storage bucket, DB, MCP server yoki scheduler qo‘shishdan oldin uning holat yozish joyini aniqlang. O‘z prefiksingiz va port rezervingizdan foydalaning. Fon jarayonlari PID fayllari va natijalarini `.lane/` ichida saqlang. Boshqa jarayonni port bo‘yicha ko‘r-ko‘rona to‘xtatmang. Ajratish imkonsiz resursdan navbat bilan foydalaning. `.lane/resources.md` ga egasi, port yoki loyiha identifikatori, ma’lumot doirasi va tozalash buyrug‘ini yozing.

## Solishtirish va birlashtirish

```sh
git diff --stat shifohalqa-dual-start-20261121...exp/dual-codex
git diff --stat shifohalqa-dual-start-20261121...exp/dual-antigravity
git range-diff shifohalqa-dual-start-20261121..exp/dual-codex shifohalqa-dual-start-20261121..exp/dual-antigravity
```

Ikkala branchni bir xil sintetik ma’lumot va sinovlar bilan alohida tekshiring. Xatti-harakat, regressiya, testlar va xizmat xarajatini solishtiring. Keyin egasi alohida integratsiya branchida tanlangan commitlarni yoki aniq patchlarni oladi va `npm run verify` hamda tegishli E2E sinovini takrorlaydi. Ikkala agent bir faylni o‘zgartirsa, patchlarni olishdan oldin kontraktlar va migratsiyalarni birga tekshiring.
