# Greenhouse two-way proof (Phase 0 · T15)

Narrow by design: one ATS, sandbox only, enough to prove the T0.5 `ATSAdapter`
contract, idempotency, reconciliation and error handling end to end. Lever,
Workday and Ashby stay Phase 3 (the legacy `lib/ats/*` clients are untouched).

## Pieces

| Piece | Where |
| --- | --- |
| Adapter | `lib/ats/adapters/greenhouse.ts` — `GreenhouseAdapter implements ATSAdapter` over Harvest v1: Basic auth, `On-Behalf-Of` for writes, pagination via `Link`, 429/5xx backoff with `Retry-After`, typed `GreenhouseRateLimitError` / `GreenhouseApiError`, HMAC-SHA256 webhook verification (`Signature: sha256 <hex>`, constant-time), webhook parsing with a body-digest event id. Passes `runATSAdapterConformance`. |
| Idempotency | Every write takes a key. Results are stored in `ATSEntityLink(localType="idempotency")` (`PrismaIdempotencyStore`), so a retried job or replayed event never creates a second candidate or note. |
| Sync engine | `lib/ats/sync.ts` — `importJobs`, `pushApplication`, `pushReport`, `applyWebhook`, `reconciliation`; each run writes `ATSSyncRun` (counts, errors) and one `ats.sync` usage event (T16). Depends on a narrow `SyncDb`, tested against an in-memory fake. |
| Durable jobs | `inngest/functions/ats-sync.ts` — `ats/sync.requested` (concurrency 1 per integration, 3 retries) and a 6-hourly import fan-out. Registered in `app/api/inngest/route.ts`. |
| Hooks | `POST /api/candidate/jobs/[id]` (new application → export event); `inngest/functions/report-generate.ts` step 8 (report ready → export event). |
| Routes | `POST/DELETE /api/integrations/[provider]/connect`, `POST .../sync` (`inline: true` runs in-request), `GET .../status`, `GET/POST/DELETE .../links` (reconciliation, retry, unlink), `POST /api/integrations/greenhouse/webhook?integration=<id>`. Non-Greenhouse providers answer 501. |
| UI | Settings → Integrations (`app/(dashboard)/settings/integrations/page.tsx`): connect, status, import now, reconciliation table with retry/unlink, recent runs. |
| Schema (additive) | `ATSSyncRun`, `ATSEntityLink` (`@@unique(integrationId, localType, localId)` and `(integrationId, localType, remoteId)` — the plan's `(integrationId, remoteId)` was tightened with `localType` because Greenhouse ids are per object type). Migration `20260925_t15_ats_sync`. |

## Credentials and configuration

- `ATS_ENCRYPTION_KEY` (64 hex chars) must be set for `connect` to store a key
  (AES-256-GCM through `lib/ats/encryption.ts`); without it the route answers
  503 `ATS_ENCRYPTION_UNCONFIGURED`.
- The Harvest key needs Jobs (read), Candidates (read/write), Applications
  (read) and Activity Feed (write). `On-Behalf-Of` must be a Harvest user id
  with permission to create candidates and notes.
- Webhooks: create them in Greenhouse → Configure → Dev Center → Web Hooks with
  the URL shown on the Integrations page and the same secret key entered at
  connect time. Events: `candidate_stage_change`, `candidate_rejected`,
  `job_updated` (others are accepted and treated as `candidate.updated`).

## External gate: the sandbox

The nightly workflow `.github/workflows/ats-sandbox-nightly.yml` runs
`__tests__/ats/greenhouse.sandbox.test.ts` only when these repository secrets
exist: `GREENHOUSE_SANDBOX_API_KEY`, `GREENHOUSE_SANDBOX_ON_BEHALF_OF`,
optionally `GREENHOUSE_SANDBOX_WEBHOOK_SECRET`. Until then the job logs a
notice and skips. **Acceptance for T14:** five consecutive green nightly runs
and a reconciliation table with zero unexplained mismatches on the staging
tenant connected to the sandbox. No live Greenhouse call has been made from
this repository yet; everything above is verified against recorded fixtures.

## Behaviour notes

- Import: open jobs → `Job` (ACTIVE), closed → CLOSED, draft → DRAFT; owner is
  the recruiter who connected (fallback: the company's first recruiter);
  unchanged jobs (checksum of id/title/status/updated_at) are skipped.
- Push candidate: requires the job to be linked; creates the Greenhouse
  candidate with an application on the linked job; a second push with the
  same application id is deduplicated.
- Push report: only for `REPORT_READY` interviews whose candidate is linked;
  a private note with score, recommendation, summary and report link.
- Webhook: stage names map to `ApplicationStatus` (Application Review→APPLIED,
  Phone Screen→SCREENING, Technical/On-site→INTERVIEWING, Offer→OFFERED,
  Hired→HIRED, Rejected→REJECTED); `job_updated` refreshes the linked job.
- Rate limits: the adapter retries with `Retry-After`; when exhausted the run
  is recorded as `error` with `rate_limited retryAfterMs=…` and the Inngest
  function retries later.
