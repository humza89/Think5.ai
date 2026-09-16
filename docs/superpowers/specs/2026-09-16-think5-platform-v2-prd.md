# Think5 Platform v2 — Product Requirements Document

Date: 2026-09-16 · Status: Draft for review · Owner: Humza Rafiq · Author: Claude (from a four-track codebase audit)

## 0. Why this document

Think5 already has an unusually deep AI-interview engine (server-authoritative turns, memory integrity, evidence bundles, SLO monitoring) and a broad recruiting surface. The audit also found that a meaningful share of that surface is stubbed, mis-wired or unreachable from the UI, that the runtime has single points of failure that cap it far below "thousands of concurrent interviews", and that the dashboard's design predates the new public brand.

This PRD does four things:

1. Inventories everything that exists today so **no current feature is lost** (§2 and Appendix A).
2. Lists the defects that must be fixed before anything new is built (§3).
3. Defines the product to build: dashboard redesign, premium Aria, feature parity with Paraform, Mercor and micro1, and the new modules those imply (§4–§6).
4. Specifies the target architecture and non-functional requirements for thousands of concurrent interviews (§7–§8), and a phased plan (§9).

Companion documents: `docs/superpowers/specs/2026-09-16-public-pages-redesign-design.md` (public site, done), `JPJ_AI_Recruiting_Platform_PRD.docx` and `JPJ_Engineering_PRD_v2.docx` (original intent; superseded where they conflict with this document).

---

## 1. Product framing

**Think5 is an AI-native recruiting company with a data-operations line of business.** Two customer groups, one platform:

| Customer | What they buy | Today's surface |
|---|---|---|
| Companies (startups, enterprises in IT, healthcare, finance, construction) | Aria-screened shortlists in 48h, placement, embedded recruiting | Recruiter/HM dashboard, interview reports |
| Candidates / experts | Interviews, jobs, AI-training work | Candidate portal, interview room |
| Frontier labs (Forge) | Expert human data, evals | Public page only; no product surface yet |

Competitor positioning we are matching or beating:

- **Paraform**: recruiter marketplace + custom AI sourcing agents + ATS/email/calendar integrations + success-fee billing + white-glove account management + customer stories and a "talent density" data product.
- **Mercor**: AI video interview at scale, a candidate marketplace with instant offers, weekly payouts, work trials, an expert talent network by domain, enterprise evals and agent deployment, public benchmarks (APEX), trust centre.
- **micro1**: Zara video-avatar AI interviewer, free public practice interviews by role (SEO engine), skills certification, expert opportunities board with pay bands, referral programme, Realm RL environments and Cortex evals with public benchmarks.

---

## 2. Current state (condensed from the audit)

Full inventory with file paths is in Appendix A. Status vocabulary: **Complete**, **Partial** (works with gaps), **Stub** (UI with simulated persistence), **Broken** (cannot complete its job today), **Dead** (built but unreferenced).

### 2.1 Recruiter / hiring-manager dashboard
- Complete: jobs CRUD with 6-step wizard and status transitions; per-job kanban (dnd-kit) with optimistic moves; interviews list with filters, compare (up to 4), templates with versions and governance; interview report viewer with share links, email gate and PDF; invitations table; team list + invite; analytics (recharts funnel, applications over time, score distribution); candidate profile with Overview / LinkedIn / Resume / Interviews / Notes; sourcing via LinkedIn URL or resume upload into passive profiles; clients & roles.
- Partial: global `/pipeline` (read-only, drag affordances but no DnD); `/candidates` list (rich filters, pagination is cosmetic); talent pools (JSON-blob backed, no detail page); `/search` (separate, thinner filter UI); mobile sidebar is a stale subset of desktop nav; hiring managers see a very thin slice.
- Stub: settings → notifications, security (password change, delete account), API keys; candidate list Save / Add-to-project / Hide; source page Invite.
- Broken: `/admin/hm-memberships` calls non-existent `/api/companies`; `/clients/[id]` pushes to non-existent `/clients/[id]/roles/new`; recruiter settings "Profile" links to the candidate profile; no `/interviews/[id]` page (only `/report`).
- Design: three different logo marks ("P", "T5", "Think5"), most pages use hard-coded greys that ignore the theme toggle, four admin pages are permanently dark zinc/violet inside the light shell, no `loading.tsx` / `error.tsx` anywhere, raw `<select>` mixed with shadcn `Select`.

### 2.2 Candidate portal
- Complete: dashboard, job board + detail + apply, applications, interviews list, candidate report view, skills, documents, notifications, profile, settings (except delete), 7-step onboarding + status page.
- Partial: messaging (see §2.4), policy page (calls an admin-only API).
- Stub: career tools (3 of 4 "coming soon"), practice page not linked from navigation.
- Broken: `/candidate/interview/results/[id]` is entirely hard-coded mock data; account deletion calls a method the API doesn't export.

