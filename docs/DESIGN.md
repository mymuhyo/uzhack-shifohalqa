---
version: 2.0
name: ShifoHalqa Precision Clinical
description: "Crisp tonal-layered clinical interface blending Context.dev hairline geometry, OpenCode monospace telemetry, ArtCraft studio media framing, and high-legibility medical accessibility in Light & Obsidian Dark modes."
colors:
  light:
    background: "#FFFFFF"
    surface: "#FFFFFF"
    surface-low: "#F7F8FA"
    surface-container: "#F1F5F9"
    on-surface: "#09090B"
    on-surface-variant: "#3F3F46"
    on-surface-muted: "#64748B"
    outline: "#09090B17"
    outline-strong: "#CBD5E1"
    primary: "#2563EB"
    primary-hover: "#1D4ED8"
    on-primary: "#FFFFFF"
    primary-tint: "#EFF6FF"
    urgent: "#DC2626"
    urgent-bg: "#FEF2F2"
    warn: "#B45309"
    warn-bg: "#FFFBEB"
    ok: "#047857"
    ok-bg: "#ECFDF5"
  dark:
    background: "#090A0D"
    surface: "#111318"
    surface-low: "#14171F"
    surface-container: "#181B22"
    on-surface: "#FAFAFA"
    on-surface-variant: "#CBD5E1"
    on-surface-muted: "#94A3B8"
    outline: "#FFFFFF17"
    outline-strong: "#FFFFFF2E"
    primary: "#3B82F6"
    primary-hover: "#60A5FA"
    on-primary: "#FFFFFF"
    primary-tint: "#3B82F61F"
    urgent: "#FB7185"
    urgent-bg: "#E11D4829"
    warn: "#FBBF24"
    warn-bg: "#F59E0B26"
    ok: "#34D399"
    ok-bg: "#10B98124"
typography:
  headline-display:
    fontFamily: Inter Variable
    fontSize: clamp(2.25rem, 4.4vw, 3.85rem)
    fontWeight: 600
    lineHeight: 1.06
    letterSpacing: -0.04em
  headline-lg:
    fontFamily: Inter Variable
    fontSize: clamp(1.35rem, 2.2vw, 1.75rem)
    fontWeight: 600
    lineHeight: 1.18
    letterSpacing: -0.03em
  title-md:
    fontFamily: Inter Variable
    fontSize: 1.0625rem
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: -0.02em
  body-md:
    fontFamily: Inter Variable
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.55
  mono-telemetry:
    fontFamily: JetBrains Mono
    fontSize: 0.8125rem
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: -0.02em
rounded:
  sm: 8px
  md: 12px
  lg: 16px
  full: 9999px
motion:
  micro: 150ms cubic-bezier(0.23, 1, 0.32, 1)
  reveal: 200ms cubic-bezier(0.23, 1, 0.32, 1)
  reducedMotion: "MotionConfig reducedMotion='user'"
---

# ShifoHalqa Precision Clinical Design System

> **Living design contract.** Guides Web, Telegram Mini App, and Android craft for Grand Final and v2. [DECISIONS](DECISIONS.md) owns product scope; [PLAN](PLAN.md) owns milestones; [ROADMAP_V2](ROADMAP_V2.md) owns post-final evolution.

## Overview & Visual Direction

ShifoHalqa merges **clinical calm and authority** with modern software craft:

- **Context.dev tonal precision:** Crisp white (`#FFFFFF`) and cool slate (`#F7F8FA` / `#F1F5F9`) layers separated by `1px` hairline borders (`rgba(9, 9, 11, 0.09)`), sharp `-0.04em` `Inter Variable` headlines, and electric clinical blue (`#2563EB`) strictly reserved for primary actions and active focus.
- **OpenCode telemetry discipline:** Every BP reading (`158/98 mmHg`), scheduled Toshkent dose time (`08:00`), CV joint angle (`89.8°`), evidence tier (`L0–L4`), and clickable DB citation (`id`) renders in `JetBrains Mono` with `tabular-nums` so doctors scan numbers without eye strain.
- **ArtCraft studio media framing:** Exercise CV viewports and doctor video review players sit inside an obsidian darkroom stage (`#090A0D` / `#111318`) with crisp keyframe thumbnails and clickable flagged-cycle markers.
- **Medical accessibility non-negotiables:** Body text ≥ `16px`, ≥ `44–48px` touch targets, visible keyboard focus rings, `A+ Katta shrift` scale toggle (`html[data-text-scale='large']`), `<meta name="color-scheme">` instant light/dark mode without FOUC, and semantic red/amber/emerald indicators always paired with Uzbek Latin labels.

## Colors & Tokens (`src/app/globals.css`)

