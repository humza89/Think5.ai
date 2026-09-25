# Phase 0 architecture contracts (T0.5)

`lib/contracts` holds the canonical interfaces that every later Phase 0 task codes against, so fixes made now cannot create coupling the enterprise architecture (PRD v2.1 §10) has to undo. This directory contains **contracts, reference in-memory implementations and a conformance harness only**. Production implementations arrive with the tasks below and must pass the same conformance runner.

| Contract | File | Phase 0 default | Implemented by | Notes |
| --- | --- | --- | --- | --- |
| `Telemetry` | `telemetry.ts` | `NoopTelemetry` | T12 (OpenTelemetry → Grafana Cloud) | Every other contract takes a `Telemetry`; none imports a logging vendor. Lint-enforced. |
| `EntitlementService` | `entitlements.ts` | `AllowAllEntitlements` (allows, emits a structured counter) | T16 quotas; billing UI Phase 5 | Feature union: `interview.create`, `interview.avatar_minutes`, `ats.sync`, `api.key`, `seat.recruiter`, `message.send`, `storage.bytes`. |
| `UsageMeter` | `usage.ts` | `InMemoryUsageMeter` | T16 (`UsageEvent` table via outbox) | Append-only; `id` is the idempotency key; unit is fixed per kind. |
| `InterviewSessionStore` | `interview-session-store.ts` | `InMemoryInterviewSessionStore` | T11 (wraps `lib/session-store.ts` Redis + `InterviewerStateSnapshot` Postgres) | Every write reports `Durability`; Redis loss is a downgrade to `"postgres"`, never state loss; leases fence writers. |
| `ATSAdapter` | `ats.ts` | `InMemoryATSAdapter` | T15 (Greenhouse two-way proof; `lib/ats/*` adapted) | Idempotency key on every write; `capabilities()` drives the UI. |
| `AvatarProvider` | `avatar.ts` | `NoAvatar` (`transport: "none"`, `degraded: true`) | Phase 2 vendor | The room must keep working in degraded mode. |
| `MessageProvider` | `messaging.ts` | `InMemoryMessageProvider` (in-app + email) | T8 in-app, Resend email; SMS later | Unsupported channel throws `NotImplementedChannelError` (`code: CHANNEL_NOT_IMPLEMENTED`). |
| Plane boundary | `planes.ts` | types + `assertPlaneMayHold` | enforced now | `relay/**` and avatar code cannot import Prisma (ESLint `no-restricted-imports`). |

## Conformance harness

`lib/contracts/conformance/*.ts` exports one runner per contract, for example `runUsageMeterConformance(() => new MyMeter())`. A runner exercises the contract's guarantees against a fresh instance and returns a list of violation strings; an empty list means the implementation conforms. Runners depend only on the contracts, so any package (including `relay/`) can run them.

`__tests__/contracts/*.test.ts` runs every runner against the reference implementation (expects no violations) **and** against a deliberately broken implementation (expects the specific violation), which proves the harness detects what it claims to detect.

To certify a new implementation, add a test that calls the runner with your factory and asserts `[]`.

## Rules for consumers

- Import from `@/lib/contracts` (or the specific file). Do not redefine these shapes elsewhere.
- Pass a `Telemetry` in; never import `lib/logger`, Sentry or an OTel SDK inside a contract implementation's public surface.
- Writes that can be retried (usage, ATS, messages) carry an idempotency key; callers generate it from the business identity of the action, not from `Date.now()`.
- Media-plane code holds only `MEDIA_PLANE_MAY_HOLD` assets and acts under a `MediaPlaneGrant`.
