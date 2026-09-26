# Phase 0 exit gate (T14)

Status as of 2026-09-26 (exit closeout). Phase 0 is defined by the plan
(`docs/superpowers/plans/2026-09-16-phase-0-stabilise.md`) as T0–T16 merged,
this gate's checks green, and a clean 7-day production observation window with
every `FF_P0_*` flag on. This document is the record; it is updated as the
remaining gates close.

## 1. Merged Phase 0 work (squash merges to `main`)

| Task | PR | Merge SHA | Scope |
| --- | --- | --- | --- |
| T0 preservation manifest, route matrix, CI gates, visual baselines | #12 (after #16–#19) | cf47fca | manifest generator, golden E2E on a real local Supabase stack, 24 chromium-linux baselines |
| T0.5 architecture contracts + conformance | #21 | 654046a | `lib/contracts/*`, conformance runners, plane-boundary lint |
| Legacy PR audit (#1–#11) | #22 | 084ad73 | `docs/phase0/legacy-pr-audit.md` |
| T1 one CSRF strategy, one API client | #23 | 3d9d633 | `lib/api-client.ts`, 173 call sites, lint guard, proxy rate-limit order |
| T2 canonical interview credential | #24 | 0390295 | `lib/interview-credential.ts`, 15 routes, `session/refresh`, `FF_P0_COOKIE_INTERVIEW_AUTH` |
| T4 candidate results ownership + single room | #25 | 5399247 | `FF_P0_SINGLE_INTERVIEW_ROOM` |
| T6 soft delete | #26 | ff243df | `lib/soft-delete.ts` extension, `prismaRaw` |
| T3 proctoring persistence + accommodations | #27 | 895eb8b | integrity outbox, batch route, idempotent persistence |
| T5 security guards + private storage | #28 | 3b9f652 | cron auth, admin guards, private resumes with signed URLs, retention purge |
| T7 Inngest wiring | #29 | 8e9b76d | 9/9 registered, durable webhook retry, recording producer |
| T8 messaging contract | #30 | c04f41a | `lib/messaging/*`, `Conversation`, canonical routes, legacy adapter |
| T16 usage metering foundation | #31 | 183aea9 | `UsageEvent`/`UsageAggregate`/`TenantQuota`, `PrismaUsageMeter`, `QuotaEntitlementService`, admin usage |
| T11 relay + Redis safe-to-fail | #33 | 5a4a527 | `FF_P0_REDIS_SAFE_TO_FAIL`, durability downgrade, drain/reconnect, provider timeouts, health, `InterviewLease`, chaos tests |
| T12 correlation ids + OpenTelemetry | #32 | 2fd3727 | `x-request-id`, `lib/otel.ts`, `@vercel/otel` behind OTLP env, Support ID, Grafana dashboards |
| T9 SSO sessions, native MFA, security settings | #34 | fa77f21 | admin-client SSO completion, node-saml, TOTP MFA routes + gate, `FF_P0_MFA_ENFORCEMENT` (default off), real security settings |
| T15 Greenhouse two-way proof | #35 | c43fc72 | `GreenhouseAdapter`, sync engine, `ATSSyncRun`/`ATSEntityLink`, integrations UI, nightly sandbox workflow |
| T13 repository hygiene | #37 | 0bf8050 | scratch files, `docs/legacy`, relay `node_modules` untracked, relay OTel SDK, README, quiet prompt logging |
| T10 no dead-end controls | #36 | 414fedf | all 16 rows of the stub table, `ApiKey` + `/api/v1/me`, single nav config, `LogoMark` |
| T14 golden path + this exit record | #38 | 7f21e9e | mock interviewer/scorer, Inngest dev server in CI, `writes-invite-to-report.spec.ts`, Inngest pipeline defects fixed |
| Exit closeout: legacy salvage (security) — #4/#6/#8 items | #39 | 2ae4aef | `buildInterviewAccessScope` + 8 scoped routes, `RecordingMergeFailedError` and no first-chunk playback, `REPORT_STATE_SAFE_FOR_RETENTION`, HMAC share cookie + shared-report rate limits, broken-COMPLETED detector (hourly Inngest cron) |
| Exit closeout: legacy salvage (relay) — #1/#11 items | #40 | 69452fc | `relay.flow` backpressure frames + client throttle, provider circuit breaker + `relay.degraded`, breaker on `/health` |
| Issue #20 mobile `/candidates` | #41 | 5a094d4 | stacked sourcing rows below `md`, `mobile-layout.spec.ts`, CI-adopted 375 baseline |
| Issue #14 nonce CSP | #42 | 09830d2 | `lib/csp.ts`, per-request `script-src 'nonce-…' 'strict-dynamic'` on app routes, static policy kept on public pages (`force-static`), `csp-nonce.spec.ts`, `docs/ops/csp.md` |

Pre-T0 fixes that unblocked the authenticated baselines: #16 (CSP `unsafe-inline` restoration with hard-navigation regression tests), #17 (invitation token kept after `replaceState`), #18 (CSRF client), #19 (segment-aware route prefixes; Issue #15 closed).

## 2. Gate checklist

| # | Gate (plan T14) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `npm run manifest:check` clean; manifest diff since baseline reviewed | **Green** | CI "Verify committed manifest baseline" on every PR; every change reviewed in its PR body. Removed items since the T0 baseline: none. Additions: routes/models/flags/contracts listed per task. |
| 2 | Golden E2E suite green | **Green in CI on every PR**; scope differs from the plan's spec names, see §3 | `e2e/golden/*`: route matrix (71 routes), visual (24 baselines), `writes-*` per task, `writes-invite-to-report` (#38), `csp-nonce` (#42), `mobile-layout` (#41) |
| 3 | Route matrix green against staging | **Open — external** | Runs against the local stack in CI (`route-access.spec.ts`, 71 routes). Against staging: `npm run route:matrix` with `BASE_URL=<staging>` once staging exists. |
| 4 | `npx vitest run` green; eval harness `overallPassed` | **Green** | 117 files / 1044 tests on the #42 head; `EVAL_MOCK_MODE=true npm run test:eval` → `Overall: PASSED`; CI "Eval Harness (Mock Mode)" job |
| 5 | k6 `load-tests/concurrent-interviews.js` on staging within thresholds | **Open — external** | Script present; needs staging URL and a mocked provider there (`AI_PROVIDER=mock` is now supported). Baseline number to be recorded here. |
| 6 | Rollback exercised (T8 messaging legacy route; `FF_P0_USAGE_METERING` off) | **Partly green** | Legacy `/api/messages` adapter is exercised in `writes-messaging.spec.ts` on every run. `FF_P0_USAGE_METERING=false` path covered by unit tests (`__tests__/usage`), not yet flipped in staging. |
| 7 | Relay chaos in staging (`fly machine stop`) + `docs/ops/regional-failure.md` reviewed | **Open — external** | Automated chaos tests green (`__tests__/chaos/relay-drain.test.ts`, `redis-loss.test.ts`); the live drill needs a staging Fly app. |
| 8 | Greenhouse sandbox nightly green ×5 | **Open — external** | `.github/workflows/ats-sandbox-nightly.yml` skips until `GREENHOUSE_SANDBOX_API_KEY` / `_ON_BEHALF_OF` exist. Fixture-level conformance green. |
| 9 | Contract conformance green for every production implementation | **Green** | `InAppMessageProvider`, `PrismaUsageMeter`, `QuotaEntitlementService`, `PrismaRedisInterviewSessionStore`, `OtelTelemetry`, `GreenhouseAdapter` each run through `lib/contracts/conformance/*` in `npx vitest run` |
| 10 | Grafana dashboards populated from staging traffic | **Open — external** | Dashboards committed (`docs/ops/grafana/*.json`); export is off until `OTEL_EXPORTER_OTLP_*` are set (`docs/ops/observability.md`). |
| 11 | 7-day production observation with all `FF_P0_*` on | **Not started** | See §5. Note `FF_P0_MFA_ENFORCEMENT` requires every admin/tenant admin enrolled first (`docs/ops/identity.md`). |
| 12 | Owner sign-off (Humza) | **Pending** | Everything not marked external or owner-gated above is closed as of 2026-09-26; see §8. |

## 3. Golden E2E coverage versus the plan's list

The plan names `auth.spec`, `invite-to-report.spec`, `pipeline.spec`,
`share-link.spec`, `messaging.spec`, `admin-approval.spec`, `writes.spec`,
`visual.spec`. What exists and runs on every PR:

| Plan spec | Covered by | Notes |
| --- | --- | --- |
| `auth.spec` (signup → verify → onboarding → approval) | partially: `auth.setup.ts` (real sign-in), `writes-identity.spec.ts` (redirectTo, reason banners, MFA enrol/verify/recover, password change, deletion request) | Signup → email verify → recruiter onboarding → admin approval is **not** automated (needs an admin seed account and the onboarding wizard). |
| `invite-to-report.spec` | `writes-invite-to-report.spec.ts` | Consent → mocked text interview → `interview/completed` → Inngest `interview/report.generate` → report page. Uses `AI_PROVIDER=mock` and the Inngest dev server (CI job step). |
| `pipeline.spec` (kanban move persists) | not automated | Job-detail kanban uses dnd-kit; API-level status change is covered indirectly by T15's webhook test only. |
| `share-link.spec` (email gate) | `writes-share-link.spec.ts` (closeout) | recruiter shares a report with a recipient email; anonymous data fetch is gated, wrong email refused, right email sets the HMAC cookie, data served, revoke ends access. Route-level cookie/rate-limit branches in `__tests__/api/shared-report-rate-limit.test.ts`. |
| `messaging.spec` | `writes-messaging.spec.ts` | recruiter → candidate by email, delivery/read states, legacy adapter headers, both pages |
| `admin-approval.spec` | not automated | needs an admin seed account. |
| `writes.spec` | `writes.spec.ts` (+ `writes-candidate-results`, `writes-soft-delete`, `writes-security-guards`, `writes-interview-credential`, `writes-ats`, `writes-stubs`) | |
| `visual.spec` | `visual.spec.ts` | 24 baselines, CI-captured |

Missing specs (auth signup → approval, admin approval, pipeline kanban move)
need an admin seed account and a drag-and-drop driver; they stay on the
observation-week backlog. None blocks a merge gate: the behaviour they cover
is unchanged by Phase 0.

## 4. Defects found and fixed while building the gates

Beyond the audit items each task re-confirmed, the gate work itself surfaced:

- **Inngest could never invoke functions in production.** `proxy.ts` applied
  the CSRF check and the session requirement to `POST/PUT /api/inngest`, so
  Inngest Cloud's signed invocations would have been answered 403/401. Reports
  were only produced by the in-process fallback that runs when `inngest.send`
  itself fails. Fixed in this PR (exempt + public; the serve handler verifies
  Inngest's signature in production). Guarded by
  `__tests__/architecture/golden-path.test.ts`.
- **`interview/report.generate` threw on its first step** (`select
  recruiterId` on a model whose recruiter column is `scheduledBy`). Fixed in
  this PR; the golden path proves the durable pipeline end to end.
- **The report pipeline's quality-metrics step wrote columns that did not
  exist** (`InterviewReport.sessionConfidence`, `sessionStabilityMetadata`),
  so every run ended in a Prisma validation error after the report row was
  created. Added as an additive migration in this PR; the golden run now
  completes with zero Inngest step errors.
- **In-app notifications used values outside `NotificationType`**
  (`REPORT_READY`, `REPORT_FAILED`), so the "report ready" and "report failed"
  notifications were never created. Now `FEEDBACK_READY` / `SYSTEM`.
- **Interview replay reconstruction threw** (`InterviewFact` was ordered and
  selected by a `createdAt` column that does not exist; it is `extractedAt`).
  Seen as `[replay] Failed` in every CI log since T0. Fixed.
- Earlier tasks: CSP blocked hydration on hard navigation (#16); invitation
  token lost after `replaceState` (#17); no browser code sent the CSRF header
  (#18, T1); `/candidate` swallowed `/candidates` (#19); admin routes without
  auth and crons without a secret (T5); `WebhookDelivery` written with a
  non-existent field (T7); messaging pages non-functional (T8); SSO callback
  used the anon client for admin APIs and the verify page never consumed the
  token hash (T9); voice-init failed closed on any Redis or SLO-monitor issue
  (T11).

## 5. Production observation window (7 days)

Preconditions (owner):

1. Vercel production env: `UPSTASH_REDIS_REST_URL/TOKEN` (also preview),
   `CRON_SECRET`, `ATS_ENCRYPTION_KEY`, `OTEL_EXPORTER_OTLP_*` (optional but
   needed for gate 10), `INNGEST_SIGNING_KEY` / `INNGEST_EVENT_KEY`.
2. Every `FF_P0_*` flag on: `FF_P0_COOKIE_INTERVIEW_AUTH`,
   `FF_P0_SINGLE_INTERVIEW_ROOM`, `FF_P0_REDIS_SAFE_TO_FAIL`,
   `FF_P0_USAGE_METERING` (default on) and `FF_P0_MFA_ENFORCEMENT` **after**
   every admin and tenant admin has enrolled (`docs/ops/identity.md`,
   bootstrap SQL for `Recruiter.isTenantAdmin`).
3. Run the backfills once: `scripts/backfill-conversations.ts`,
   `scripts/backfill-usage-events.ts` (`--dry-run` first).

Daily checks to record here (date, value, note):

| Day | 4xx/5xx rate vs. week before | Interview completion rate | CSRF 403s | Notes |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |

Sources: Vercel analytics / OTLP `traces_spanmetrics_calls_total` by status,
`GET /api/admin/usage` (started vs completed), Sentry search
`CSRF token validation failed`, `/api/health` (`voice`, `durability`).

## 6. Open external gates (owner actions)

| Gate | Needs |
| --- | --- |
| Staging environment | a Vercel preview/staging project with the Supabase, Upstash and Inngest env set, plus a Fly staging relay for the chaos drill |
| Grafana Cloud | stack + OTLP token → Vercel env + `fly secrets set` (`docs/ops/observability.md`) |
| Greenhouse sandbox | `GREENHOUSE_SANDBOX_API_KEY`, `GREENHOUSE_SANDBOX_ON_BEHALF_OF` repository secrets (`docs/ops/ats-greenhouse.md`) |
| MFA enforcement | admins enrolled, tenant admins flagged, then `FF_P0_MFA_ENFORCEMENT=true` |
| Owner sign-off | after the observation table above is filled |

## 7. Deferred beyond Phase 0 (recorded, not lost)

Issue #43 (Phase 1: legacy #5 finalization manifest + repairing reconciler,
#7 recording health model, #8 device binding and transcript encryption; #3
LiveKit transport is Phase 4); photos bucket
still public (needs an image proxy); per-instance fallbacks are weaker than
Redis during an outage (T11 runbook); Sentry ↔ OTel span-processor wiring at
the moment export is enabled; logs over OTLP; execution of non-candidate
`AccountDeletionRequest`s; `/roles/new` and talent-pool detail views (Phase 1
CRM); org-wide "MFA or SSO" (Phase 3); other ATSs (Phase 3); multi-region
relay (Phase 4); billing UI (Phase 5).

## 8. Exit closeout checklist (2026-09-26)

Reconciled against `main` after every merge above. The mandate for this
closeout: close every remaining exit gate that does not need the owner or an
external environment, clean up the superseded legacy PRs, finish Issues #14
and #20, and leave only the observation window and the sign-off.

### Tasks T0–T16

All merged; see §1 for PR and SHA. T14's own record is #38 (7f21e9e).

### Legacy PRs #1–#11

| PR | Disposition | Replacement / rationale |
| --- | --- | --- |
| #1 | **Open, untouched** (Humza's interrupted local rebase, per the audit) | Every item is on `main`: 1.1/1.2/1.4 (Track 6, T11), 1.3 heartbeat ladder (`hooks/useVoiceInterview.ts`), 1.5 buffer-drop signal (#40 `relay.flow` forced `pause` frame). Comment posted; closing is the owner's call. |
| #2 | Closed — superseded | `InterviewSessionStore` contract + `PrismaRedisInterviewSessionStore` (T11) |
| #3 | Closed — Phase 4 | LiveKit transport out of scope; go/no-go criteria kept in the PR description; #43 |
| #4 | Closed — salvaged | #39: playback integrity, retention gate, scoped access, shared-report rate limits, detector |
| #5 | Closed — deferred | Detector cron covers the exit gates; manifest + flagged state-machine change + repairing reconciler in #43 |
| #6 | Closed — salvaged | #39: seven routes + `GET/PATCH /api/interviews/[id]` scoped; sweep test |
| #7 | Closed — deferred | `RecordingState` + `mergeSucceeded` + detector invariant B cover playback trust; #43 |
| #8 | Closed | HMAC share cookie salvaged (#39); validate rate limit via the proxy limiter (T1/T2); device binding + transcript encryption deferred (#43) |
| #9 | Merged 2026-04-13 (Track 6) | — |
| #10 | Merged 2026-04-13 (relay Sentry) | — |
| #11 | Closed — salvaged | #40: flow-control frames + client throttle, provider circuit breaker |

### Issues

| Issue | State | Resolution |
| --- | --- | --- |
| #13 | closed (T0) | authenticated baselines |
| #14 | closed (#42) | nonce + `strict-dynamic` CSP on app routes; public pages static and documented; hard-load + refresh coverage signed out and signed in |
| #15 | closed (#19) | segment-aware prefixes |
| #20 | closed (#41) | stacked `/candidates` rows at phone widths; geometry spec + adopted baseline |
| #43 | open (Phase 1) | deferred legacy ideas, with rationale |

### What remains

Only the items marked **external** or owner-gated in §2 and §6: staging
route matrix (3), k6 load run (5), staging flag flip for the metering
rollback (6), live relay chaos drill (7), Greenhouse sandbox nightly ×5 (8),
Grafana population (10), the 7-day production observation window with every
`FF_P0_*` on (11, §5), and the owner sign-off (12).

