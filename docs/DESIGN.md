# ShifoHalqa Grand Final interaction & motion design

> **Living design contract.** This document guides Grand Final UI craft and animations across Web, Telegram Mini App, and Android, and stays open to iterative refinement through Grand Final and v2. [DECISIONS](DECISIONS.md) owns product scope; [PLAN](PLAN.md) owns milestones; [ROADMAP_V2](ROADMAP_V2.md) owns post-final evolution.

## Visual identity — Clinical Ledger, elevated

- **Aesthetic direction:** Calm, authoritative **Clinical Ledger** — warm paper surfaces (`--paper: #f6f4ec`), crisp elevated cards (`--card: #fffef9`), deep forest ink (`--ink: #19312a`), high-contrast semantic clinical accents (`--action`, `--urgent`, `--warn`, `--ok`), self-hosted **`Literata`** display headings paired with **`Golos Text`** UI body and tabular numerals (`tabular-nums`) for every dose time, BP reading, angle, and count.
- **Component & motion stack (Web + Mini App):** Build on **`shadcn/ui`** primitives (`Dialog`, `Drawer`/`Sheet`, `Tabs`, `Select`, `Switch`, `Badge`, `Toast`) styled strictly with Clinical Ledger CSS tokens, crisp **`Lucide`** icons (1.75–2px stroke, paired with text labels), and **`Motion`** wrapped in `<MotionConfig reducedMotion="user">`.
- **Motion philosophy (tactile, purposeful, never sluggish):**
  - Keep micro-interactions fast (`140–220ms`, `--ease-out` / crisp spring physics with zero excessive bounce) and strictly GPU-composited (`transform`, `opacity`).
  - Use motion to communicate clinical state transitions: optimistic `Saqlanmoqda → Yuborildi` checkmarks, smooth tab/panel reveals, priority queue expansion, and timeline marker focus on the doctor video player.
  - Honor `prefers-reduced-motion: reduce` everywhere; zero decorative looping animations that distract elderly patients or doctors scanning urgent alerts.
- **Accessibility & Uzbek readability:** Short Uzbek Latin copy, ≥48px tap targets on mobile patient controls, visible keyboard focus rings (`--focus`), large-text scale toggle (`html[data-text-scale='large']`), full light/dark mode parity (Web + Android `ShifoTheme.kt`), and spoken + text severity labels paired with every color.

## Information hierarchy — Two stories, zero clutter

| Surface | Primary job |
|---|---|
| Landing (`/`) | Lead with **Story 1** (Dori → Shifokor javobi → 7-kunlik AI hisobot) and **Story 2** (3 ta mashq CV + video ko‘rik), offering instant **1-klik Demo** alongside a compact **«Klinika hisobiga kirish»** option |
| Doctor Web (`/doctor`) | Multi-patient switcher (in clinic mode), urgency-sorted queue (`red` → `yellow`), Supervised AI 7-day brief card with inline edit & L4 approval, and full-video player with clickable flagged-cycle timestamps |
| Patient Web (`/patient`) | Time-grouped daily medication cards, DoriMos verification sheet, manual BP (high + low zone feedback), 7-day step trend (`Telefon sensori` vs `Qo‘lda`), compact Teach-Back, doctor replies, `Yaqinim` 24h link, and persistent `103` + `Og‘riq bor` |
| Native Android | Same daily clinical rhythm with native Compose transitions, dark mode parity, on-device MediaPipe CV (**`Full`** default + user-selectable **`Heavy`** accuracy toggle in settings), and consented video upload |
| Telegram Mini App (`/tg`) | Shared patient Web components adapted to Telegram safe areas, `MainButton`/`BackButton`, haptics, and Bearer auth (no broken iframe cookies) |
| Telegram Bot | Clean chat commands, opt-in privacy control, styled `primary`/`success`/`danger` inline dose actions, and direct deep links into the exact Mini App record |
| Yaqinim (`/caregiver/[token]`) | Calm read-only daily aggregate card with Fergana & Kuala Lumpur clocks and one-tap help acknowledgment |

Always keep synthetic demo / sample-media disclosure visible yet unobtrusive (subtle header badge, never faking real patient telemetry).

## Patient daily workflows (Story 1)

1. **Bugun (ko‘p dori va vaqtlar):** Group doses by scheduled Toshkent time (`08:00`, `20:00`, etc.) showing each drug name, strength/unit, and status. `Ichdim` and `Icha olmadim` act directly on that exact dose; ask missed reason (`Dori tugadi`, `Nojo‘ya ta’sir`, `Unutdim`, `Boshqa`) in a clean bottom sheet/drawer only when `Icha olmadim` is chosen.
2. **DoriMos (yangi quti):** Offer box verification cleanly per medication item with synthetic sample picker (demo only) or camera photo, clear confirmation sheet (`Nom · Kuch · Birlik`), and `Keyinroq` / `Qayta oling` / `Qo‘lda qayd` fallbacks.
3. **Rejani tushunish (ixcham Teach-Back):** Present the doctor's instruction with 1–2 quick Uzbek check questions and immediate gentle feedback.
4. **Qon bosimi (yuqori + past chegara):** Labeled manual systolic/diastolic inputs with instant physiological validation (e.g., rejecting `systolic <= diastolic` or impossible values), symptom checkboxes, clear High / Low / Normal zone badges, deterministic emergency guidance, and optional linked repeat reading.
5. **Qadamlar:** Daily goal ring/bar + 7-day trend showing per-day source badge (`Telefon sensori` vs `Qo‘lda kiritilgan`) and explicit empty state for missing days.
6. **Haftalik hisobot va shifokor javoblari:** Per-medication counts (`rejalashtirilgan · ichilgan · o‘tkazilgan · javobsiz`), separate BP/steps/exercise cards, and highlighted doctor-approved replies.

