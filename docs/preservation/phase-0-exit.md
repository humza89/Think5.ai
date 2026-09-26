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
| T14 remaining scenarios: signup→approval, admin approval, pipeline move | #46 | 517d377 | admin + pending-recruiter fixtures, admin storage state, three golden specs, approvals PATCH honours `?type=recruiter` |
| Exit closeout record + share-link golden spec + shared-report fixes | #44 | 8b99074 | this record's §8, `writes-share-link.spec.ts`, proxy lets the two share-token routes through without a session, share page validates the HMAC cookie, dot-delimited cookie value, CI `NEXTAUTH_SECRET` |

Pre-T0 fixes that unblocked the authenticated baselines: #16 (CSP `unsafe-inline` restoration with hard-navigation regression tests), #17 (invitation token kept after `replaceState`), #18 (CSRF client), #19 (segment-aware route prefixes; Issue #15 closed).

## 2. Gate checklist

| # | Gate (plan T14) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `npm run manifest:check` clean; manifest diff since baseline reviewed | **Green** | CI "Verify committed manifest baseline" on every PR; every change reviewed in its PR body. Removed items since the T0 baseline: none. Additions: routes/models/flags/contracts listed per task. |
| 2 | Golden E2E suite green | **Green in CI on every PR**; every plan scenario covered, see §3 | `e2e/golden/*`: route matrix (71 routes), visual (24 baselines), `writes-*` per task, `writes-invite-to-report` (#38), `csp-nonce` (#42), `mobile-layout` (#41), `writes-share-link` (#44), `writes-signup-to-approval`, `writes-admin-approval`, `writes-pipeline-move` (#46) |
| 3 | Route matrix green against staging | **Green against the production deployment; no staging exists** | No staging environment is configured (see §6: the Vercel project has one Production environment and SSO-protected previews that share the production database). The logged-out route matrix (`scripts/route-matrix.sh`, read-only GETs, 71 routes: public → 200, protected → redirect to `/auth/signin`) was run on 2026-09-26 18:26 UTC against `https://www.think5.ai` = production deployment of `main` 7cd12cb (GitHub deployment 2026-09-26 17:55 UTC): **71/71 passed, 0 failures**. The signed-in matrix (`route-access.spec.ts`) runs against the local stack in CI on every PR. |
| 4 | `npx vitest run` green; eval harness `overallPassed` | **Green** | 121 files / 1076 tests on the #46 head; relay `tsc` clean; `EVAL_MOCK_MODE=true npm run test:eval` → `Overall: PASSED, Avg Score 7.7`; CI "Eval Harness (Mock Mode)" job |
| 5 | k6 `load-tests/concurrent-interviews.js` on staging within thresholds | **Open — owner: no staging** | The script needs a staging deployment with `AI_PROVIDER=mock` and an isolated database; the only non-production deployments are Vercel previews that use the production `DATABASE_URL`, so the load run cannot be executed without writing load traffic into production data. Owner action in §6. Thresholds are unchanged. |
| 6 | Rollback exercised (T8 messaging legacy route; `FF_P0_USAGE_METERING` off) | **Green in CI; staging flip open — owner: no staging** | Legacy `/api/messages` adapter is exercised in `writes-messaging.spec.ts` on every run; the `FF_P0_USAGE_METERING=false` path is covered by `__tests__/usage`. Flipping the flag in a deployed environment needs a staging deployment (§6). |
| 7 | Relay chaos in staging (`fly machine stop`) + `docs/ops/regional-failure.md` reviewed | **Open — owner: Fly access + staging relay** | Automated chaos tests green (`__tests__/chaos/relay-drain.test.ts`, `redis-loss.test.ts`, `relay-backpressure.test.ts`). The only Fly app is the production relay `think5-voice-relay` (iad) and this machine has no Fly session (`flyctl auth whoami` → no access token), so the drill was not run; it must never run against production. Owner action in §6. |
| 8 | Greenhouse sandbox nightly green ×5 | **Open — owner: secrets** | The repository has **no** Actions secrets (`gh secret list` is empty), so `ats-sandbox-nightly.yml` skips every night. Fixture-level conformance is green on every PR. Owner action in §6. |
| 9 | Contract conformance green for every production implementation | **Green** | `InAppMessageProvider`, `PrismaUsageMeter`, `QuotaEntitlementService`, `PrismaRedisInterviewSessionStore`, `OtelTelemetry`, `GreenhouseAdapter` each run through `lib/contracts/conformance/*` in `npx vitest run` |
| 10 | Grafana dashboards populated from staging traffic | **Open — owner: OTLP not configured** | Dashboards committed (`docs/ops/grafana/*.json`). Verified 2026-09-26: no `OTEL_EXPORTER_OTLP_*` variable exists in any Vercel environment and the Fly relay secrets could not be inspected (no Fly session), so export is off and the panels are empty. Owner action in §6. |
| 11 | 7-day production observation with all `FF_P0_*` on | **Not started — preconditions open** | §5 preflight run on 2026-09-26: see the precondition table there. The window must not start until the missing production configuration and the backfills are done. |
| 12 | Owner sign-off (Humza) | **Pending** | Every in-repo gate is closed as of 2026-09-26 (§8); the remaining rows need the owner actions in §6, then the observation window (§5). |

## 3. Golden E2E coverage versus the plan's list

The plan names `auth.spec`, `invite-to-report.spec`, `pipeline.spec`,
`share-link.spec`, `messaging.spec`, `admin-approval.spec`, `writes.spec`,
`visual.spec`. What exists and runs on every PR:

| Plan spec | Covered by | Notes |
| --- | --- | --- |
| `auth.spec` (signup → verify → onboarding → approval) | `writes-signup-to-approval.spec.ts` (closeout) plus `auth.setup.ts` (real sign-in) and `writes-identity.spec.ts` (redirectTo, reason banners, MFA enrol/verify/recover, password change, deletion request) | Real signup form → verification token read from `verification_tokens` (no mail service locally; the product's verify route still consumes it) → real sign-in → proxy holds the recruiter at onboarding → onboarding API steps 1–5 (joins the seeded company) → held at the status page → admin approves on `/admin/approvals` → recruiter reaches `/dashboard`. Fixture recipe in `e2e/fixtures/README.md`. |
| `invite-to-report.spec` | `writes-invite-to-report.spec.ts` | Consent → mocked text interview → `interview/completed` → Inngest `interview/report.generate` → report page. Uses `AI_PROVIDER=mock` and the Inngest dev server (CI job step). |
| `pipeline.spec` (kanban move persists) | `writes-pipeline-move.spec.ts` (closeout) | Real pointer drag on the dnd-kit board (PointerSensor, 8 px activation): Interviewing → Screening, the board's `PATCH /api/jobs/[id]/applications/[appId]` must answer 200 with the new status, the stage survives a reload and is read back from `Application.status`; then dragged back and verified again. |
| `share-link.spec` (email gate) | `writes-share-link.spec.ts` (closeout) | recruiter shares a report with a recipient email; anonymous data fetch is gated, wrong email refused, right email sets the HMAC cookie, data served, revoke ends access. Route-level cookie/rate-limit branches in `__tests__/api/shared-report-rate-limit.test.ts`. |
| `messaging.spec` | `writes-messaging.spec.ts` | recruiter → candidate by email, delivery/read states, legacy adapter headers, both pages |
| `admin-approval.spec` | `writes-admin-approval.spec.ts` (closeout) | Seeded admin + pending recruiter: pending list via API, pending recruiter held at the status page, recruiter session refused (403), approve from the Recruiters tab (PATCH 200), approved list, recruiter reaches `/dashboard`, reject-without-reason refused (400); fixture reset afterwards. |
| `writes.spec` | `writes.spec.ts` (+ `writes-candidate-results`, `writes-soft-delete`, `writes-security-guards`, `writes-interview-credential`, `writes-ats`, `writes-stubs`) | |
| `visual.spec` | `visual.spec.ts` | 24 baselines, CI-captured |

Every scenario in the plan's list is now automated and runs in Preservation
Gates on every PR.

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
- **Shared report links did not work for their recipients.** The proxy
  required a Think5 session for every `/api/*` route except the interview
  token routes, so a recipient opening `/reports/shared/[token]` got 401
  from the data and verify-email endpoints before the route's own token,
  email-gate and rate-limit checks ran. Found by the closeout's
  `writes-share-link.spec.ts`; fixed in the closeout PR
  (`sharedReportPublicPattern` in `proxy.ts`, guarded by
  `__tests__/architecture/shared-report-public.test.ts`). The same spec
  then showed the share page itself still validated the legacy plain-SHA256
  cookie after #39 moved the API routes to the HMAC cookie, and that the
  HMAC cookie's `|` delimiter was percent-encoded by the cookie store; both
  fixed in the closeout PR (page uses `verifyReportShareCookie`; cookie is
  dot-delimited and verification tolerates percent-encoding).
- **Recruiter approvals from the admin UI answered 404.** The approvals
  page sends `?type=recruiter` on the query string, but `PATCH
  /api/admin/approvals/[id]` read `type` from the body only, so every
  recruiter approve/reject from the UI was routed to the candidate handler.
  Found by the closeout's `writes-signup-to-approval.spec.ts`; the route now
  honours the query string as GET does. Guarded by both approval specs.
- Earlier tasks: CSP blocked hydration on hard navigation (#16); invitation
  token lost after `replaceState` (#17); no browser code sent the CSRF header
  (#18, T1); `/candidate` swallowed `/candidates` (#19); admin routes without
  auth and crons without a secret (T5); `WebhookDelivery` written with a
  non-existent field (T7); messaging pages non-functional (T8); SSO callback
  used the anon client for admin APIs and the verify page never consumed the
  token hash (T9); voice-init failed closed on any Redis or SLO-monitor issue
  (T11).

## 5. Production observation window (7 days)

### Preflight (2026-09-26, against the Vercel project `think5`, production = `main` 7cd12cb)

Checked with `vercel env ls` (names only) and `GET https://www.think5.ai/api/health`.

| Precondition | State | Evidence / action |
| --- | --- | --- |
| Upstash (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) | **Configured but failing** | Both variables exist in Production/Preview/Development, yet `/api/health` reports `redis: "unhealthy"` (the ping threw) and `durability: "postgres"` — the safe-to-fail downgrade is doing its job, but Redis-backed rate limiting, session fan-out and leases are running on the per-instance fallbacks. Owner: verify the Upstash database and token in Vercel → Production. |
| `CRON_SECRET` | **Missing** | Not in any Vercel environment. Cron routes (`/api/cron/*`) answer 401 to everything until it is set. |
| `ATS_ENCRYPTION_KEY` | **Missing** | Not in any Vercel environment; Greenhouse credentials cannot be stored (T15). |
| `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY` | **Missing** | `/api/health` reports `inngest: "not_configured"`. In production the report pipeline runs only through the in-process fallback, and the retention, SLO, broken-COMPLETED and finalize-retry jobs never run. |
| `NEXTAUTH_SECRET` | **Missing** | Not in any Vercel environment. Email-gated shared reports answer 500 ("Server configuration error") in production because the share cookie cannot be signed (the pre-Phase 0 code needed the same variable). |
| `OTEL_EXPORTER_OTLP_*` | **Missing** (gate 10) | See §2 row 10. |
| `FF_P0_*` flags | **Defaults** | No `FF_P0_*` variable is set anywhere, so production runs the code defaults: see §9. |
| Backfills (`scripts/backfill-conversations.ts`, `scripts/backfill-usage-events.ts`) | **Not run** | Both scripts are idempotent and resumable (`--batch`, `--dry-run`; ids derive from the subject; `createMany … skipDuplicates`). They were **not executed** from this session: the automation policy in this environment blocks reads and writes against the production database, so the dry-run/real-run/verification sequence is an owner action (exact commands in §6). |
| Tenant-admin assignments / MFA enrolment | **Not verifiable here** | Requires production data access (§6). |

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

## 6. Owner actions required (consolidated, 2026-09-26)

Everything in the repository is done; each row below needs a credential, an
account, infrastructure or a production decision. No secret values are
recorded here.

| # | What is missing | Blocks | Where to configure / what to run |
| --- | --- | --- | --- |
| 1 | A staging deployment with its own database | gates 5, 6 (flag flip), 7 | Vercel: a second project (or a branch-scoped Preview with its own `DATABASE_URL`/`DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `INNGEST_*`, `AI_PROVIDER=mock`, `NEXTAUTH_SECRET`, `CRON_SECRET`). Previews currently share the production database and are behind Vercel SSO protection; for automation set `VERCEL_AUTOMATION_BYPASS_SECRET` (Project → Deployment Protection → Protection Bypass for Automation). Then: `BASE_URL=<staging> npm run route:matrix`; `k6 run --env BASE_URL=<staging> --env API_TOKEN=<staging token> load-tests/concurrent-interviews.js` and record concurrency/duration/thresholds/p50-p95-p99/error rate/completed-failed counts; flip `FF_P0_USAGE_METERING=false`, create an interview, flip back. |
| 2 | Fly access for the chaos drill | gate 7 | `flyctl auth login` on the operator machine (or `FLY_API_TOKEN`), a **staging** relay app (clone of `relay/fly.toml` under another name — never `think5-voice-relay`), then the T11 runbook `docs/ops/regional-failure.md`: mocked interview → `fly machine stop <id>` → reconnect, transcript/state integrity, degraded/recovery telemetry. |
| 3 | Greenhouse sandbox secrets | gate 8 | GitHub → repo Settings → Secrets and variables → Actions: `GREENHOUSE_SANDBOX_API_KEY`, `GREENHOUSE_SANDBOX_ON_BEHALF_OF`, optional `GREENHOUSE_SANDBOX_WEBHOOK_SECRET`. Then run `ats-sandbox-nightly.yml` (workflow_dispatch) five nights or five times and record run ids in §2 row 8. |
| 4 | OTLP export | gate 10 | Vercel → Production (and staging): `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_SERVICE_NAME=think5-web`; `fly secrets set` the same on the relay with `OTEL_SERVICE_NAME=think5-relay` (`docs/ops/observability.md`). Import `docs/ops/grafana/*.json`, generate traffic, confirm web/relay/queue/provider/interview panels have data. |
| 5 | Production configuration gaps | gate 11 preflight | Vercel → Production: `CRON_SECRET`, `ATS_ENCRYPTION_KEY`, `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY` (and sync the app in the Inngest dashboard), `NEXTAUTH_SECRET`. Fix the Upstash credentials until `/api/health` reports `redis: "healthy"` and `durability: "postgres+redis"`. |
| 6 | Backfills | gate 11 preflight | From a machine allowed to reach the production database, with `DATABASE_URL`/`DIRECT_URL` set: `npx tsx scripts/backfill-conversations.ts --dry-run` → `npx tsx scripts/backfill-conversations.ts` → verify `SELECT count(*) FROM "Conversation"` equals the distinct `Message.conversationId` count; `npx tsx scripts/backfill-usage-events.ts --dry-run` → real run → verify `UsageEvent` counts against interviews with `startedAt`/`completedAt` and `AIUsageLog` rows, and `TenantQuota` rows against `Client.monthlyAiBudgetUsd`. Both scripts are idempotent; re-running is safe. |
| 7 | MFA enforcement readiness | gate 11 (flag value) | Enrol every Think5 admin (`/settings/security`), mark tenant admins (`Recruiter.isTenantAdmin`, bootstrap SQL in `docs/ops/identity.md`), then set `FF_P0_MFA_ENFORCEMENT=true`. Until then it stays `false` (documented in §9). |
| 8 | Observation window + sign-off | gates 11, 12 | Start the 7-day window only after rows 5–7; fill the daily table in §5 (never in advance); sign off in §2 row 12. |

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

All merged; see §1 for PR and SHA. T14's own record is #38 (7f21e9e); the
closeout merges are #39–#42, #44, #45 and #46 (the last three plan
scenarios).

### Legacy PRs #1–#11

| PR | Disposition | Replacement / rationale |
| --- | --- | --- |
| #1 | Closed 2026-09-26 — everything on `main` | 1.1/1.2/1.4 (Track 6, T11), 1.3 heartbeat ladder (`hooks/useVoiceInterview.ts`), 1.5 buffer-drop signal (#40 `relay.flow` forced `pause` frame), full-jitter backoff. Only the GitHub PR was closed; the local `fix/voice-reliability-phase-1` rebase in the owner's working copy is untouched. |
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

## 9. Feature flag readiness (production, 2026-09-26)

No `FF_P0_*` variable is set in any Vercel environment (`vercel env ls`), so
production runs the defaults from `lib/feature-flags.ts`.

| Flag | Current production value | Phase 0 observation value | Rollback value | Validation |
| --- | --- | --- | --- | --- |
| `FF_P0_COOKIE_INTERVIEW_AUTH` | `true` (default) | `true` | `false` (raw tokens keep working; `lib/interview-credential.ts`) | `writes-interview-credential.spec.ts` (cookie path) and unit tests for both modes, every PR |
| `FF_P0_SINGLE_INTERVIEW_ROOM` | `true` (default) | `true` | `false` | T4 golden path + `writes-candidate-results.spec.ts` |
| `FF_P0_REDIS_SAFE_TO_FAIL` | `true` (default) | `true` | `false` (fail closed on Redis loss) | `__tests__/chaos/redis-loss.test.ts`; production `/api/health` shows the downgrade active (`durability: "postgres"`) |
| `FF_P0_USAGE_METERING` | `true` (default) | `true` | `false` (`__tests__/usage` covers the off path) | `writes-messaging`/T16 usage tests; staging flip pending (§6 row 1) |
| `FF_P0_MFA_ENFORCEMENT` | `false` (default) | `true` **only after §6 row 7** | `false` | `writes-identity.spec.ts` (enrol/verify/recover), `__tests__/lib/mfa-policy.test.ts` |
