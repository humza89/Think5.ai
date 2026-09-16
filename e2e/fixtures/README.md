# E2E fixtures

This directory documents deterministic fixture inputs used by the Phase 0 golden suite.

Do **not** commit authenticated Playwright storage-state files, access tokens, passwords or production identifiers here.

Authenticated visual tests accept these environment variables:

- `E2E_RECRUITER_STORAGE_STATE` — path to a generated recruiter/hiring-manager Playwright storage-state JSON file.
- `E2E_CANDIDATE_STORAGE_STATE` — path to a generated approved-candidate Playwright storage-state JSON file.
- `ROUTE_MATRIX_FIXTURES` — JSON mapping dynamic route patterns to seeded routes, e.g. `{ "/jobs/[id]": "/jobs/seed-job-1" }`.

The storage-state files should be generated at CI runtime from dedicated non-production seeded accounts and uploaded only as short-lived CI artifacts when debugging. T0 intentionally does not add a generic authentication bypass.
