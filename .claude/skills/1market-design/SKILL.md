---
name: 1market-design
description: The 1Market web app's design language ("warm local shop"). Use whenever building, changing, or reviewing any 1Market UI screen or component (web app in this repo). Defines colors, type, spacing, components, UI copy voice, and what never to do. Use together with ui-ux-pro-max for UX/accessibility rules; this skill wins on visual style.
---

# 1Market design language: "Warm local shop"

**Who uses it:** owners of small local service businesses (gutters, landscaping, cleaning, salons), mostly on their phone, between jobs, often not tech-savvy. They open the app to do one thing (approve a post, ask for a post, check the week) and leave.

**How it should feel:** like a friendly neighborhood shop that happens to be very well organized. Warm, calm, trustworthy, a little handmade. Never like a generic SaaS dashboard.

## 1. Color tokens (use tokens, never raw hex in components)

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#F7F1E6` | App background (cream paper) |
| `--card` | `#FFFDF8` | Cards, sheets, inputs |
| `--ink` | `#2B2420` | Primary text (warm near-black) |
| `--ink-muted` | `#6B5E52` | Secondary text, meta, timestamps; ALSO the primary action color (Approve, Send buttons), focus ring, active tab, today/selected markers |
| `--sand` | `#E3D6BF` | Borders, dividers, empty states |
| `--muted-soft` | `#EAE2D6` | Selected / hover backgrounds |
| `--olive` | `#3F5A3C` | Scheduled, success, positive states |
| `--olive-soft` | `#DDE5D6` | Success backgrounds |
| `--mustard` | `#E0B04A` | Needs approval / attention (ink text on it) |
| `--brick` | `#A8321F` | Errors, missed, destructive |

Contrast verified: ink/paper 13.6, muted/paper 5.6, white/ink-muted 6.3, ink-muted/muted-soft 4.9, white/olive 7.7, ink/mustard 7.6, white/brick 6.7. Keep every text pair ≥ 4.5:1.

**No orange anywhere** (no terracotta, rust, amber-orange). Actions use ink-muted. Because ink-muted is also the secondary-text color, links must be underlined and primary actions must be filled pill buttons, so actions never look like plain text.

**Post status colors (calendar, drafts, badges) — always pair color with a word or icon:**
- Needs approval → mustard dot + "Needs your OK"
- Scheduled → olive dot + "Scheduled"
- Posted → ink check icon + "Posted"
- Missed → brick dot + "Missed"
- Skipped → sand dot + "Skipped"

Dark mode: not in v1. Owners use the app outdoors in daylight.

## 2. Typography

- **Headings:** `Fraunces` (variable, soft optical size; weights 500–700; use the `SOFT` axis ~50). Warm, characterful serif. Page titles, greetings, empty-state headlines, big numbers.
- **Body/UI:** `Atkinson Hyperlegible Next` (400/600/700). Built for legibility; ideal for non-technical users on small screens in sunlight.
- Load from Google Fonts with `display=swap`.
- Scale (mobile): 32 / 24 / 20 / 17 (body) / 15 (meta) / 13 (labels, min). Body never below 16–17px. Line height 1.5 body, 1.15 headings.
- Numbers in calendars and counts: `font-variant-numeric: tabular-nums`.
- Sentence case everywhere. No ALL CAPS except tiny labels (≤ 13px, letter-spacing 0.06em).

## 3. Shape, space, texture

- Spacing scale (px): 4, 8, 12, 16, 24, 32, 48. Screen side padding 16 (mobile), 24 (tablet+).
- Radius: cards 16, inputs 12, buttons fully rounded (pill), images 12.
- Borders do the work: 1px `--sand`. Shadows only for things that float (sheets, menus): `0 8px 24px rgba(43,36,32,0.10)` — warm-tinted, never gray-blue.
- Subtle paper grain on the app background only (SVG noise, opacity ≤ 0.05). Never on cards or text.
- One hand-drawn touch per screen at most: a squiggle underline under the greeting, a hand-drawn arrow in an empty state. Keep them SVG, ink or ink-muted, decorative (`aria-hidden`).

## 4. Icons and imagery

