# Public Pages Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every public Think5 page on a shared brand system (tokens, serif display type, SVG logo, marketing primitives) so the site reads as premium next to Paraform, Mercor and micro1, keeping the existing home hero.

**Architecture:** A small `components/brand` and `components/marketing` layer holds the logo, header, footer, layout primitives, product mocks and auth shell. Pages become thin compositions of those primitives. Existing header/footer import paths keep working via re-exports. No data or auth logic changes.

**Tech Stack:** Next.js 16 app router, React 19, Tailwind 3 with CSS variables, `next/font/google` (Instrument Serif), lucide-react, existing shadcn `Button`/`Input`/`Sheet`.

Spec: `docs/superpowers/specs/2026-09-16-public-pages-redesign-design.md`

---

## File structure

| Path | Responsibility |
|------|----------------|
| `app/globals.css` | Add brand tokens (`--ink`, `--paper`, `--brand`…), `font-display` utility, `.dot-grid` background utility |
| `tailwind.config.ts` | Expose tokens as `ink`, `paper`, `stone`, `graphite`, `brand` colours and `font-display` family |
| `app/layout.tsx` | Load Instrument Serif alongside Inter, set both as CSS variables |
| `app/icon.svg` | New favicon (Next picks it up automatically) |
| `components/brand/LogoMark.tsx` | Square tile mark, `size` and `tone` props |
| `components/brand/Logo.tsx` | Wordmark + dot, `tone` prop, optional mark |
| `components/marketing/primitives.tsx` | `Container`, `Eyebrow`, `SectionTitle`, `StatRow`, `Hairline` |
| `components/marketing/SiteHeader.tsx` | Top bar, `tone="dark"|"light"`, auth-aware, mobile sheet |
| `components/marketing/SiteFooter.tsx` | Dark footer |
| `components/marketing/LogoWall.tsx` | Customer logo marquee in tiles |
| `components/marketing/CtaBand.tsx` | Dark closing band |
| `components/marketing/mocks/AriaMock.tsx` | Interview transcript surface |
| `components/marketing/mocks/NexusMock.tsx` | Expert match card surface |
| `components/marketing/mocks/ForgeMock.tsx` | Pipeline stage strip surface |
| `components/marketing/AuthShell.tsx` | Two-pane auth layout |
| `components/layout/Header.tsx` | Becomes `export { default } from "@/components/marketing/SiteHeader"` |
| `components/landing/Footer.tsx` | Becomes `export { default } from "@/components/marketing/SiteFooter"` |
| `components/landing/HeroSection.tsx` | Keep; swap headline to `font-display`, use `SiteHeader tone="dark"` |
| `components/landing/{Manifesto,Platform,DataEngine,HowItWorks,Quote}.tsx` | New home sections (replace WhatWeDo, Infrastructure, IntelligencePlatform, CTA) |
| `app/page.tsx` | Compose new sections |
| `app/product/page.tsx`, `app/research/page.tsx`, `app/contact/page.tsx` | Rebuilt on primitives |
| `app/auth/*/page.tsx` | Wrapped in `AuthShell`, logic untouched |
| `app/unauthorized/page.tsx`, `app/interview/accept/page.tsx` | Restyled |

Deleted after migration: `components/landing/WhatWeDo.tsx`, `Infrastructure.tsx`, `IntelligencePlatform.tsx`, `CTA.tsx`, `Features.tsx` (unused), `TrustedBy.tsx` (replaced by `LogoWall`).

---

### Task 1: Brand tokens and fonts

**Files:** Modify `app/globals.css`, `tailwind.config.ts`, `app/layout.tsx`

- [ ] **Step 1: Add tokens to `app/globals.css`** inside the first `@layer base { :root { … } }` block (keep the shadcn HSL vars):

```css
    /* Think5 brand tokens */
    --ink: #0a0a0b;
    --ink-2: #151517;
    --paper: #f6f4ef;
    --paper-2: #ffffff;
    --stone: #e4e0d7;
    --graphite: #6b6a66;
    --brand: #1f3dff;
    --brand-soft: #e9ecff;
```

and add utilities at the end of the file:

```css
/* Brand utilities */
.font-display { font-family: var(--font-display), Georgia, serif; }
.dot-grid {
  background-image: radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1px);
  background-size: 22px 22px;
}
.dot-grid-light {
  background-image: radial-gradient(rgba(10,10,11,0.12) 1px, transparent 1px);
  background-size: 22px 22px;
}
```

