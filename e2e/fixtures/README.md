# E2E fixtures

This directory holds the deterministic fixture contract for the Phase 0 golden suite. Nothing here is a secret and no file here grants access to anything outside a throwaway local Supabase stack.

## Files

- `e2e-fixtures.ts` — the single source of truth for seeded identities, fixed IDs, invitation/access tokens and the routes the authenticated golden tests visit. The seed script, the Playwright auth setup project and the visual spec all import it, so they cannot drift apart.
- `../.auth/recruiter.json`, `../.auth/candidate.json` — generated Playwright storage state (real session cookies). Gitignored. Never commit them and never upload them as CI artifacts.

## How an authenticated baseline is produced

1. `npm run e2e:stack` boots a local Supabase stack (`supabase/config.toml`): GoTrue, PostgREST, Storage and Postgres with the Supabase system schemas.
2. `npm run e2e:db` (`scripts/e2e-db.ts`) runs `prisma db push` first (the tracked Prisma migration history does not start at init, so `migrate deploy` cannot bootstrap an empty database) and then applies `supabase/migrations/*.sql` in order. That order matters: migrations from 20240105 onwards ALTER Prisma tables, exactly as they did in production, which is also why `supabase/config.toml` disables automatic migration application on `supabase start`.
3. `npm run e2e:seed` (`scripts/e2e-seed.ts`) creates the recruiter and candidate through the Supabase Auth **admin API**, pins their `profiles` rows (`email_verified`, `onboarding_status`, `account_status`) and upserts fixed-ID Prisma rows: one company, one approved recruiter, three candidates (one approved), one active job, one application, one `SENT` invitation and two interviews (one `PENDING` at the welcome stage, one `COMPLETED`). Every `createdAt` is pinned to `2026-09-01T09:00:00Z`; tokens expire in 2099. The script is idempotent and refuses to run against a non-local Supabase host unless `E2E_SEED_ALLOW_REMOTE=true`.
4. `e2e/golden/auth.setup.ts` (the Playwright `setup` project that `chromium` depends on) signs both accounts in through the real `/auth/signin` form. The candidate then opens the seeded invitation on `/interview/accept` and clicks **Accept & start interview**, so `/api/interviews/accept` issues the HttpOnly `interview-session` cookie exactly as it does for real candidates. The resulting storage state is written to `e2e/.auth/`.
5. `e2e/golden/visual.spec.ts` opens those storage states and captures `/dashboard`, `/jobs`, `/jobs/[seeded]`, `/candidates`, `/interviews`, `/candidate/dashboard` and `/interview/[seeded]` at the welcome stage, at 1280×900 and 375×812, with the same deterministic capture rules as the public pages (reduced motion before navigation, network and image settling, reveal sections forced visible, footage hidden, Next.js dev portal suppressed).

There is no route-guard bypass, no forged cookie, no test-only auth exemption and no change to production auth behaviour. The only application change that supports this flow is in `next.config.ts`: the CSP `connect-src` additionally allows the origin of `NEXT_PUBLIC_SUPABASE_URL` when it is not a hosted `*.supabase.co` project, which is what lets the browser reach the local GoTrue. Hosted deployments produce a byte-identical CSP.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `E2E_AUTH_FIXTURES` | `true` turns the auth setup project on and makes a missing storage state a failure instead of a skip. |
| `E2E_SEED_PASSWORD` | Password for the seeded accounts. Must be identical for `npm run e2e:seed` and the Playwright run. Not a secret for the local stack. |
| `E2E_RECRUITER_STORAGE_STATE` | Path to the recruiter storage state. Defaults to `e2e/.auth/recruiter.json` when that file exists. |
| `E2E_CANDIDATE_STORAGE_STATE` | Path to the candidate storage state. Defaults to `e2e/.auth/candidate.json` when that file exists. |
| `ROUTE_MATRIX_FIXTURES` | JSON mapping dynamic route patterns to seeded routes for the logged-out route matrix, e.g. `{"/jobs/[id]":"/jobs/e2e-job-backend"}`. `ROUTE_MATRIX_FIXTURES` in `e2e-fixtures.ts` holds the canonical values. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL` | Taken from `supabase status -o env` after the stack starts. |

## Running it locally

```bash
npm run e2e:stack
eval "$(npx supabase status -o env)"
export NEXT_PUBLIC_SUPABASE_URL="$API_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
  SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" DATABASE_URL="$DB_URL" DIRECT_URL="$DB_URL" \
  E2E_SEED_PASSWORD="local-only-password" E2E_AUTH_FIXTURES=true TZ=UTC
npm run e2e:db
npm run e2e:seed
npm run test:e2e:golden
```

Baselines committed under `e2e/golden/visual.spec.ts-snapshots/` are `chromium-linux` images generated on CI. Local macOS runs produce `chromium-darwin` files that must not be committed.

## How CI provisions it

The `Preservation Gates` job in `.github/workflows/eval-gate.yml` runs exactly the sequence above with `supabase/setup-cli` pinned to the same CLI version, exports the stack credentials into `GITHUB_ENV`, and sets `E2E_AUTH_FIXTURES=true` for the golden step. The storage-state files are excluded from the uploaded artifacts.