### 2.3 Aria interview runtime
- Complete and genuinely differentiated: Gemini Live speech-to-speech through a Fly.io WebSocket relay (API key never reaches the browser); server-authoritative turn commit with 15 block reasons (duplicates, grounding, persona, contradiction, memory integrity); canonical transcript ledger with checksums and deterministic replay; reconnect state machine with context-hash verification; adaptive checkpoints + IndexedDB backup + `sendBeacon`; chunked recording with per-chunk SHA-256 to R2; consent capture and revocation; scoring with versioned model/prompt/rubric hashes, score normalisation, evidence bundle, memory-integrity scorecard, human review, PDF and share; SLO monitor, continuity gates, maintenance mode, concurrency limiter, AI-cost budget per company.
- What the candidate actually sees: a full-screen self-view with a 96px logo circle that glows when Aria speaks. **There is no avatar.** Transcript rail shows only Aria's lines. A second, older interview room (`components/interview/InterviewRoom.tsx`) with a decorative Monaco editor still exists under `/candidate/interview/[id]`.
- Broken (P0): the invite → accept → room path never passes the access token, so `voice-init` returns 400; proctoring events from the voice path are never persisted, so integrity scores are computed from zero events; candidate report lookup keys on a field the accept flow never sets.

### 2.4 Backend, data, infrastructure
- Strong: 55-model Prisma schema with soft-delete columns, legal hold, retention policies, DSAR flow, AEDT bias audit, governance policy, SSO config, webhook endpoints, ATS integration model; Inngest for report generation, deletion, SLO checks; Upstash Redis for session state, rate limits, concurrency; Sentry; Prometheus metrics; k6 load tests; 68 vitest files covering the interview engine; nightly soak + chaos in CI.
- Single points of failure: relay is one Fly region (`iad`) with two 512MB machines and a 400-connection soft cap; Redis is fail-closed for new interviews; one Postgres with a per-instance pool of 5; `MAX_CONCURRENT_INTERVIEWS` = 500.
- Broken or mis-wired: soft-delete middleware referenced in comments and a migration but absent from `lib/prisma.ts`; `updateAriaMemoryGraph` not registered with Inngest; `webhook/retry` has no consumer; recording-process jobs have no producer; `retention-purge` cron references a non-existent status and column and is unscheduled; `fragment-cleanup` cron has no auth; `retention` cron auth is skipped when the secret is unset; three admin routes have no role guard; `matching-engine` loads all candidates × all roles with one LLM call per pair and no concurrency cap; LinkedIn import defaults to a mock provider; the entire `lib/ats/` layer (Greenhouse, Lever, Ashby, Workday, AES key encryption, webhook verifiers) is unreferenced; `resumes` storage bucket is public.
- Global blocker: `proxy.ts` enforces a CSRF header on every non-GET API call and **no client code sends it**, so most browser-originated writes return 403. This alone explains many "stub-looking" behaviours.
- Messaging: both messaging pages and the single `/api/messages` route disagree on every field; threads always render empty and sends return 400.
- Absent entirely: 2FA, calendar/scheduling, billing/payments/contracts/timesheets, inbound ATS webhooks, real-time messaging, public job board, referral programme, work trials, expert payouts, trust centre.

---

## 3. Defect register (fix before feature work)

Priority: **P0** breaks a core flow or exposes data; **P1** degrades a shipped feature; **P2** hygiene.