| Role | Light | Dark (Obsidian Studio) | Usage |
|---|---|---|---|
| Canvas (`--paper`) | `#FFFFFF` | `#090A0D` | Page canvas + sticky translucent header |
| Surface (`--card`) | `#FFFFFF` | `#111318` | Primary interactive cards with hairline ring |
| Tonal Low (`--panel`) | `#F7F8FA` | `#181B22` | Secondary wells, KPI strips, nested telemetry rows |
| Primary Ink (`--ink`) | `#09090B` | `#FAFAFA` | Headings, core values, clinical text |
| Muted Ink (`--muted`) | `#64748B` | `#94A3B8` | Hints, timestamps, metadata labels |
| Primary Action (`--action`) | `#2563EB` | `#3B82F6` | Primary CTAs, active tabs, selected patient pills |
| Urgent (`--urgent` / `--urgent-bg`) | `#DC2626` / `#FEF2F2` | `#FB7185` / `rgba(225,29,72,0.16)` | Red BP thresholds, chest pain, `103` emergency |
| Warn (`--warn` / `--warn-bg`) | `#B45309` / `#FFFBEB` | `#FBBF24` / `rgba(245,158,11,0.15)` | Monitoring queue, out-of-supply follow-up |
| OK (`--ok` / `--ok-bg`) | `#047857` / `#ECFDF5` | `#34D399` / `rgba(16,185,129,0.14)` | Normal BP, L4 doctor approval, goal met |

## Page Layouts & Information Architecture

| Surface | Structural Layout |
|---|---|
| Landing (`/`) | Split architectural hero (ambient radial cobalt accent, bold `Inter` display title, Story 1 & 2 bento telemetry showcase below fold) + elevated **Launch Console** (`1-klik Judge Demo` + collapsible **«Klinika hisobiga kirish»** Supabase Auth). |
| Doctor (`/doctor`) | **Clinical Command Center**: Multi-patient triage switcher cards (`red -> yellow` with initials & mono counters), 4-tile telemetry KPI strip, Supervised AI 7-day workbench (metrics + BP bars + clickable DB citations + editable L4 reply), and asymmetric **2-column desktop workspace** (Left: Triage Queue + Studio Exercise Review; Right: Assigned Plan + Dual-Source Steps + Integrations). |
| Patient (`/patient`) | **Mobile-first 2-column Daily Companion**: Persistent crimson `103` + `Og‘riq bor` action bar; Left primary stream (Toshkent time-grouped medications + `Icha olmadim` bottom `Sheet` + DoriMos + High/Low BP + Teach-Back + Urgent symptoms); Right rail (L4 weekly doctor reply + adherence ring/bars + 7-day step trend + `Yaqinim` 24h link). |
| Exercise (`/patient/exercise`, `/demo/mashq/*`) | **Studio CV Viewport**: Segmented movement pills (`chair_stand`, `elbow_bend`, `seated_knee_ext`), obsidian darkroom player stage with overlay telemetry, prepared-sample primary CTA, flagged-cycle AI keyframe cards, and consented full-attempt upload (`<= 60 s / <= 20 MiB`). |
| Caregiver (`/caregiver/[token]`) | Serene centered read-only status card with monospace daily counters, status badge, help-ack action, and `Farg‘ona · Kuala Lumpur` dual clocks (`no-store`, `noindex`, `no-referrer`). |

## Do's, Don'ts & Motion

- **Do** keep card elevation to `1px` hairline rings + tonal surfaces (`#FFFFFF` ↔ `#F7F8FA` / `#111318` ↔ `#181B22`) and soft ambient shadows.
- **Do** format every numerical reading, dose time, angle, L0–L4 tier, and ID in `JetBrains Mono` (`tabular-nums`).
- **Don't** sacrifice touch target height (`>= 44px`) or semantic status clarity (`text + icon + badge`) for minimalism.
- **Don't** run decorative infinite animations or transitions slower than `220ms`; wrap the root tree in `<MotionConfig reducedMotion="user">` (`src/components/providers.tsx`).
- **Dark mode mechanism:** Managed declaratively via `<meta name="color-scheme">` (`light dark`, `light`, `dark`), an inline FOUC-prevention head script in `src/app/layout.tsx`, and `Sonner` meta observer — never relying on `.dark` JS classes alone.

## Clinical Domains (Preserved Contracts)

1. **Story 1 (Patient daily loop):** 1–3 drugs × 1–2 fixed Toshkent times (`Ichdim` / `Icha olmadim` bottom `Sheet` + `Dori tugadi`), DoriMos `mg`/`mcg`/`g`/`iu` + `Keyinroq`, compact Teach-Back, High + Low BP physiological validation + linked retake, dual-source steps (`Telefon sensori` vs `Qo‘lda`), and doctor-approved 7-day reply (`L4`).
2. **Story 2 (3-Movement CV & video review):** Lazy-loaded MediaPipe/Mediabunny for `chair_stand`, `elbow_bend`, and `seated_knee_ext`, prepared clip first, flagged-cycle AI observation cards with uncertainty copy, consented upload progress/cancel, and doctor side-by-side timestamp player (with calm `410` expired-media fallback keeping metrics intact).
3. **Android & Telegram:** Android Compose Dark Mode parity (`ShifoTheme.kt`) + `Full`/`Heavy` CV accuracy setting; Telegram styled inline actions + opt-in privacy controls + `--tg-theme-*` Mini App using shared Precision Clinical contrast tokens.
