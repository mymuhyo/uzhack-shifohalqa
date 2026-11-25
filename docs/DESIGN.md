---
version: 3.0
name: ShifoHalqa Rethink Clinical
description: "Crisp tonal clinical interface built on context.dev craft: Rethink Sans Variable at weight 400 with tight -0.035em tracking, #FFFFFF → #F7F8FA → #E9EFFD tonal steps, 7.2px hairline cards, electric #2563EB primary + #000000 secondary contrast, and DM Mono strictly for literal IDs."
colors:
  light:
    background: "#FFFFFF"
    surface: "#FFFFFF"
    surface-container-low: "#F7F8FA"
    surface-container: "#E9EFFD"
    surface-container-high: "#D1D5DC"
    on-surface: "#000000"
    on-surface-variant: "#4D4D4D"
    on-surface-muted: "#666666"
    outline: "#0000001F"
    outline-variant: "#E5E7EB"
    primary: "#2563EB"
    primary-hover: "#1D4ED8"
    on-primary: "#FFFFFF"
    secondary: "#000000"
    on-secondary: "#FFFFFF"
    urgent: "#DC2626"
    urgent-bg: "#FEF2F2"
    warn: "#B45309"
    warn-bg: "#FFFBEB"
    ok: "#047857"
    ok-bg: "#ECFDF5"
  dark:
    background: "#0A0A0B"
    surface: "#121316"
    surface-container-low: "#181A20"
    surface-container: "#1D2538"
    surface-container-high: "#272B36"
    on-surface: "#FFFFFF"
    on-surface-variant: "#B4B8C2"
    on-surface-muted: "#8A909E"
    outline: "#FFFFFF1F"
    outline-variant: "#262A34"
    primary: "#2563EB"
    primary-hover: "#3B82F6"
    on-primary: "#FFFFFF"
    secondary: "#FFFFFF"
    on-secondary: "#000000"
    urgent: "#FB7185"
    urgent-bg: "#E11D4829"
    warn: "#FBBF24"
    warn-bg: "#F59E0B26"
    ok: "#34D399"
    ok-bg: "#10B98124"
typography:
  headline-display:
    fontFamily: Rethink Sans Variable
    fontSize: clamp(2.35rem, 4.4vw, 3.5rem)
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: -0.035em
  headline-lg:
    fontFamily: Rethink Sans Variable
    fontSize: clamp(1.35rem, 2.2vw, 1.85rem)
    fontWeight: 400
    lineHeight: 1.18
    letterSpacing: -0.03em
  title-md:
    fontFamily: Rethink Sans Variable
    fontSize: 1.0625rem
    fontWeight: 500
    lineHeight: 1.3
  body-md:
    fontFamily: Rethink Sans Variable
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
  code:
    fontFamily: DM Mono
    fontSize: 0.875rem
    fontWeight: 400
rounded:
  sm: 5.4px
  md: 7.2px
  lg: 10.8px
  full: 9999px
motion:
  micro: 150ms cubic-bezier(0.23, 1, 0.32, 1)
  reveal: 200ms cubic-bezier(0.4, 0, 0.2, 1)
  reducedMotion: "MotionConfig reducedMotion='user'"
---

# ShifoHalqa Rethink Clinical Design System

> **Living design contract.** Built by stripping generic AI defaults (mixed Inter/JetBrains fonts, `rounded-2xl` bloat, radial background washes, ALL-CAPS eyebrows, decorative icon squares, and fake stat mockups) and grounding directly in `context.dev`'s hairline tonal precision + medical-grade accessibility.

## Visual Philosophy

- **Single unified UI typeface:** `Rethink Sans Variable` drives display headlines (`weight 400`, `-0.035em` tracking, `line-height 1.08`), section headings, body text (`16px`), buttons (`weight 500`), and `tabular-nums` clinical numbers. `DM Mono` is strictly limited to literal `<code>` database IDs and Android pairing tokens.
- **Tonal hierarchy, not drop shadows:** Depth comes from stepping cleanly between `#FFFFFF` → `#F7F8FA` → `#E9EFFD` (or `#0A0A0B` → `#121316` → `#181A20` → `#1D2538` in dark mode) framed by `1px` hairline rings (`7.2px` cards, `5.4px` chips, `10.8px` primary CTAs).
- **Stark action contrast:** `#2563EB` is reserved strictly for the primary action and active selection states; `#000000` (inverted `#FFFFFF` in dark mode) anchors secondary launches; clinical red/amber/green pills always carry explicit Uzbek Latin copy.

## Colors (`src/app/globals.css`)

| Role | Light | Dark | Usage |
|---|---|---|---|
| Background / Card (`--paper` / `--card`) | `#FFFFFF` | `#0A0A0B` / `#121316` | Main canvas and primary cards |
| Surface Low (`--panel`) | `#F7F8FA` | `#181A20` | KPI tiles, nested task items, input wells |
| Tonal Accent Surface (`--panel-blue`) | `#E9EFFD` | `#1D2538` | Active patient pills, AI workbench, selected focus |
| Hover Fill (`--panel-hover`) | `#D1D5DC` | `#272B36` | Button/chip hover states |
| Ink (`--ink` / `--muted`) | `#000000` / `#4D4D4D` / `#666666` | `#FFFFFF` / `#B4B8C2` / `#8A909E` | High-contrast 3-step text hierarchy |
| Primary (`--action`) | `#2563EB` | `#2563EB` | Primary CTA buttons, active rings |
| Secondary (`--ink-cta`) | `#000000` (on `#FFFFFF`) | `#FFFFFF` (on `#000000`) | Secondary launch & clinical contrast actions |
| Urgent / Warn / OK | `#DC2626` / `#B45309` / `#047857` | `#FB7185` / `#FBBF24` / `#34D399` | BP alerts, missed-dose queue, L4 approval |

## Do's, Don'ts & Motion

- **Do** use `Rethink Sans Variable` weight `400` on large headings with `-0.035em` tracking.
- **Do** use `7.2px` corners on cards and panels, `5.4px` on small tags/inputs, and `10.8px` on main buttons.
- **Do** preserve `html[data-text-scale='large']`, `@media print`, keyboard `:focus-visible`, and `MotionConfig reducedMotion="user"`.
- **Don't** add gradient washes, drop shadows under regular cards, ALL-CAPS eyebrows, decorative icon boxes, or monospace labels outside `<code>`.
- **Dark mode mechanism:** Declarative `<meta name="color-scheme">` (`light dark`, `light`, `dark`) + inline FOUC-prevention head script in `src/app/layout.tsx` + `Sonner` meta observer.

## Preserved Clinical Architecture (M1–M3)

- **Story 1 & Story 2:** Dual Judge Demo + Supabase Auth login on `/`, 2-column `/doctor` Command Center (multi-patient switcher, Supervised AI brief with DB citations & L4 approve, multi-drug plan, video timestamp player) and `/patient` Daily Companion (time-grouped meds + `Icha olmadim` bottom `Sheet`, DoriMos, High/Low BP, Teach-Back, dual-source steps, `Yaqinim`, `103` + `Og‘riq bor`), plus 3-movement `/patient/exercise` studio (`chair_stand`, `elbow_bend`, `seated_knee_ext`).