- Icons: **Phosphor** (regular weight; fill weight for active nav). Never emoji as icons. Icon-only buttons need `aria-label`.
- Post previews show the real image large (it's the product). Square or 4:5, radius 12.
- Empty states: short warm line + one action, optional small hand-drawn illustration. No stock 3D blobs.

## 5. Layout and navigation

- Mobile-first, single column. Max content width 640px centered on desktop (it's a phone-first tool, not a dashboard).
- Bottom tab bar (mobile), 4 tabs max: **Home**, **Calendar**, **Posts**, **Business** (profile). Same items as a left rail on ≥ 1024px.
- Primary action sits in the thumb zone (bottom). Sticky action bar on draft review: `Approve` (ink-muted filled pill, full width) with `Edit` / `Skip` as text buttons.
- Touch targets ≥ 44×44px with ≥ 8px between.
- Home leads with what needs attention: greeting → "2 posts need your OK" → those draft cards → request box.

## 6. Components (canonical looks)

- **Draft card:** image on top, platform chips (Facebook, Instagram), caption (3 lines, "more"), status line with date ("Tue, Nov 25 · 9:00 AM"), actions. Card bg `--card`, 1px sand border, radius 16.
- **Buttons:** primary = ink-muted filled pill, white text, 600 weight; secondary = sand border pill, ink text; text button = ink text, underlined on hover/focus. Links are always underlined. Loading state shows spinner + keeps width. Disabled = 40% opacity + not-allowed.
- **Inputs:** card bg, 1px sand border, radius 12, visible label above (never placeholder-only), helper text below in muted, error in brick with icon next to the field. Focus = 2px ink-muted ring with 2px offset.
- **Request box (talk to the assistant):** large textarea, warm prompt ("What should we post about?"), photo attach button, send button. Agent replies render as plain friendly text, not chat bubbles with avatars.
- **Calendar:** month grid, cream cells, today circled in ink-muted, selected day filled ink-muted with white number on a muted-soft cell, status dots per day (max 3 + "+2"), tapping a day opens a bottom sheet with that day's posts.
- **Toasts:** bottom, ink background, cream text, 4s, with Undo where possible ("Post skipped · Undo").

## 7. Motion

Subtle and purposeful. 150–250ms, ease-out for enter, faster exits. Use for: sheet slide-up, card approve (check + collapse), toast. Respect `prefers-reduced-motion` (no movement, instant states). No scroll-triggered animations, no parallax, no bouncing.

## 8. UI copy voice

Plain, warm, short, like a helpful neighbor. Talk to the owner as "you", about the business by name.
- ✅ "Looks good? Approve it and we'll post Tuesday at 9."
- ✅ "Nothing needs your OK right now. Nice."
- ✅ "We couldn't post this. Facebook said the image was too large. Try again?"
- ❌ "Draft successfully transitioned to APPROVED state."
- ❌ "Leverage AI to supercharge your social presence 🚀"
Errors say what happened + what to do. Never blame the user. Never mention "AI", "agent", "LLM" in the main UI; it's "we" or "your assistant".

## 9. Never do (the templated-AI-app look)

- Any orange (terracotta, rust, orange CTAs) — the owner's call; actions are ink-muted
- Purple/indigo/blue-violet gradients, glassmorphism, neon glows, dark "hacker" themes
- Inter, Poppins, Roboto, Open Sans, Montserrat as the main fonts
- Emoji as icons or in headings; sparkle ✨ icons for "AI"
- Grids of identical stat cards with big numbers as the main content
- Gray-on-gray text, pure #000 on pure #FFF, cool blue-gray shadows
- Placeholder-only inputs, hover-only actions, tiny tap targets
- Lorem ipsum or fake metrics in shipped screens

## 10. Implementation (React + Vite + Tailwind)

- Define tokens as CSS variables in `:root`, map them in `tailwind.config` (`colors.paper`, `colors.ink`, …; `fontFamily.display`, `fontFamily.body`). Components use Tailwind token classes, never raw hex.
- Phosphor via `@phosphor-icons/react`.
- Before delivering any screen: run the ui-ux-pro-max pre-delivery checklist (contrast, focus states, 44px targets, reduced motion, 375/768/1024 widths) and re-read section 9 above.
