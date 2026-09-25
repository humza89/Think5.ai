# Think5

AI-powered recruiting platform: recruiters source and manage candidates, run AI voice or text interviews with "Aria", and share structured reports; candidates apply, practise and interview from their own dashboard. This README is generated from the preservation manifest (`docs/preservation/manifest.json`) and the Phase 0 plan; it describes what is in the repository today.

## Stack

| Layer | What |
| --- | --- |
| Web | Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind + shadcn/ui |
| Data | PostgreSQL on Supabase, Prisma 6 (soft-delete extension in `lib/soft-delete.ts`), additive migrations only |
| Auth | Supabase Auth (email/password, SSO via OIDC + SAML, native TOTP MFA), profiles table with role gates in `proxy.ts` |
| Jobs | Inngest durable functions (`inngest/functions/*`: report generation, recording processing, retention, webhooks retry, usage aggregation, ATS sync) |
| Cache / limits | Upstash Redis as an accelerator only (rate limits, session hot state, locks); Postgres stays authoritative (`lib/redis-degradation.ts`) |
| Voice | Fly.io WebSocket relay (`relay/`) between the browser and Gemini Live; the API key never leaves the server |
| Storage | Supabase Storage (resumes, private + signed URLs) and Cloudflare R2 (interview recordings, chunked upload) |
| Observability | OpenTelemetry (`lib/otel.ts`, `relay/otel.ts`) exported over OTLP to Grafana Cloud when configured; Sentry for error capture; `x-request-id` correlation and a Support ID on the interview room |
| Integrations | Greenhouse (Harvest) behind the `ATSAdapter` contract (`lib/ats/adapters/greenhouse.ts`); other ATSs are Phase 3 |
| Contracts | `lib/contracts/*` — canonical interfaces (telemetry, entitlements, usage, session store, ATS, avatar, messaging, plane boundaries) with conformance runners every implementation must pass |

Services in production: Vercel (web + crons), Supabase (Postgres, Auth, Storage), Upstash (Redis), Inngest (queues), Fly.io (voice relay), Cloudflare R2 (recordings), Resend (email), Sentry, Grafana Cloud (OTLP), Google Gemini (interviews).

## Repository map

```
app/                  Next.js routes: (dashboard) recruiter shell, candidate/ shell, admin, interview/ room, api/
components/           UI (shadcn primitives, layout shells, interview room, brand)
lib/                  Domain code: contracts/, auth, messaging/, usage/, entitlements/, ats/, session store, telemetry
inngest/              Durable functions and the Inngest client
relay/                Fly.io voice relay (separate package; imports no Prisma)
prisma/               schema.prisma + migrations (additive; each Phase 0 task ships its own folder)
supabase/             Local stack config (supabase/config.toml) and SQL migrations (storage buckets, RLS, profiles)
e2e/                  Playwright: golden suite (route matrix, visual baselines, writes-* specs) with real Supabase sessions
__tests__/            Vitest: unit, API, architecture guards, chaos, contract conformance
scripts/              preservation-manifest, route-matrix, e2e-db/e2e-seed, backfills
docs/                 Product/plan docs (superpowers/), ops runbooks (ops/), preservation manifest, legacy material (legacy/)
```

## Local setup

Prerequisites: Node 22, Docker (for the local Supabase stack), `npx supabase` (CLI 2.117+; Homebrew is optional).

```bash
npm ci
cp .env.example .env          # fill in what you have; see the sections in .env.example
npm run e2e:stack             # local Supabase (db, auth, rest, storage) on 54321/54322
npm run e2e:db                # prisma db push + supabase/migrations against the local stack
npm run e2e:seed              # deterministic recruiter / candidate / identity accounts and data
npm run dev                   # http://localhost:3000
```

For the voice room you also need the relay (`cd relay && npm ci && npm run dev`) and `GEMINI_API_KEY`, `RELAY_JWT_SECRET`, `VOICE_RELAY_URL`. Text interviews work without the relay.

Local gotchas: the Supabase CLI reads `.env` and rejects bare heading lines; `prisma db push` on a non-fresh local database returns P4002 (reset with `npx supabase db reset --no-seed` first); Turbopack refuses a symlinked `node_modules`.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint (includes the `apiFetch` guard for browser writes and the plane-boundary import rules) |
| `npm test` | Vitest unit + architecture + chaos + contract conformance |
| `npm run test:eval` | Interview evaluation harness (mock mode in CI) |
| `npm run manifest` / `manifest:check` | Regenerate / verify `docs/preservation/manifest.json` (pages, APIs, models, Inngest, crons, flags, contracts) |
| `npm run route:matrix` | Curl every public page logged out and every gated page for its redirect |
| `npm run test:e2e:golden` | Playwright golden suite against the local stack (needs `E2E_AUTH_FIXTURES=true`, `E2E_SEED_PASSWORD`) |
| `npm run test:e2e:golden:update` | Refresh visual baselines (CI-captured chromium-linux PNGs are the committed ones) |
| `npm run e2e:stack` / `e2e:db` / `e2e:seed` | Local Supabase stack, schema, seed |
| `npm run predeploy` | Pre-deploy checks |

## Testing

- **Unit / contract**: `npx vitest run`. Every `lib/contracts` implementation is run through its conformance harness (`lib/contracts/conformance/*`).
- **Golden E2E** (`e2e/golden`): a `setup` project signs the seeded accounts in through the real form; specs cover the preservation route matrix, visual baselines, and one `writes-*.spec.ts` per Phase 0 task (CSRF client, interview credential, candidate results, soft delete, security guards, messaging, identity/MFA, ATS, stubs).
- **CI** (`.github/workflows/eval-gate.yml`): TypeScript, Preservation Gates (boots Supabase, seeds, runs the golden suite, verifies the manifest), Eval Harness, Hard Navigation Hydration. `ats-sandbox-nightly.yml` runs the Greenhouse sandbox loop when its secrets exist.

## Feature flags

Phase 0 behaviour changes sit behind `FF_P0_*` flags declared in `lib/feature-flags.ts` (cookie interview auth, single interview room, Redis safe-to-fail, usage metering, MFA enforcement, …). Defaults are on, except `FF_P0_MFA_ENFORCEMENT`, which stays off until every admin has enrolled (`docs/ops/identity.md`).

## Deploy

- **Web**: Vercel from `main` (squash merges only; no direct pushes). Crons in `vercel.json` (`report-retry`, `fragment-cleanup`, `retention-purge`) need `CRON_SECRET`. Environment: see `.env.example` — Supabase, database (pooler + direct URLs), Upstash, Inngest, Resend, R2, Sentry, OTEL, ATS encryption key.
- **Database**: Prisma migrations are additive; apply with `prisma migrate deploy` (or `db push` on ephemeral stacks). Supabase SQL migrations live in `supabase/migrations`.
- **Relay**: `cd relay && fly deploy` (rolling, two machines, `kill_timeout` above the drain window). Secrets via `fly secrets set`: `GEMINI_API_KEY`, `RELAY_JWT_SECRET`, `SENTRY_DSN`, optional `OTEL_*`.
- **Runbooks**: `docs/ops/regional-failure.md` (relay/Redis loss), `docs/ops/observability.md` (Grafana Cloud), `docs/ops/identity.md` (SSO/MFA rollout), `docs/ops/ats-greenhouse.md` (sandbox and webhooks), `docs/preservation/README.md` (manifest and gates).

## Phase 0

The stabilisation programme (T0–T16) is tracked in `docs/superpowers/plans/2026-09-16-phase-0-stabilise.md`; its exit criteria and evidence are recorded in `docs/preservation/phase-0-exit.md`.