- [ ] **Step 2: Expose in `tailwind.config.ts`** under `theme.extend.colors`:

```ts
        ink: { DEFAULT: "var(--ink)", 2: "var(--ink-2)" },
        paper: { DEFAULT: "var(--paper)", 2: "var(--paper-2)" },
        stone: "var(--stone)",
        graphite: "var(--graphite)",
        brand: { DEFAULT: "var(--brand)", soft: "var(--brand-soft)" },
```

and `theme.extend.fontFamily`:

```ts
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
      },
```

- [ ] **Step 3: Load fonts in `app/layout.tsx`**

```tsx
import { Inter, Instrument_Serif } from "next/font/google";
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const display = Instrument_Serif({ weight: "400", style: ["normal", "italic"], subsets: ["latin"], variable: "--font-display" });
// body className={`${inter.variable} ${display.variable} font-sans`}
```

- [ ] **Step 4: Verify** `npx tsc --noEmit 2>&1 | grep -v __tests__ | grep error` prints nothing. Dev server reload shows no font errors in `preview_logs`.
- [ ] **Step 5: Commit** `feat(brand): add colour tokens and Instrument Serif display font`

### Task 2: Logo mark, wordmark, favicon

**Files:** Create `components/brand/LogoMark.tsx`, `components/brand/Logo.tsx`, `app/icon.svg`

- [ ] **Step 1: `LogoMark`** — `({ size = 32, tone = "dark", className })`. Rounded square (radius 22% of size) filled `var(--ink)` for `tone="dark"` or `var(--paper-2)` for `tone="light"`, a heavy geometric `5` path in the opposite colour, and a circle in `var(--brand)` at the bottom-right of the 5's baseline. Pure SVG, `viewBox="0 0 64 64"`, `aria-hidden`.
- [ ] **Step 2: `Logo`** — `({ tone = "dark", withMark = false, className })`. Renders optional `LogoMark` then the wordmark as text `think5` in `font-sans font-semibold tracking-[-0.04em]` followed by a `<span>` dot in `text-brand`. Text colour `text-ink` when tone dark (for light backgrounds) and `text-white` when tone light. `aria-label="Think5"`.
- [ ] **Step 3: `app/icon.svg`** — same mark as `LogoMark` at 64×64 with ink fill.
- [ ] **Step 4: Verify** in browser: `/` header renders the mark and wordmark, tab shows the new favicon.
- [ ] **Step 5: Commit** `feat(brand): add SVG logo mark, wordmark and favicon`

### Task 3: Marketing primitives, header, footer, logo wall, CTA band

**Files:** Create `components/marketing/primitives.tsx`, `SiteHeader.tsx`, `SiteFooter.tsx`, `LogoWall.tsx`, `CtaBand.tsx`; modify `components/layout/Header.tsx`, `components/landing/Footer.tsx` to re-export; delete `components/landing/TrustedBy.tsx`.

- [ ] **Step 1: `primitives.tsx`** exports:

```tsx
export function Container({ className, children }: { className?: string; children: React.ReactNode })
// max-w-[1200px] mx-auto px-6 md:px-10
export function Eyebrow({ children, tone = "light" }: { children: React.ReactNode; tone?: "light" | "dark" })
// 11px uppercase tracking-[0.18em]; brand dot before text
export function SectionTitle({ eyebrow, title, lede, align = "left", tone = "light" })
// eyebrow + font-display 44/56px h2 + optional lede paragraph
export function StatRow({ stats, tone = "light" }: { stats: { value: string; label: string }[]; tone?: "light" | "dark" })
// grid, font-display 48px values, hairline top, small labels
export function Hairline({ className }: { className?: string })
```