| # | Pri | Defect | Where | Fix |
|---|---|---|---|---|
| D1 | P0 | CSRF header required, never sent | `proxy.ts`; no client wrapper | Add `lib/api-client.ts` (fetch wrapper that reads `csrf-token-client` and sets `x-csrf-token`); migrate every client `fetch` to it; add a lint rule banning raw `fetch` to `/api` in `app/` and `components/` |
| D2 | P0 | Invite→accept→voice room loses the access token | `app/interview/accept/page.tsx`, `app/interview/[id]/page.tsx`, `voice-init` | Make every interview API accept the `interview-session` cookie as an alternative to the raw token (one helper, `resolveInterviewCredential`) |
| D3 | P0 | Voice-path proctoring events never persisted | `hooks/useProctoring.ts` → only text route | Post events to `/api/interviews/[id]/proctoring` from the hook (batched every 10s + on end); persist on `end_interview` |
| D4 | P0 | Candidate results page is mock data; candidate report 404 for invited interviews | `app/candidate/interview/results/[id]`, `api/candidate/interviews/[id]/report` | Delete the mock page; route to the real report; look up by candidate ownership, not `invitedEmail` |
| D5 | P0 | Unauthenticated admin + cron routes | `compliance-report`, `continuity-scorecard`, `proctoring-events`, `cron/fragment-cleanup`, `cron/retention` | `requireRole(["admin"])` on the three; hard-require `CRON_SECRET` on all crons |
| D6 | P0 | Soft delete not enforced | `lib/prisma.ts` | Add the Prisma `$extends` query middleware the migration promises; test it |
| D7 | P0 | Public `resumes` and `photos` buckets; `public-read` ACL in asset store | `supabase/migrations/…storage_buckets.sql`, `lib/asset-store.ts` | Private buckets + signed URLs; remove ACL |
| D8 | P1 | Messaging client/API contract mismatch | `app/api/messages`, both messaging pages | Rebuild messaging (see F9) |
| D9 | P1 | Inngest wiring: memory-graph fn unregistered; webhook retry unconsumed; recording jobs unproduced | `app/api/inngest/route.ts`, `lib/webhook-delivery.ts` | Register, add consumer, wire producers or delete |
| D10 | P1 | `retention-purge` cron references non-existent `FAILED` status and `piiPurgedAt` | `app/api/cron/retention-purge` | Fix to real enum/column; schedule it; GET |
| D11 | P1 | Matching engine unbounded | `lib/matching-engine.ts` | pgvector similarity in SQL, top-N candidates, batched LLM rationale with a concurrency cap, run in Inngest |
| D12 | P1 | Relay `draining` frame ignored by client; worklet path lacks silence detection; model id mismatch; language/voice hard-coded | `hooks/useVoiceInterview.ts` | Handle drain → proactive reconnect; read worklet `rms`; single source of truth for model id; pass `interview.language` → `languageCode` and voice |
| D13 | P1 | Hard-coded settings stubs (notifications, security, API keys) | `app/(dashboard)/settings/*` | Real endpoints (F13) |
| D14 | P1 | SSO callback uses anon client for admin APIs and never consumes the magic link; SAML signature verification incomplete | `app/api/auth/sso/*`, `lib/sso/saml-provider.ts` | Use service-role client; finish with `verifyOtp`; adopt a maintained SAML library (`@node-saml/node-saml`) |
| D15 | P1 | Second, decorative interview room | `components/interview/InterviewRoom.tsx`, `app/candidate/interview/[id]` | Remove after the new room ships (see F1) |
| D16 | P2 | Three logo marks, hard-coded greys, no loading/error routes, stale mobile nav | dashboard shell | Covered by the design system (§5) |
| D17 | P2 | Dead code and scratch files at repo root; stale README | root, `README.md` | Delete; rewrite README from Appendix A |
| D18 | P2 | Vitest not run in CI | `.github/workflows/eval-gate.yml` | Add `npm test` and lint to the PR gate |

Fixing D1–D7 is the definition of "Phase 0 done" (§9).

---

## 4. Competitive gap analysis

Legend: ✅ have · ◐ partial · ✗ missing. "Target" is what v2 ships.

| Capability | Think5 today | Paraform | Mercor | micro1 | v2 target |
|---|---|---|---|---|---|
| AI voice interview, adaptive, proctored | ✅ (best-in-class engine) | ✗ | ✅ | ✅ | Keep; add avatar + premium room (F1) |
| Visual AI interviewer (avatar) | ✗ | ✗ | ◐ (audio + waveform) | ✅ (Zara video avatar) | ✅ photoreal, lip-synced, Aria-branded (F1) |
| Multi-language interviews | ◐ (prompt yes, voice hard-coded en-US) | ✗ | ✅ | ✅ 33+ | ✅ 20 languages with matching voices (F1) |
| Interview report with evidence, share, PDF | ✅ | ✗ | ◐ | ◐ | Keep; add HM scorecards (F5) |
| Public practice interviews by role (SEO) | ◐ (practice API, unlinked page) | ✗ | ✗ | ✅ 600+ roles | ✅ (F11) |
| Skills certification | ✗ | ✗ | ◐ assessments | ✅ | ✅ (F11) |
| Job board + apply | ✅ | ✗ | ✅ | ✅ | Keep; public board (F10) |
| Candidate marketplace with instant offers, pay bands | ✗ | ✗ | ✅ | ✅ | ◐ Phase 4 expert marketplace (F16) |
| Recruiter/HM pipeline kanban | ◐ (per-job only) | ✅ | ✅ | ✗ | ✅ global + per-job with DnD (F4) |
| Structured HM feedback / scorecards / collaboration | ✗ | ✅ | ✗ | ✗ | ✅ (F5) |
| Scheduling / calendar | ✗ | ✅ | ✅ | ✅ | ✅ Google + Microsoft (F6) |
| ATS integrations (Greenhouse, Lever, Ashby, Workday) | ◐ (libraries, unwired) | ✅ | ◐ | ✗ | ✅ wired, bidirectional (F7) |
| Email + Slack integration | ◐ (Resend outbound only) | ✅ | ◐ | ◐ | ✅ Slack/Teams notifications (F7) |
| Sourcing agents / AI search | ◐ (mock LinkedIn provider) | ✅ custom agents | ◐ | ✗ | ✅ real providers + saved searches + agent (F8) |
| Real-time messaging | ✗ (broken) | ✅ | ✅ | ✅ | ✅ (F9) |
| Billing, placement fees, invoices | ✗ | ✅ success fee | ✅ payouts | ✅ payouts | ✅ Stripe: retainers, success fees, invoices (F12) |
| Expert payouts, timesheets, work trials | ✗ | ✗ | ✅ | ✅ | ◐ Phase 4 with Forge ops (F16) |
| Referral programme | ✗ | ✗ | ✅ | ✅ | ✅ (F11) |
| Client portal for hiring managers | ◐ thin | ✅ | ◐ | ✗ | ✅ (F5) |
| Trust centre, SOC 2 | ◐ controls exist, no page | ✅ | ✅ | ◐ | ✅ trust page + SOC 2 programme (F14) |
| SSO / 2FA | ◐ SSO broken, no 2FA | ✅ | ✅ | ◐ | ✅ (F13) |
| Public benchmarks / research data product | ◐ research page | ✅ Talent Density Index | ✅ APEX | ✅ Realm | ✅ Aria Hiring Index (F15) |
| Forge data-ops workbench (tasks, raters, QA, payouts) | ✗ (public page only) | ✗ | ✅ | ✅ | ◐ Phase 4 (F16) |
| Mobile | ◐ responsive, partial | ✅ | ✅ app | ✅ | ✅ responsive everywhere + candidate PWA (F10) |
| Reliability at thousands of concurrent interviews | ✗ (single-region relay, 500 cap) | n/a | ✅ | ✅ | ✅ (§7) |