### Shared interaction states

| State | Patient-facing feedback |
|---|---|
| Submitting | Inline `Saqlanmoqda` spinner beside the exact control; prevent double-tap |
| Confirmed | Animated check + `Yuborildi` badge once server acknowledges |
| Offline / saved on phone | `Internet aloqasi yo‘q. Qayd telefonda saqlandi, hali yuborilmadi` (plus explicit note that AI and video upload need internet) |
| Under review | `Shifokor ko‘rigida` badge linked to the flagged record |
| Doctor replied | `Shifokor javobi tayyor` card opening directly to the approved reply |
| AI unavailable / fallback | Seamless deterministic Uzbek summary or guidance with clear retry option — never a dead-end error screen |

## Exercise CV & complete-attempt doctor review (Story 2)

- **Three polished movements everywhere:** `O‘tirib-turish` (`chair_stand`), `Tirsak bukish` (`elbow_bend`), and `O‘tirgan holda oyoqni tekislash` (`seated_knee_ext`).
- **Prepared video first, live camera optional:** Present the prepared public sample as the zero-friction demo entry with clear sample disclosure and real-time progress bar; offer live camera and local file picker where supported. Keep MediaPipe/Mediabunny lazy-loaded until the patient opens an exercise.
- **Android CV accuracy setting:** Show a clear toggle in Android exercise/app settings: **`Tezkor (Full)`** (recommended default for all phones) vs **`Yuqori aniqlik (Heavy)`** (opt-in for recorded video on high-end devices, noting slower processing).
- **Flagged-cycle AI cards:** Display each AI observation beside its exact cycle number, time range, extracted keyframes, and CV measurements, with honest uncertainty wording (e.g., `3-takror · 00:12–00:16 · tizza qisman to‘silgan`) and one-tap seek to that timestamp.
- **Consented full-attempt upload:** Preview the full attempt before sharing; require explicit action **`Shu urinish videosini shifokorga yuborish`** explaining scope, ≤60 s / ≤20 MiB limit, and expiry (`shifokor javobidan 7 kun yoki yuklangandan 30 kun`). Show smooth upload progress, cancel, and retry states.
- **Doctor timestamp player:** Side-by-side (desktop) or stacked (mobile) full video player + clickable flagged-cycle markers + CV/AI evidence cards + single doctor reply composer. If media has expired, show a calm expired-media placeholder while keeping all measured metrics and clinician replies intact.

## Doctor queue & Supervised AI Brief

- Put urgent (`red`) items first, then warning (`yellow`), oldest first within each tier. Every row clearly displays patient name, alert type, affected drug/dose or exercise, channel badge (`Android` / `Telegram` / `Web`), and timestamps.
- In the **7-kunlik AI xulosa** card, visually separate: (1) deterministic metrics, (2) AI-generated Uzbek summary with clickable chips linking to exact source DB records, (3) editable doctor reply draft (`Tahrirlash va L4 tasdiqlash`), and (4) private internal `Shifokor izohi` clearly marked as never shown to patients or caregivers.

## Telegram ergonomics

- **Chat:** Keep messages scannable with styled `primary` / `success` / `danger` inline buttons (`✓ Ichdim`, `Dori tugadi`, `Mini App’da ochish`). Update the message immediately after server acknowledgment so stale buttons disappear.
- **Privacy opt-in:** Default notices show generic text (`ShifoHalqada yangi shifokor javobi bor`) + Mini App button; provide a clear `/sozlamalar` or inline opt-in prompt explaining lock-screen preview tradeoffs before displaying drug names or approved replies directly in chat.
- **Mini App:** Respect `--tg-theme-*` chrome and safe-area insets while preserving Clinical Ledger semantic contrast (`--urgent`, `--warn`, `--ok`) so clinical alerts remain unmistakable in any Telegram theme.

## Implemented Web architecture refinements (M3)

- **Tailwind v4 + Clinical Ledger token bridge (`src/app/globals.css`, `components.json`):** `shadcn/ui` primitives (`radix-nova` style) bind via `@theme inline` onto `--paper`, `--card`, `--ink`, `--action`, `--urgent`, `--warn`, `--ok`. Semantic text muted (`--muted: #52645b`) maps to `--color-muted-foreground`, while surface muted (`--muted-bg: var(--panel)`) maps to `--color-muted`, keeping CSS Modules and Tailwind utilities harmonious in light and dark modes.
- **No-FOUC `<meta name="color-scheme">` theme toggle (`src/app/layout.tsx`, `src/components/accessibility-controls.tsx`, `src/components/ui/sonner.tsx`):** `ThemeToggle` switches between explicit `light` / `dark` and system `light dark` via `<meta name="color-scheme">` + inline pre-paint script (no `.dark` class flash), while `Sonner` toast notifications observe `<meta name="color-scheme">` directly.
- **Tactile controls & form semantics (`src/components/ui/button.tsx`, `src/components/ui/native-select.tsx`, `src/components/ui/sheet.tsx`, `src/components/providers.tsx`):** `MotionConfig reducedMotion="user"` wraps the root tree; buttons use crisp `150ms` `active:not-aria-[haspopup]:scale-[0.97]` feedback; `NativeSelect` preserves accessible mobile/keyboard selection alongside the `Icha olmadim` bottom `Sheet` (`pr-12` close-button clearance); card headers embed semantic `<h2>` inside `<CardTitle>` to preserve landmark navigation.