- [ ] **Step 2: `SiteHeader`** — `({ tone = "light" })`. Port the auth-aware logic (user, profile, isLoading, signOut, dashboardHref) and mobile `Sheet` from the current `components/layout/Header.tsx`. Layout: `fixed inset-x-0 top-0 z-50`, inner `Container` with `h-16` flex. Dark tone: transparent background, white text, white pill CTA. Light tone: `bg-paper/80 backdrop-blur border-b border-stone`, ink text, ink pill CTA. Nav links: Product, Research, Contact.
- [ ] **Step 3: `SiteFooter`** — ink background, top area: large `font-display` line "Human intelligence, organised for AI." and four link columns from the current footer data, bottom bar with copyright and status pill.
- [ ] **Step 4: `LogoWall`** — `({ tone = "dark" })`. Uses existing `Marquee`; each logo inside a `h-20 w-44 rounded-xl border` tile (`border-white/10` dark, `border-stone bg-paper-2` light). Logo data copied from `TrustedBy.tsx`.
- [ ] **Step 5: `CtaBand`** — `({ title, lede, primary: { label, href }, secondary?: { label, href } })`. Ink background, `dot-grid`, `font-display` title 48/64px, two pill buttons.
- [ ] **Step 6: Re-exports** — `components/layout/Header.tsx` becomes `export { default } from "@/components/marketing/SiteHeader";` and `components/landing/Footer.tsx` becomes `export { default } from "@/components/marketing/SiteFooter";`. Delete `TrustedBy.tsx`.
- [ ] **Step 7: Verify** `grep -rn "TrustedBy" app components` returns nothing; tsc clean.
- [ ] **Step 8: Commit** `feat(marketing): add shared header, footer, primitives, logo wall and CTA band`

### Task 4: Product mocks

**Files:** Create `components/marketing/mocks/AriaMock.tsx`, `NexusMock.tsx`, `ForgeMock.tsx`

- [ ] **Step 1: `AriaMock`** — a `rounded-2xl border border-stone bg-paper-2 shadow-sm` window with a title bar (three dots, "Aria · Technical screen · 14:02"), three transcript bubbles (Aria question, candidate answer, Aria follow-up) and a right rail with live score chips (Reasoning 92, Depth 88, Communication 85). Tone prop for use on ink.
- [ ] **Step 2: `NexusMock`** — expert card: avatar initials tile, name and title, four tag chips, a fit score ring (SVG circle, 96) and a "Match rationale" line, plus a faded second card behind it.
- [ ] **Step 3: `ForgeMock`** — horizontal five-stage pipeline (Task spec → Expert pool → Generation → Expert QA → Delivery) with counts under each stage and a progress line; small legend row.
- [ ] **Step 4: Verify** each renders on a scratch route or directly in the home Platform section (Task 5).
- [ ] **Step 5: Commit** `feat(marketing): add Aria, Nexus and Forge product mocks`

### Task 5: Home page

**Files:** Modify `components/landing/HeroSection.tsx`, `app/page.tsx`; create `components/landing/Manifesto.tsx`, `Platform.tsx`, `DataEngine.tsx`, `Quote.tsx`; rewrite `components/landing/HowItWorks.tsx`; delete `WhatWeDo.tsx`, `Infrastructure.tsx`, `IntelligencePlatform.tsx`, `CTA.tsx`, `Features.tsx`.

- [ ] **Step 1: Hero** — keep everything; change `<Header />` to `<SiteHeader tone="dark" />`, headline classes to `font-display font-normal text-6xl md:text-[88px] leading-[1.02] tracking-[-0.02em]`, italic the word "Human". CTA button unchanged.
- [ ] **Step 2: `Manifesto`** — paper section: `Eyebrow` "What we do", one `font-display` statement at 40/56px max-w-4xl, then three columns (01 Source, 02 Vet, 03 Deploy) with hairline tops and 15px body copy taken from the current WhatWeDo copy.
- [ ] **Step 3: `Platform`** — paper section, `SectionTitle` "One platform, three engines". Three rows, each `grid lg:grid-cols-2 gap-16 items-center`, mock on alternating sides, copy column with badge, `font-display` name, description, three bullet features and a "Learn more" link to `/product#id`. Data from current `IntelligencePlatform.tsx` and `product/page.tsx`.
- [ ] **Step 4: `DataEngine`** — paper-2 card inside paper section: `SectionTitle` "The data engine behind frontier models", six capability rows in a 2×3 grid with hairlines (data from Infrastructure.tsx), then `StatRow` with the four stats.
- [ ] **Step 5: `HowItWorks`** rewrite — four steps across a single horizontal hairline with numbered circles, titles and copy from the current file; existing stat card moved into `StatRow`.
- [ ] **Step 6: `Quote`** — one `font-display` 32/44px quote with author line; use the first testimonial from `signin/page.tsx`.
- [ ] **Step 7: `app/page.tsx`** composes: `HeroSection`, `LogoWall tone="dark"`, `Manifesto`, `Platform`, `DataEngine`, `HowItWorks`, `Quote`, `CtaBand`, `SiteFooter`. Delete the five superseded files.
- [ ] **Step 8: Verify** — browser at desktop and `resize_window preset mobile`: no console errors, no CSP errors, hero unchanged, sections render. `preview_logs level=error` empty.
- [ ] **Step 9: Commit** `feat(home): rebuild home page below the hero on the brand system`

