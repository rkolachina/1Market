---
name: 1market-design
description: The 1Market web app's design language ("Friendly workshop"). Use whenever building, changing, or reviewing any 1Market UI screen or component (web app in this repo). Defines colors, type, shape, components, UI copy voice, and what never to do. Use together with ui-ux-pro-max for UX/accessibility rules; this skill wins on visual style.
---

# 1Market design language: "Friendly workshop"

**Who uses it:** owners of small local service businesses (gutters, landscaping, cleaning, salons), mostly on their phone, between jobs, often not tech-savvy. They open the app to do one thing (approve a post, ask for a post, check the week) and leave.

**How it should feel:** a well-run workshop's job board that's friendly to walk into. Sturdy and organized (condensed headings, stamped mono labels, clear structure) but approachable: rounded cards, soft borders, sentence-case headings, warm paper and ink. Never a cold gray dashboard, never cute.

Tokens live in `web/src/index.css` (`@theme`). Components use the Tailwind token classes, never raw hex.

## 1. Color (no orange anywhere)

| Token | Hex | Use |
|---|---|---|
| `paper` | `#F4EFE6` | App background |
| `card` | `#FFFDF8` | Cards, inputs, tab bar |
| `ink` | `#2B2420` | Text, primary buttons, heavy rules, selected states, focus ring |
| `ink-muted` | `#6B5E52` | Secondary text, meta, inactive tabs, hover on primary |
| `rule` | `#C9B99D` | Card borders, input borders, grid lines |
| `sand` | `#E3D6BF` | Skipped marker, quiet fills |
| `muted-soft` | `#EAE2D6` | Selected/hover backgrounds |
| `olive` / `olive-soft` | `#3F5A3C` / `#DDE5D6` | Scheduled, success |
| `mustard` / `mustard-soft` | `#E0B04A` / `#F7EBD0` | Needs your OK (safety yellow) |
| `brick` | `#A8321F` | Errors, missed, destructive |

Verified contrast: ink/paper 13+, ink-muted/paper 5.5, ink-muted/muted-soft 4.9, brick/missed chip 5.2, olive/olive-soft 5.9, ink/mustard-soft 12.9. Keep every text pair ≥ 4.5:1.

Status (always color + word): Needs your OK (mustard), Scheduled (olive), Posted (ink), Missed (brick), Skipped (sand), Didn't post (brick).

## 2. Type

- **Headings:** `Barlow Condensed` 700, sentence case, line-height ~1.08. Page title 40px, section 26px.
- **Body/UI:** `Atkinson Hyperlegible Next` 400/600/700, 17px body, never below 15px for content.
- **Meta/labels:** `IBM Plex Mono` uppercase with letter-spacing: dates, times, statuses, counts, tab labels, eyebrows. Classes: `.meta` (13px), `.label-caps` (12px). Numbers tabular.
- Headings, body copy and buttons are sentence case; only the small mono labels are uppercase.

## 3. Shape and structure

- Corners: cards and calendar frame 16px, segmented controls 14px, buttons 12px, inputs/thumbnails 10px. Status tags and status dots are fully round.
- Borders: 1px `rule` for cards, inputs, secondary buttons, tab bar and calendar lines. Primary buttons are solid ink with no border.
- Page header = mono eyebrow + condensed title + short intro line. **Nothing underneath it: no squiggles, no rules, no decorative lines.**
- Shadows only on floating things (toasts, sheets). No soft glows.
- Spacing scale 4/8/12/16/24/32/48. Side padding 16 mobile, 24 tablet+. Content max 640px.

## 4. Components (canonical)

- **Buttons:** `.btn-primary` solid ink, white bold text, 12px radius; `.btn-secondary` card fill, 1px rule border; `.btn-text` underlined ink text. Min height 48 (44 for text buttons).
- **Status tag:** rounded pill, mono uppercase label, round marker, tinted fill.
- **Tabs (bottom bar / side rail):** mono uppercase labels, active tab = ink text + muted-soft fill (+ small rounded ink bar on phone; rounded highlight on desktop rail).
- **Segmented control** (platform tabs): muted-soft track, selected segment is a white card with a soft shadow.
- **Calendar:** rounded 16px frame with 1px `rule` grid lines, mono day numbers top-left, today = ink-muted ring, selected = ink circle with white number on a muted-soft cell, round status dots.
- **Inputs:** paper fill, 1px rule border, 10px radius, label above (never placeholder-only), help in muted, errors in brick next to the field.
- **Toasts:** ink background, paper text, 16px radius.

## 5. Icons and imagery

Phosphor (regular; fill for the active tab). Never emoji as UI icons. Icon-only buttons need `aria-label`. Post images are shown large (they are the product); thumbnails square, 2px corners.

## 6. Layout and navigation

Mobile-first single column. Bottom tab bar on phone (Home, Calendar, Posts, Business); left rail ≥1024px with the "1MARKET / POST DESK" block. Primary action in the thumb zone (sticky action bar on draft review). Touch targets ≥ 44px.

## 7. Motion

150–250ms color/position changes only; respect `prefers-reduced-motion`. No bounce, parallax, or scroll-triggered animation.

## 8. UI copy voice

Plain, short, practical, warm. "Approve for Tue, Nov 25 · 9:00 AM." "Nothing needs your OK right now. Nice." "We couldn't post this. Facebook said the image was too large. Try again?" Never "AI/agent/LLM" in the main UI; it's "we" or "your assistant". Never system-speak ("transitioned to APPROVED").

## 9. Never do

- Orange of any kind
- Squiggles, hand-drawn flourishes, or any decorative line under headings
- Soft serif display fonts; ALL-CAPS headings
- Purple/indigo gradients, glassmorphism, neon, dark hacker themes
- Inter, Poppins, Roboto, Open Sans, Montserrat as main fonts
- Emoji as icons; ✨ "AI" icons
- Rows of identical big-number stat cards as the main content
- Gray-on-gray text, cool blue-gray shadows, placeholder-only inputs, hover-only actions, tiny tap targets

## 10. Before delivering a screen

Run the ui-ux-pro-max pre-delivery checklist (contrast, focus states, 44px targets, reduced motion, 375/768/1024 widths) and re-read section 9.