---

## 5. Design system for the dashboard (matching the public site)

Goal: the recruiter, hiring-manager, candidate and admin apps use the same brand system as the public pages, and the "consoles" designed for marketing (`HeroConsole`, `NexusMock`, `ForgeMock`, the Aria video-call room) become the real product surfaces.

### 5.1 Tokens and type
- Adopt the public palette everywhere: `paper` canvases, `paper-2` cards, `stone` hairlines, `ink` text and primary actions, `graphite` secondary text, `brand` blue as the single accent. Map the shadcn semantic variables (`--background`, `--card`, `--border`, `--primary`, …) onto these tokens so every existing shadcn component re-skins without edits.
- Dark mode is a first-class token set (ink canvas, `ink-2` cards, `white/10` hairlines), not per-page `dark:` classes. Ban hard-coded `gray-*`, `zinc-*`, `bg-white` in app code via a lint rule.
- Type: Instrument Serif for page titles, section titles and large numbers (as in the consoles); Inter for everything else. Eyebrows uppercase 11px tracked. Tabular numerals in tables.
- Density: the dashboard uses a 4px grid with 12/14/16px UI type; tables at 40px rows; cards with 20–28px radius on canvases and 12px inside tables.

### 5.2 Shell
- One `AppShell` for recruiter, HM, candidate and admin, parameterised by nav config: left rail (icon + label, collapsible, 240/64px), top bar with breadcrumbs, global search (⌘K), notifications, account menu. Logo: the `t.` mark plus wordmark (retire "P" and "T5").
- Route conventions: `loading.tsx`, `error.tsx`, `not-found.tsx` in every route group; skeletons from one shared set (`components/skeletons/`), which already exist and are unused.
- Command palette (⌘K) with navigation, candidate/job search and quick actions.

### 5.3 Signature screens (the consoles, made real)
- **Command centre** (`/dashboard`): the hero console as the real home: live pipeline counters per stage across active roles, ranked shortlist with Aria score + Nexus fit, "Aria is interviewing" tile with live count, activity feed (from `ActivityLog`), deadlines, action-required list. Scoped to the recruiter's company, not global counts.
- **Role workspace** (`/jobs/[id]`): tabs Overview · Pipeline (kanban) · Shortlist (the Nexus ranked table with fit breakdown drawer) · Interviews · Scorecards · Activity.
- **Interview review** (`/interviews/[id]`): a real page: video with synced transcript and question markers, evidence highlights, scores, integrity, HM scorecard side panel, compare and share actions. (The report viewer already has most content; this is the layout and player.)
- **Candidate home**: same card language; "Your next interview" tile with Aria portrait, application statuses, practice CTA.
- **Admin**: same shell with a red accent rail label, no separate dark theme.

### 5.4 Components to add to `components/ui`
Data table (TanStack Table with column visibility, saved views, bulk actions), stat tile, score ring, fit bar, timeline, kanban primitives, filter bar with chips, drawer for detail views, empty states with illustration, toast conventions. All built once, used by every module.

### 5.5 Accessibility and quality bar
WCAG 2.2 AA: focus rings (brand), 4.5:1 contrast on paper, full keyboard operation of kanban and tables, reduced-motion respected, live regions for interview state (already present in the room). Visual regression tests per screen (Playwright screenshots) at 1280 and 375.

---

## 6. Feature requirements

Each feature lists user stories, acceptance criteria and dependencies. IDs are referenced by the plan in §9.

### F1. Aria Premium: avatar and the interview room
**Goal:** the candidate sees and hears a lifelike Aria, and the room feels like a calm, premium video call; better than micro1's Zara and Mercor's audio-only interviewer.