### Task 6: Product page

**Files:** Rewrite `app/product/page.tsx`

- [ ] **Step 1** — `SiteHeader tone="light"`, hero (`pt-40`) with `Eyebrow`, `font-display` h1 "Three products. One intelligence platform.", lede, three anchor chips.
- [ ] **Step 2** — per product section (`id`, `scroll-mt-24`): two-column, mock (Aria/Nexus/Forge) and copy with feature list on hairline rows, `StatRow`. Forge keeps capability grid.
- [ ] **Step 3** — `CtaBand` + `SiteFooter`. Verify desktop/mobile. Commit `feat(product): rebuild product page`.

### Task 7: Research page

**Files:** Rewrite `app/research/page.tsx`

- [ ] **Step 1** — hero, featured paper (first in array) as large paper-2 card with category, `font-display` title, abstract, date.
- [ ] **Step 2** — remaining papers as index rows: `grid grid-cols-[120px_1fr_120px]` with hairlines, hover shifts title colour to brand.
- [ ] **Step 3** — research areas three columns; `CtaBand` "Collaborate with our research team"; footer. Verify. Commit `feat(research): rebuild research page`.

### Task 8: Contact page

**Files:** Rewrite `app/contact/page.tsx` (keep state, `handleSubmit`, success branch)

- [ ] **Step 1** — two columns: left h1 + "What we can help with" hairline list + email/location; right form inside paper-2 card with existing fields, `Select` and submit.
- [ ] **Step 2** — success state: check icon, `font-display` "Thanks, we'll be in touch." Verify. Commit `feat(contact): rebuild contact page`.

### Task 9: Auth shell and auth pages

**Files:** Create `components/marketing/AuthShell.tsx`; modify `app/auth/signin/page.tsx`, `signup/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx`, `verify/page.tsx`

- [ ] **Step 1: `AuthShell`** — `({ title, subtitle, children, aside? })`. `min-h-screen grid lg:grid-cols-[5fr_7fr]`. Left pane (hidden below lg): ink, `dot-grid`, `Logo tone="light" withMark` top-left, `font-display` 40px quote centred, small line at the bottom "Trusted by frontier AI labs". Right pane: paper, back link, `LogoMark` for mobile, `font-display` title, subtitle, `children` (form).
- [ ] **Step 2: Sign-in** — remove `AnimatedTestimonials` and the Unsplash data; wrap the existing form in `AuthShell`. Inputs restyled: `h-12 rounded-xl border-stone bg-paper-2`. Error box uses `bg-red-50 border-red-200 text-red-700`. Keep the "Continue with Google (Coming soon)" disabled button.
- [ ] **Step 3: Sign-up** — same; role picker becomes two paper-2 cards with brand border when selected; remove testimonial marquee. Success screen ("Almost there!") also inside `AuthShell`.
- [ ] **Step 4: Forgot, reset, verify** — wrap each state in `AuthShell` with the relevant title. Keep every handler.
- [ ] **Step 5: Verify** each route renders at desktop/mobile; `curl` returns 200 for all five; sign-in with a wrong password still shows the error box. Commit `feat(auth): rebuild auth pages on AuthShell`.

### Task 10: Unauthorized and interview accept

**Files:** Modify `app/unauthorized/page.tsx`, `app/interview/accept/page.tsx`

- [ ] **Step 1: Unauthorized** — paper background, centred `LogoMark`, `font-display` "You don't have access to this page.", two buttons.
- [ ] **Step 2: Interview accept** — keep all logic; card becomes `rounded-2xl border border-white/10 bg-ink-2`, `LogoMark tone="light"` on top, `font-display` heading, brand button. Loading and error states share the card.
- [ ] **Step 3: Verify** both routes. Commit `feat: restyle unauthorized and interview accept pages`.

### Task 11: Final verification

- [ ] `npx tsc --noEmit 2>&1 | grep -v __tests__ | grep error` — nothing.
- [ ] `npm run lint` — no errors in touched files.
- [ ] `npx vitest run` — passes (or same failures as on `main`, listed).
- [ ] `curl` every public route logged-out → 200.
- [ ] Browser sweep of all ten routes at 1280 and 375 px, screenshots saved to scratchpad, no console errors.
- [ ] Final commit if anything changed; summary to user.
