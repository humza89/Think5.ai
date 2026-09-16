# Think5 public pages redesign — design spec

Date: 2026-09-16
Status: approved direction (theme, type, logo, dev-server fix confirmed by Humza)

## Goal

Redesign every public-facing page of Think5 so it reads as a premium,
editorial AI-talent brand on par with Paraform, Mercor and micro1, while
keeping the existing home hero (video background, falling candidate cards,
left-aligned headline) that Humza likes.

## Competitor takeaways

| Site | What works | What we borrow |
|------|-----------|----------------|
| Paraform | Warm off-white body, serif display type, dark cinematic hero, bordered logo tiles, one big customer quote | Light editorial body, serif headlines, logo tiles, single-quote testimonial |
| Mercor | Quiet type, one accent colour, research as credibility, product entry list | Single accent, research page as an index, restraint |
| micro1 | Full dark, geometric sans, real product screenshots | Product surfaces drawn in code instead of abstract cards |

Think5's differentiator: dark hero **into** a light body. None of the three do this.

## Brand system

### Colour tokens (added to `globals.css` as CSS variables, exposed in Tailwind)

| Token | Value | Use |
|-------|-------|-----|
| `--ink` | `#0A0A0B` | Dark surfaces, primary text on light |
| `--ink-2` | `#151517` | Dark cards |
| `--paper` | `#F6F4EF` | Light page background |
| `--paper-2` | `#FFFFFF` | Light cards |
| `--stone` | `#E4E0D7` | Hairlines on light |
| `--graphite` | `#6B6A66` | Muted text on light |
| `--brand` | `#1F3DFF` | Single accent, sampled from the logo dot |
| `--brand-soft` | `#E9ECFF` | Accent tint on light |

No blue glows, no glowing borders, no gradient blobs. Depth comes from hairlines,
paper-on-paper layering and one accent.

### Typography

- Display: **Instrument Serif** (Google, via `next/font`), regular and italic.
  Tracking `-0.02em`, line-height 1.02 to 1.08.
- Body and UI: **Inter** (already loaded).
- Scale: hero 72/88px, page h1 60/72px, section h2 44/56px, eyebrow 11px
  uppercase tracked 0.18em, body 17/18px, small 14px.
- Italic serif is used sparingly for one emphasised word per headline.

### Logo

- Wordmark: `think5` lowercase, geometric sans (drawn as SVG paths from the
  existing PNG's letterforms: Poppins-like), trailing dot in `--brand`.
- Mark: square tile, `--ink` fill, a bold `5` cut out in paper with the brand
  dot sitting at its baseline. Works at 16px (favicon) and 40px (header).
- Components: `components/brand/Logo.tsx` (wordmark, `tone="dark" | "light"`)
  and `components/brand/LogoMark.tsx`. Favicon: `app/icon.svg`.

## Shared marketing components (`components/marketing/`)

| Component | Purpose |
|-----------|---------|
| `SiteHeader` | Full-width top bar. `tone="dark"` = transparent over hero, white text. `tone="light"` = paper with blur and bottom hairline. Keeps auth-aware buttons and mobile sheet from the current `Header.tsx`. |
| `SiteFooter` | Dark, four link columns, large serif tagline, status pill. |
| `Container`, `Eyebrow`, `SectionTitle` | Layout and heading primitives |
| `StatRow` | Large serif numbers over hairlines |
| `LogoWall` | Marquee of customer logos in bordered tiles |
| `CtaBand` | Dark closing band with serif headline and two buttons |
| `AriaMock`, `NexusMock`, `ForgeMock` | Product surfaces drawn in HTML/CSS: interview transcript with live scoring, expert match card with fit score, data pipeline stage strip |
| `AuthShell` | Two-pane auth layout: left ink panel with logo mark, serif quote, dot grid; right paper panel with the form |

`components/layout/Header.tsx` becomes a thin re-export of `SiteHeader` so the
dashboard imports keep working. `components/landing/Footer.tsx` likewise
re-exports `SiteFooter`.

## Page by page

### 1. Home `/`

1. **Hero** — unchanged structure, video, falling cards and CTA. Headline set
   in Instrument Serif. New header logo.
2. **Logo wall** — stays on ink directly under the hero, tiles instead of bare
   images.
3. **Manifesto** (paper) — one large serif statement, then three numbered
   pillars in a row: Source, Vet, Deploy. Replaces the six glass cards.
4. **Platform** (paper) — Aria, Nexus, Forge as three stacked rows, mock on
   one side and copy on the other, alternating. Replaces the Spline robot and
   the PNG platform image.
5. **Data engine** (paper-2 card) — capability list (RLHF, SFT, VLM, reasoning,
   multi-modal, red teaming) as a typographic grid plus `StatRow`.
6. **How it works** (paper) — four steps on a horizontal rule with numbers.
7. **Quote** (paper) — one large serif customer quote.
8. **CTA band** + **Footer** (ink).

### 2. Product `/product`

Light. Hero with h1 and three anchor chips (Aria, Nexus, Forge). One section
per product: mock, feature list with hairline rows, `StatRow`. Forge keeps the
capability grid. Closes with `CtaBand`.

### 3. Research `/research`

Light. Hero, featured paper as a large card, remaining papers as an editorial
index (category, title, date on hairline rows), three research areas as
columns, collaborate `CtaBand`.

### 4. Contact `/contact`

Light. Left: h1, what we help with (hairline list), email and location. Right:
form on a paper-2 card. Existing submit behaviour and success state preserved.

### 5. Auth `/auth/signin`, `/auth/signup`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify`

All use `AuthShell`. Sign-in and sign-up keep their form logic, role picker and
error handling. Stock Unsplash photos and testimonial carousels are removed
(they also 500 in dev because the host is not in `next.config`). Forgot, reset
and verify use the same shell with a single-column card.

### 6. `/unauthorized`

Light, centred, logo mark, serif heading, two buttons.

### 7. `/interview/accept`

Candidate-facing entry to the interview. Stays on ink to lead into the
interview UI; centred card, logo mark, serif heading. Logic untouched.

## Out of scope

- Copy rewrites beyond what layouts require. Existing stats, papers and
  testimonials stay.
- New pages (About, Careers, Blog links in the footer remain as they are).
- Any dashboard, candidate or admin UI.
- Removing the Spline CSP allowances from `next.config.ts`.

## Infrastructure changes already made

- `middleware.ts` merged into `proxy.ts` (Next 16 allows one). CSRF, HTTPS
  redirect and rate limiting behave as before.
- `/product`, `/research`, `/contact`, `/unauthorized`, `/auth/forgot-password`
  and `/auth/reset-password` added to the public route list.
- `.claude/launch.json` added for the dev server.

## Verification

- `npx tsc --noEmit` clean for all touched files; `npm run lint` clean.
- Existing `vitest` suite still passes.
- Each page screenshotted at 1280px and 375px in the in-app browser, no
  console errors, no CSP violations.
- Logged-out `curl` of every public route returns 200.