- **Avatar.** Aria is rendered as a photoreal, lip-synced video avatar of the existing Aria portrait (`public/uploads/Emma.png`), driven by the Gemini Live audio stream. Architecture: the browser already receives Aria's PCM audio; an avatar renderer converts audio to video in real time. Provider evaluation (spike, 2 weeks): Simli (audio-in WebRTC, custom face from a photo, ~200ms), HeyGen LiveAvatar / Interactive Avatar, Tavus CVI, Beyond Presence, D-ID. Selection criteria: audio-driven (we keep Gemini as the brain), custom likeness from our portrait, latency under 300ms added, concurrency pricing at 5,000 sessions, WebRTC delivery, EU data residency option. Implement behind an `AvatarProvider` interface with a **degraded mode** that falls back to the current "presence" indicator automatically, so an avatar outage never blocks an interview.
- **Room layout** (from the approved AriaMock): Aria full-frame in the warm studio, candidate PiP bottom-left, live captions of Aria's current sentence, timer and question progress, Recording pill, control bar (mic, camera, captions, pause, text mode, end). Candidate's own transcript visible in the rail (today only Aria's lines are shown). Device check in the same visual language. Accommodations collected on the welcome screen are actually applied (extended time, text-only, captions on, screen-reader mode).
- **Conversation quality.** Barge-in already works via Gemini VAD; add visible "Aria is listening" and thinking states on the avatar; add a per-question "take a moment" affordance; multi-language: 20 languages with matched voices, `interview.language` → `languageCode` and voice selection.
- **Technical interviews.** Optional shared code editor (Monaco) and whiteboard that are actually submitted with the transcript and referenced by Aria (tool-call `openCodeTask`), replacing the decorative editor in the old room.
- **Reliability UX.** Handle `relay.draining` with a proactive, invisible reconnect; show the connection state in one place; never lose the transcript (existing checkpoint + IndexedDB design stays).
- **Acceptance:** avatar latency ≤300ms over audio; degraded mode engages within 2s of provider failure without ending the session; 100% of consented interviews persist proctoring events (D3); e2e Playwright flow invite → accept → room → end → report on both voice and text paths passes in CI.

### F2. Aria configuration for recruiters
Template builder in the new design: role-specific rubrics per industry (IT, healthcare, finance, construction, startups), question banks, difficulty, persona, proctoring level, language, duration, retake policy, candidate-report policy. Preview a template by taking a 3-minute Aria demo. Versioning and governance stay as built.

### F3. Candidate pipeline and CRM
Global pipeline with real drag-and-drop across roles (dnd-kit already used per job), stage automation (interview complete → Interview Complete), reject with reason and optional email, bulk actions, tags, saved views, activity and email tabs on the candidate profile made real (they are placeholders today), talent pools as a real model with membership and detail pages, duplicate detection on import.

### F4. Role workspace and shortlist
Nexus ranked shortlist per role: fit score with the weighted breakdown and evidence (skills verified by Aria, experience, comp, availability), compare, promote to shortlist, send to hiring manager. Matching moves to pgvector top-N plus batched rationale (D11). Job creation gets AI description enhancement and skill suggestions (the original PRD's spec).

### F5. Hiring-manager portal and scorecards
HM role gets a real workspace: roles they own, shortlists, interview review with structured scorecards (per-competency rating, decision, comments, @mentions), side-by-side compare, approvals. Comments are threaded on candidates and interviews; notifications and Slack. HM access continues to be gated by `HiringManagerMembership`.

### F6. Scheduling
Google Calendar and Microsoft 365 OAuth; recruiter availability; candidate self-scheduling links for human rounds; Aria interviews stay instant/async; reminders; time-zone handling; ICS fallback.

### F7. Integrations
Wire the existing `lib/ats/` layer: OAuth/API-key setup UI per company, job sync (ATS → Think5), candidate and interview-report push (Think5 → ATS), inbound webhooks under `/api/integrations/[provider]` with signature verification (verifiers already exist), sync logs. Slack and Teams notifications. Public REST API with real API keys (replacing the mocked keys page) and outbound webhooks (already built).

### F8. Sourcing
Real enrichment providers behind the existing importer interface (default is mock today), bulk CSV/LinkedIn import, saved searches with alerts, a sourcing agent that proposes candidates for a role brief and explains why (Paraform's "custom AI agents" answer), invitation flow from the source page (currently a stub).

### F9. Messaging
Rebuild on Supabase Realtime or Pusher: conversations per candidate/role, read receipts, attachments (schema already has columns), templates, email fallback, unified inbox for recruiters, in-app for candidates. Replaces the broken `/api/messages` contract.

### F10. Candidate experience
Public job board (`/jobs`) with SEO pages per role and industry; application without account then claim; candidate PWA (installable, push notifications); career tools made real: interview prep (practice), skill-gap analysis from Aria reports, resume feedback.

### F11. Public practice interviews, certification, referrals
Free practice interviews by role at `/practice/[role]` (600+ role pages generated from a role taxonomy, the micro1 SEO engine), rate-limited and text-or-voice; skills certification badges issued from Aria assessments and shown on profiles; referral programme with tracked links and rewards.

### F12. Billing and commercial operations
Stripe: startup retainer subscriptions, success-fee invoices on placement, enterprise contracts, expert payouts (Phase 4), invoices and receipts in the dashboard, usage-based AI cost pass-through where contracted. Admin revenue reporting.

### F13. Account security and settings
2FA (TOTP + recovery codes) for recruiter/HM/admin, session list and revocation, working password change and account deletion, notification preferences persisted, fixed SSO (OIDC + SAML via a maintained library), SCIM later. API keys real.

### F14. Trust, compliance, admin
Trust centre page (SOC 2 roadmap, sub-processors, DPA), candidate-facing data policy that works, GDPR export/erasure with UI (APIs exist), retention and legal hold UI (exists), audit log for admin role/status changes written to `ActivityLog`, AEDT bias audit surfaced quarterly.

### F15. Aria Hiring Index (data product)
Anonymised, aggregated benchmark from interview outcomes by role and industry, published like Paraform's Talent Density Index and Mercor's APEX: time-to-shortlist, score distributions, skill demand. Feeds the research page.

### F16. Forge operations (Phase 4)
Expert marketplace and data-ops workbench: opportunities board with pay bands, expert onboarding via Aria certification, task queues, rater workbench, layered QA and agreement metrics, batch delivery, timesheets and weekly payouts. This is the product behind the `/ai-training` page and the `ForgeMock` console.

---

## 7. Target architecture

### 7.1 Principles
1. **Strangler, not rewrite.** New shells wrap existing API routes; no schema removals; migrations are additive; every existing route keeps working until its replacement has parity and tests.
2. **Providers behind interfaces.** Voice (Gemini Live today), avatar, scoring LLM, enrichment, ATS, calendar, email, payments each sit behind a typed interface (`lib/ai-providers/interface.ts` is the pattern) with a mock implementation for tests and a degraded mode in production.
3. **Server-authoritative, client-thin.** Keep the interview engine's existing contract (thin client, turn-commit, ledger). Everything new follows it.
4. **Fail open for reads, fail closed for integrity.** Redis loss must not block new interviews (today it does); turn integrity gates stay fail-closed.
5. **Tenant isolation is a database property**, not a per-handler habit: Postgres RLS on tenant-scoped tables with the tenant id set per request, in addition to the existing application checks.

### 7.2 Runtime topology

```
Browser ──HTTPS──▶ Vercel (Next 16 app + API routes, 4 regions)
   │                       │
   │ WebRTC/WS             ├──▶ Postgres (Supabase) + PgBouncer  ──▶ read replica(s)
   │                       ├──▶ Redis (Upstash global, or Redis Cloud multi-AZ)
   │                       ├──▶ Inngest (jobs: reports, matching, sync, deletion, retries)
   │                       ├──▶ Object storage (R2) for recordings, resumes, exports
   │                       └──▶ Sentry, OpenTelemetry → Grafana/Datadog, Prometheus
   ▼
Realtime plane (Fly.io, regions iad · lhr · sin · nrt · syd)
   voice-relay (WS)  ──▶ Gemini Live
   avatar-gateway    ──▶ Avatar provider (WebRTC)
   session affinity via Redis: interviewId → relay instance/region
```

### 7.3 Realtime plane for thousands of concurrent interviews
- **Capacity model.** One interview ≈ 1 relay WebSocket + 1 Gemini session + 1 avatar WebRTC session + ~40 KB/s upstream audio + recording upload at 1.5 Mbps to R2 (direct from browser via presigned multipart, not through the API). Relay machines handle 400 soft / 1,000 hard connections at 512 MB today; a `performance-2x` machine handles ~2,000. Target: **5,000 concurrent interviews** = 6–8 relay machines per active region with headroom, autoscaled on connection count.
- **Multi-region with affinity.** Provision `lhr`, `sin`, `nrt`, `syd` in addition to `iad` (the runbook exists in `docs/ops/multi-region-relay.md`). Sticky reconnect: on `voice-init`, record `{interviewId → region, instanceId}` in Redis; the client reconnects to the same instance through Fly's `fly-replay`/instance header; if the instance is gone, `recover` rebuilds from the ledger (already implemented) on a new instance.
- **Graceful deploys.** The relay already drains on SIGTERM; the client must honour `relay.draining` (D12) so deploys are invisible. Rolling deploys with `min_machines_running` ≥ 2 per region.
- **Admission control.** Replace the flat 500 cap with per-region and per-tenant budgets, a queue with an ETA ("Aria will be with you in ~40s") instead of a hard 503, and load shedding that degrades avatar first, then video recording quality, never the audio session.
- **Provider resilience.** Gemini Live regional endpoints where available; circuit breaker per region; text-mode fallback (exists) as the last resort. Avatar provider is optional by design.

### 7.4 Data plane
- Postgres: enable PgBouncer transaction pooling for serverless (exists) and raise per-instance pool sizing by function class; add a read replica for analytics/report reads; partition `InterviewTranscript`, `InterviewEvent`, `TurnFragment`, `ProctoringEvent`, `ActivityLog` by month; archive completed interviews' event tables to R2 after retention.
- Prisma soft-delete extension (D6); RLS policies on tenant tables; `deletedAt` filters in all list queries.
- Redis: session state, affinity, rate limits, concurrency, pub/sub for notifications and messaging presence. Make reads fail-open with in-memory fallback; only the durable session store stays fail-closed, with a health-gated "voice degraded" banner rather than a hard block.
- Object storage: browser-direct presigned uploads for recordings and resumes; lifecycle rules implement retention.

### 7.5 Compute plane
- Inngest functions with explicit concurrency keys: report generation (per tenant, max N in flight), matching (per role), ATS sync (per integration), avatar warm-up, email digests. Long-running or memory-heavy routes (PDF, CSV export, resume parsing, data export) move to Inngest with a job status endpoint, freeing Vercel function limits.
- SSE endpoints (report stream, notifications) migrate to Redis pub/sub-backed streams or Supabase Realtime, removing DB polling loops.

### 7.6 Security and multi-tenancy
CSRF wrapper (D1); private buckets (D7); cron and admin guards (D5); RLS; secrets in Vercel/Fly secret stores with rotation; SSO fixed (D14); 2FA (F13); rate limits also on GET for expensive endpoints; audit every admin mutation; PII field encryption for `SSOConfig.clientSecret` and candidate contact fields using the existing AES-GCM helper.

### 7.7 Observability and operations
OpenTelemetry traces across Vercel → relay → provider; per-interview trace id; the existing SLOs (interview start ≥99.9%, turn-commit p99 <500ms, report <120s, reconnect ≥99.9%) plus avatar latency and admission-queue wait; dashboards per region; alerting to Slack/PagerDuty; synthetic interview every 5 minutes per region (the eval harness can drive it in mock mode); chaos tests promoted from nightly-optional to weekly-required.

### 7.8 Module boundaries (so upgrades stay local)
`recruiting` (jobs, pipeline, candidates, clients) · `interview-runtime` (room, relay, session brain, ledger) · `scoring` (report, rubrics, governance) · `matching` · `integrations` (ATS, calendar, messaging providers) · `billing` · `identity` (auth, SSO, 2FA, tenancy) · `admin` · `forge` (Phase 4). Each has its own API namespace, Inngest functions, tests and an owner. Cross-module calls go through typed service functions in `lib/<module>/index.ts`, never through another module's Prisma models directly.

---

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| Concurrency | 5,000 concurrent AI interviews globally; 50,000 daily active users across portals; 2,000 concurrent recruiters |
| Latency | Interview start p95 ≤ 3s; turn-commit p99 < 500ms (existing SLO); avatar audio-to-video ≤ 300ms; dashboard TTI ≤ 2s p75 |
| Availability | 99.9% monthly for interview start and dashboard; no single-region dependency for voice |
| Durability | No transcript loss on disconnect, deploy or provider failure (existing ledger + checkpoint guarantees, now tested cross-region) |
| Recovery | RTO 1h, RPO 5min (as documented), verified quarterly |
| Security | SOC 2 Type II programme; CSRF, RLS, private storage, 2FA, SSO, audit trail; annual pen test |
| Privacy | GDPR export/erasure with UI; NYC AEDT bias audit; per-tenant retention; consent enforced on every media path |
| Accessibility | WCAG 2.2 AA across dashboard and interview room |
| Cost | AI cost per interview tracked and budgeted per tenant (exists); avatar cost per minute reported |
| Quality gates | `tsc`, lint, vitest, Playwright e2e for the six critical flows, eval harness, visual regression, k6 load test at 1,000 VUs on every release |

---

## 9. Phased plan

Estimates assume a small team (2–3 engineers + design). Each phase ends with a demo and the feature-preservation checklist (Appendix B) green.

| Phase | Weeks | Scope | Exit criteria |
|---|---|---|---|
| **0 · Stabilise** | 1–3 | D1–D7, D9, D10, D18; Playwright e2e for invite→interview→report, signup/onboarding, job→pipeline, messaging smoke, share link, admin approval; README rewrite | All P0 closed; e2e green in CI; k6 baseline recorded |
| **1 · Design system + shells** | 3–8 | §5: tokens, AppShell, data table, skeletons, command centre, role workspace, interview review page, candidate home; retire duplicate logos and per-page greys; dark mode | Every existing page renders in the new shell with parity; visual regression suite |
| **2 · Aria Premium** | 6–12 | F1 avatar spike + provider choice (weeks 6–7), room rebuild, captions, languages, accommodations, code task, drain handling, proctoring persistence; F2 template builder | Avatar in production behind a flag with degraded mode; e2e on voice and text; SLO dashboards include avatar |
| **3 · Recruiting parity** | 10–20 | F3, F4, F5, F6, F7 (Greenhouse + Lever first), F8, F9, F13 | Hiring managers can run a search end-to-end without email; ATS round-trip tested with sandbox accounts |
| **4 · Scale** | parallel from week 8, done by 22 | §7.3–7.7: multi-region relay with affinity, admission queue, browser-direct uploads, partitioning, RLS, OTel, weekly chaos | 5,000 concurrent synthetic interviews sustained for 60 minutes across three regions with SLOs met |
| **5 · Growth + commercial** | 20–28 | F10, F11, F12, F14, F15 | Public practice pages indexed; first Stripe invoice issued from the platform; trust centre live |
| **6 · Forge ops** | 28+ | F16 | Expert onboarding → task → QA → payout end-to-end |

Ordering rationale: nothing new is stable until D1 (CSRF) and D2 (token) are fixed; the design system must exist before pages are rebuilt or we rebuild twice; the avatar is the most visible differentiator and depends only on the room; scale work runs in parallel because it is mostly infrastructure.

---

## 10. Metrics

Product: time-to-shortlist (target 48h → 24h), interview completion rate (>85%), candidate satisfaction after Aria (CSAT ≥ 4.5), HM scorecard completion within 24h (>80%), placements per recruiter per month, retainer churn.
Platform: SLOs in §7.7, avatar degraded-mode rate (<1%), P0 defect count (0), e2e pass rate (100% on main).
Commercial: retainer MRR, success-fee revenue, Forge batch revenue, AI cost per interview.

---

## 11. Decisions needed from Humza

1. **Avatar provider budget and data residency.** Provider pricing is per streaming minute; at 5,000 concurrent sessions this is the largest new cost line. Confirm the budget envelope and whether EU residency is required for healthcare/finance clients.
2. **Recruiter marketplace.** Paraform's model (external recruiters submit candidates for a fee split) is a business-model choice, not a feature. Do we want it in v2 or stay an in-house firm?
3. **Candidate marketplace with instant offers** (Mercor-style) versus invitation-led hiring. This changes the public job board and onboarding.
4. **Billing model**: retainer + success fee (as the recruitment page promises), and whether Forge experts are paid through the platform in Phase 4.
5. **Voice provider strategy**: stay Gemini-only (current) or add a second speech-to-speech provider for resilience.
6. **Hiring-manager seats**: free with each client, or a paid seat.

---

## Appendix A — Feature preservation inventory

Everything below exists today and must still work after v2, either unchanged or with a tested replacement. Status per audit.

**Recruiter dashboard** (`app/(dashboard)/…`): dashboard home; jobs list/new/detail/edit + wizard + status transitions + per-job kanban + matches + interviews tabs; global pipeline; candidates list with faceted filters + shadow profiles tab + add candidate (LinkedIn/resume); candidate detail (overview, linkedin, resume, interviews, notes, activity, emails, delete); interviews list/filters/compare/report/templates (list, new, edit, versions)/invitations; invitations table (resend, revoke); clients list + import + detail + roles; search; source (LinkedIn, resume → passive profile → edit); passive profiles; talent pools; messaging; team + invite; analytics (7/30/90); settings hub, notifications, security, API keys; admin pages (hm-memberships, interview-analytics, interview-templates governance, shared-reports, proctoring-events, reliability); recruiter onboarding wizard + status.

**Candidate portal** (`app/candidate/…`): dashboard, jobs + detail + apply, applications, interviews + report, practice, skills, documents, career tools, messaging, notifications, profile, settings, policy, onboarding (7 steps) + status.

**Interview runtime**: invite email, accept page, room (`/interview/[id]`) with readiness, consent, welcome, voice room, text room, pause, reconnect, text fallback, complete screen; report generation, viewer, PDF, share + email gate + revoke, review, verify, evidence bundle, continuity report, replay, timeline, memory status; practice interviews; consent revocation.

**Admin** (`app/admin/…`): overview, users, audit log, model governance, approvals (candidate + recruiter, bulk), operations, dev candidates.

**Auth**: register (+ invited), verify, forgot/reset, profile, SSO (to be fixed), account status and onboarding gates.

**APIs**: all 143 route files listed in the backend audit remain, with deprecated ones (`/api/invitations*`, `/api/v1/interviews/{feedback,invite}`) sunset on their stated dates only after replacements ship.

**Data**: all 55 Prisma models; no destructive migrations; soft delete becomes enforced (a behaviour change, tested).

**Jobs and crons**: report generation, deletion execution, retention cleanup, SLO check, anomaly alert, report retry, fragment cleanup (secured), retention purge (fixed and scheduled).

**Infra and quality**: relay (extended to multi-region), Redis session store, rate limits, concurrency limiter, maintenance mode, feature flags, Sentry, metrics, SLO monitors, eval harness, nightly soak and chaos, k6 load tests, 68 vitest files.

## Appendix B — Feature-preservation checklist (run at every phase exit)

1. `npx tsc --noEmit`, `npm run lint`, `npx vitest run` all green in CI.
2. Playwright e2e: (a) signup → onboarding → approval; (b) recruiter creates job → invites candidate → candidate accepts → voice interview (mocked provider) → report visible to recruiter, HM and candidate; (c) kanban move persists; (d) share link with email gate; (e) messaging send/receive; (f) admin approves recruiter. All green.
3. Route sweep: every path in Appendix A returns 200 for the right role and 403/redirect for the wrong one (scripted `curl` matrix, run in CI).
4. Schema diff review: no dropped tables or columns; new migrations reversible.
5. k6: 1,000 VUs standard scenario within thresholds; no 5xx.
6. Visual regression: no unapproved diffs at 1280 and 375.
7. Eval harness: `overallPassed` true.

## Appendix C — Audit sources

Four audit reports were produced on 2026-09-16 covering (1) the recruiter dashboard, (2) the interview runtime and candidate portal, (3) backend, data model and infrastructure, and (4) admin, auth, compliance and messaging. Their file-level findings are summarised in §2–§3; the defect register cites the exact files.
