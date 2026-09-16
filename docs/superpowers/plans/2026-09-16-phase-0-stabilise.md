# Phase 0 — Make the existing platform trustworthy · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every Phase 0 item in `docs/superpowers/specs/2026-09-16-think5-platform-v2.1-enterprise-scale-prd.md` §18 (and the P0 rows of §3.1) so the current product works end to end, is measurable, and has the safety net (manifest, E2E, visual baseline) that later phases rely on. No new product surface; no feature removed without a tested replacement.

**Architecture:** Strangler pattern on the existing Next 16 app. New shared modules (`lib/api-client.ts`, `lib/interview-credential.ts`, Prisma soft-delete extension, messaging contract, correlation ids) are introduced beside existing code, call sites are migrated behind tests, and legacy paths keep working until the manifest diff and E2E prove parity. Every task is its own PR to `main` behind a flag where behaviour changes.

**Tech stack:** Next.js 16 app router, Prisma 6, Supabase Auth (incl. native MFA), Upstash Redis, Inngest, Playwright, vitest, zod 4, `@vercel/otel` + OTLP → Grafana Cloud, `@node-saml/node-saml`, Greenhouse Harvest API (sandbox).

**Decisions applied (Humza, 2026-09-16):** minimal Greenhouse two-way proof is in Phase 0 (T15); usage metering foundation is in Phase 0, billing UI stays Phase 5 (T16); relay is made safe-to-fail in Phase 0, active multi-region routing stays Phase 4 (T11); Grafana Cloud is the OTLP backend, app stays vendor-neutral via OpenTelemetry (T12); MFA mandatory for Think5 admins and tenant owners/admins, tenant-configurable for recruiters/HMs, optional for candidates (T9); a T0.5 architecture contract precedes all code. Completion is measured by the T14 exit gate and the 7-day observation window, not by a week count.

**Source of truth for defects:** the four audit reports summarised in the v2 PRD §2–§3 and the v2.1 PRD §3.1. Every task starts by re-confirming the defect against current `main` (the PRD requires this because the repo moves quickly).

---

## Ground rules for every task

- Branch per task from `main`; PR title `phase0: <task>`; squash-merge. Never push directly to `main` for code.
- Additive migrations only. No rename/drop/type change.
- Behaviour changes ship behind a flag in `lib/feature-flags.ts` (`FF_P0_*`), default **on** in preview, **off** in production until the task's verification passes in staging.
- Each task ends with: `npx tsc --noEmit` clean, `npm run lint` clean, `npx vitest run` green, the task's Playwright spec green, manifest regenerated and diff reviewed.
- Commit message format: `fix(scope): …` / `feat(scope): …` / `chore(scope): …` per `~/.claude/rules/git-workflow.md`.

## Sequencing (approved structure)

```
T0 preservation ──▶ T0.5 architecture contracts ──▶ T1 CSRF client ──▶ T2 interview credential ──▶ T3 proctoring ──▶ T4 candidate results
                                                          │
                                                          ├──▶ T5 security guards + storage ──▶ T6 soft delete ──▶ T7 Inngest wiring
                                                          ├──▶ T8 messaging contract
                                                          ├──▶ T9 SSO completion + MFA + security settings
                                                          ├──▶ T10 stub elimination / labelling
                                                          ├──▶ T11 relay + Redis safe-to-fail
                                                          ├──▶ T12 correlation ids + OpenTelemetry → Grafana Cloud
                                                          ├──▶ T15 minimal Greenhouse two-way proof
                                                          └──▶ T16 usage metering foundation
T13 hygiene ──▶ T14 staging / rollback / load verification ──▶ 7-day production observation ──▶ Phase 0 sign-off
```

T0 and T0.5 are sequential and come first; T1 and T2 unblock every browser write; T3–T12, T15 and T16 run in parallel by different people. Effort is not a completion promise: Phase 0 ends when T14's gates pass and the observation window is clean.

---

### Task T0: Preservation manifest and CI gates

**Files:**
- Create: `scripts/preservation-manifest.ts`, `docs/preservation/manifest.json`, `docs/preservation/README.md`
- Create: `e2e/golden/` (Playwright specs, see T14 for the list), `e2e/fixtures/`
- Modify: `.github/workflows/eval-gate.yml`, `package.json` (scripts), `playwright.config.ts`

- [ ] **Step 1: Write the manifest generator.** It walks the repo and emits JSON with: page routes (`app/**/page.tsx` → route pattern, role gate from `proxy.ts` `ROUTE_ROLE_MAP` and nearest `ProtectedRoute`), API routes (`app/api/**/route.ts` → path, exported HTTP methods), Prisma models/enums/indexes (parse `prisma/schema.prisma`), Inngest functions (exports of `inngest/functions/index.ts`) and which are registered in `app/api/inngest/route.ts`, Vercel crons (`vercel.json`), feature flags (`lib/feature-flags.ts`), and the interview state machine transitions (`lib/interview-state-machine.ts`).

```ts
// scripts/preservation-manifest.ts (skeleton)
import fs from "node:fs"; import path from "node:path";
const root = process.cwd();
const walk = (dir: string, out: string[] = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); e.isDirectory() ? walk(p, out) : out.push(p); } return out; };
const routeOf = (file: string) => "/" + path.relative(path.join(root, "app"), path.dirname(file)).replace(/\\/g, "/").replace(/\(.+?\)\//g, "").replace(/\/$/, "");
const pages = walk(path.join(root, "app")).filter(f => /\/page\.tsx$/.test(f)).map(f => ({ route: routeOf(f) || "/", file: path.relative(root, f) }));
const apis = walk(path.join(root, "app/api")).filter(f => /\/route\.ts$/.test(f)).map(f => { const src = fs.readFileSync(f, "utf8"); const methods = [...src.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/g)].map(m => m[1]); const reexports = [...src.matchAll(/export const \{ ([A-Z, ]+) \}/g)].flatMap(m => m[1].split(",").map(s => s.trim())); return { route: routeOf(f), file: path.relative(root, f), methods: [...new Set([...methods, ...reexports])] }; });
const schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map(m => ({ name: m[1], fields: [...m[2].matchAll(/^\s+(\w+)\s+([\w\[\]?]+)/gm)].map(f => f[1]), indexes: [...m[2].matchAll(/@@(index|unique)\(([^)]*)\)/g)].map(i => `${i[1]}(${i[2]})`) }));
const enums = [...schema.matchAll(/^enum (\w+) \{([\s\S]*?)^\}/gm)].map(m => ({ name: m[1], values: m[2].trim().split(/\s+/) }));
const inngestIndex = fs.readFileSync(path.join(root, "inngest/functions/index.ts"), "utf8");
const inngestServe = fs.readFileSync(path.join(root, "app/api/inngest/route.ts"), "utf8");
const inngestFns = [...inngestIndex.matchAll(/export \{ (\w+) \}|export const (\w+)/g)].map(m => m[1] || m[2]).filter(Boolean).map(name => ({ name, registered: inngestServe.includes(name) }));
const crons = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8")).crons ?? [];
const flags = [...fs.readFileSync(path.join(root, "lib/feature-flags.ts"), "utf8").matchAll(/FF_[A-Z0-9_]+/g)].map(m => m[0]);
const manifest = { generatedAt: new Date().toISOString(), pages, apis, models, enums, inngest: inngestFns, crons, flags: [...new Set(flags)] };
fs.mkdirSync(path.join(root, "docs/preservation"), { recursive: true });
fs.writeFileSync(path.join(root, "docs/preservation/manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`pages ${pages.length} · apis ${apis.length} · models ${models.length} · inngest ${inngestFns.length} · crons ${crons.length} · flags ${manifest.flags.length}`);
```

- [ ] **Step 2: Add scripts** to `package.json`: `"manifest": "npx tsx scripts/preservation-manifest.ts"`, `"manifest:check": "npx tsx scripts/preservation-manifest.ts && git diff --exit-code docs/preservation/manifest.json"`, `"test:e2e:golden": "playwright test e2e/golden"`.
- [ ] **Step 3: Generate and commit the baseline manifest.** Run `npm run manifest`. Expected: counts printed; `docs/preservation/manifest.json` created (roughly 60 pages, 143 API routes, 55 models, 24 enums, 8 Inngest functions with `registered` flags, 3 crons, 26 flags).
- [ ] **Step 4: Route matrix script.** Create `scripts/route-matrix.sh` that curls every public page from the manifest logged-out and asserts 200, and every role-gated page asserts redirect to `/auth/signin`. Run against `http://localhost:3000`.
- [ ] **Step 5: CI gates.** In `.github/workflows/eval-gate.yml` add steps `npm run lint`, `npx vitest run`, `npm run manifest:check` (fails the PR when the manifest changes without being committed, which forces the diff into review), and `npm run test:e2e:golden` with `EVAL_MOCK_MODE=true` and a mocked voice provider (install Playwright browsers in CI with `npx playwright install --with-deps chromium`).
- [ ] **Step 6: Visual baseline.** Add `e2e/golden/visual.spec.ts` that screenshots: `/dashboard`, `/jobs`, `/jobs/[seeded]`, `/candidates`, `/interviews`, `/candidate/dashboard`, `/interview/[seeded]` (welcome stage) at 1280 and 375, using Playwright `toHaveScreenshot`. Commit the baselines.
- [ ] **Step 7: Commit** `chore(preservation): manifest generator, route matrix, CI gates and visual baseline`.

Acceptance: `npm run manifest:check` passes on a clean tree; CI runs tsc + lint + vitest + golden E2E + manifest check on every PR.

---

### Task T0.5: Architecture contracts (interfaces before implementations)

**Goal:** define the canonical interfaces now so Phase 0 fixes cannot create coupling the enterprise architecture (v2.1 PRD §10) later has to undo. Implementations stay simple; the contracts are what is reviewed.

**Files:**
- Create: `lib/contracts/{entitlements,usage,interview-session-store,ats,avatar,messaging,telemetry,planes}.ts`, `lib/contracts/index.ts`, `lib/contracts/README.md`
- Create: `__tests__/contracts/*.test.ts` (each interface has a `Mock*` implementation and a conformance test any implementation must pass)
- Modify: nothing else in this task; later tasks import from `lib/contracts`

- [ ] **Step 1: `EntitlementService`** — `check(tenantId, feature, quantity?) → { allowed, reason?, remaining? }`, `features` enumerated as a string union (`interview.create`, `interview.avatar_minutes`, `ats.sync`, `api.key`, `seat.recruiter`, …). Phase 0 implementation: `AllowAllEntitlements` with structured logging; T16 wires quotas.
- [ ] **Step 2: `UsageMeter`** — `record(event: UsageEvent)` where `UsageEvent = { id (idempotency key), tenantId, kind, quantity, unit, occurredAt, subjectId, metadata, source }`; append-only, never updated. Kinds: `interview.started|completed`, `ai.tokens`, `avatar.seconds`, `storage.bytes`, `message.sent`, `ats.sync`. Phase 0 implementation writes to a new additive `UsageEvent` table via the outbox (T16).
- [ ] **Step 3: `InterviewSessionStore`** — the authoritative-state boundary from §10.1B: `saveCheckpoint`, `loadLatest`, `lease(interviewId, ownerId, ttl)`, `renewLease`, `release`, with an explicit `Durability = "postgres" | "postgres+redis"` result on every write. Phase 0 implementation wraps the existing `lib/session-store.ts` (Redis) and `InterviewerStateSnapshot` (Postgres) so Redis loss is a durability downgrade, not a failure (T11).
- [ ] **Step 4: `ATSAdapter`** — `connect(config)`, `listJobs(since?)`, `getCandidate(id)`, `upsertCandidate(candidate)`, `attachInterviewReport(candidateId, report)`, `verifyWebhook(req)`, `parseWebhook(body) → ATSEvent[]`, plus `capabilities()` so the UI can grey out unsupported actions. Idempotency key on every write. Phase 0 implementation: Greenhouse (T15) behind this interface; existing `lib/ats/*` clients are adapted, not rewritten.
- [ ] **Step 5: `AvatarProvider`** — `createSession({ interviewId, likenessId, language, audioSource }) → { sessionId, transport: "webrtc" | "none", degraded: boolean }`, `feedAudio`, `interrupt`, `end`, `health()`. Phase 0 implementation: `NoAvatar` (returns `transport: "none"`) so the room can be coded against the interface before a vendor is chosen in Phase 2.
- [ ] **Step 6: `MessageProvider`** — channel abstraction over in-app, email and SMS: `send(message) → { providerId, state }`, `status(providerId)`, `inboundWebhook(req)`. Phase 0 implementation: in-app (T8) and Resend email; SMS `NotImplemented` with a typed error.
- [ ] **Step 7: `Telemetry`** — `startSpan(name, attrs)`, `counter`, `histogram`, `withContext({ requestId, interviewId, tenantId })`; backed by OpenTelemetry (T12). Every other contract receives a `Telemetry` instance rather than importing a logger directly.
- [ ] **Step 8: `planes.ts`** — documents the control-plane / media-plane boundary as types: what the control plane owns (state machine, plan version, ledger, evidence refs, leases, tenant policy) and what the media plane may hold (transient audio/video, avatar session ids). A lint rule (`no-restricted-imports`) prevents `relay/**` and avatar code from importing Prisma.
- [ ] **Step 9: Conformance tests** for each interface (mock impl passes; a deliberately broken impl fails), committed with the contracts.
- [ ] **Step 10: Commit** `feat(contracts): canonical interfaces for entitlements, usage, session store, ATS, avatar, messaging, telemetry and plane boundaries`.

Acceptance: every later Phase 0 task that touches these areas imports from `lib/contracts`; the manifest lists the contracts and their implementations.

---

### Task T1: One CSRF strategy, one API client

**Re-confirm:** `grep -rn "x-csrf-token" app components hooks contexts lib` returns only `app/api/admin/interviews/bulk-invite-csv/route.ts`. Any browser POST to `/api/jobs` returns 403.

**Files:**
- Create: `lib/api-client.ts`, `__tests__/lib/api-client.test.ts`, `eslint-rules/no-raw-api-fetch.js` (or an `no-restricted-syntax` entry in `eslint.config.mjs`)
- Modify: `proxy.ts` (exemption list), all 78 client files that call `fetch("/api…")` (list with `grep -rln "fetch(\s*[\`'\"]/api" app components hooks contexts | grep -v "^app/api"`)

- [ ] **Step 1: Failing test** for the client: it must read the `csrf-token-client` cookie and set `x-csrf-token` on non-GET requests, pass through GET untouched, and throw a typed `ApiError` with `status` and parsed `error` body on non-2xx.

```ts
// __tests__/lib/api-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "@/lib/api-client";
describe("api client", () => {
  beforeEach(() => { Object.defineProperty(document, "cookie", { value: "csrf-token-client=abc123", writable: true }); global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as any; });
  it("adds the CSRF header on POST", async () => { await api.post("/api/jobs", { title: "x" }); const [, init] = (fetch as any).mock.calls[0]; expect(init.headers["x-csrf-token"]).toBe("abc123"); expect(init.method).toBe("POST"); });
  it("does not add it on GET", async () => { await api.get("/api/jobs"); const [, init] = (fetch as any).mock.calls[0]; expect(init.headers?.["x-csrf-token"]).toBeUndefined(); });
  it("throws ApiError with status and body", async () => { (fetch as any).mockResolvedValueOnce(new Response(JSON.stringify({ error: "nope" }), { status: 403 })); await expect(api.post("/api/jobs", {})).rejects.toMatchObject({ status: 403, message: "nope" }); });
});
```

- [ ] **Step 2: Implement `lib/api-client.ts`.**

```ts
"use client";
export class ApiError extends Error { constructor(public status: number, message: string, public body?: unknown) { super(message); } }
const csrf = () => document.cookie.split("; ").find(c => c.startsWith("csrf-token-client="))?.split("=")[1] ?? "";
async function request<T>(method: string, url: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  if (method !== "GET" && method !== "HEAD") headers["x-csrf-token"] = csrf();
  const res = await fetch(url, { ...init, method, headers, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body), credentials: "same-origin" });
  const text = await res.text(); let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? res.statusText, data);
  return data as T;
}
export const api = { get: <T>(u: string, i?: RequestInit) => request<T>("GET", u, undefined, i), post: <T>(u: string, b?: unknown, i?: RequestInit) => request<T>("POST", u, b, i), put: <T>(u: string, b?: unknown, i?: RequestInit) => request<T>("PUT", u, b, i), patch: <T>(u: string, b?: unknown, i?: RequestInit) => request<T>("PATCH", u, b, i), delete: <T>(u: string, b?: unknown, i?: RequestInit) => request<T>("DELETE", u, b, i) };
```

- [ ] **Step 3: Run the test** → PASS.
- [ ] **Step 4: Migrate call sites.** Convert every client-side `fetch("/api…", { method: "POST"|"PUT"|"PATCH"|"DELETE" })` to `api.<method>()`. GETs may stay as `fetch` this phase. Do it file by file with a checklist in the PR description; the 78-file list is the checklist. `sendBeacon` calls in `hooks/useVoiceInterview.ts` are token-authenticated and exempt; leave them.
- [ ] **Step 5: Proxy exemptions.** In `proxy.ts` add to `CSRF_EXEMPT_PATTERNS`: `/^\/api\/auth\/(register|forgot-password|reset-password|verify)$/` (pre-session, rate-limited, no cookie yet) and `/^\/api\/auth\/sso\/callback/` (IdP POST binding). Also move `applyRateLimit` **before** the `TOKEN_AUTH_PATTERNS` early return so voice/recording/proctoring endpoints get the configured 60/min limit.
- [ ] **Step 6: Lint rule.** Add a `no-restricted-syntax` selector that errors on `CallExpression[callee.name="fetch"] > Literal[value=/^\/api/]` in `app/(dashboard)`, `app/candidate`, `app/admin`, `app/auth`, `components`, `hooks`, `contexts`, with an exception comment for GET-only files migrated later.
- [ ] **Step 7: E2E** `e2e/golden/writes.spec.ts`: sign in as seeded recruiter → create job via UI → assert 201 and the job appears; as candidate → update profile → assert saved.
- [ ] **Step 8: Commit** `fix(csrf): single API client that satisfies the proxy CSRF contract; rate-limit token-auth routes`.

Acceptance: route matrix + writes E2E green; no 403 CSRF errors in Sentry for 24h in staging.

---

### Task T2: Interview credential resolver (invite → accept → room golden path)

**Re-confirm:** `app/interview/accept/page.tsx` pushes `/interview/${id}` without a token; `app/api/interviews/[id]/voice-init/route.ts` returns 400 when `accessToken` is empty; only `validate/route.ts` reads the `interview-session` cookie.

**Files:**
- Create: `lib/interview-credential.ts`, `__tests__/lib/interview-credential.test.ts`
- Modify: `app/api/interviews/[id]/{voice-init,voice,voice/turn-commit,voice/recover,voice/fragment,voice/context,voice/context-capsule,pause,recording,proctoring,screen-capture,validate,report-status,report-stream,consent}/route.ts`, `app/interview/[id]/page.tsx`, `hooks/useVoiceInterview.ts` (send credential consistently)

- [ ] **Step 1: Failing tests** for `resolveInterviewCredential(req, interviewId)`: returns `{ token, source: "cookie" }` when the `interview-session` cookie is `${id}:${token}` for that id; returns `{ token, source: "header" }` for `Authorization: Bearer`; `{ token, source: "body" }` for `accessToken` in JSON; `{ token, source: "query" }` for `?token=`; returns `null` when none match or the cookie is for another interview.
- [ ] **Step 2: Implement** the resolver (pure function over `NextRequest` + parsed body) and `assertInterviewCredential(interview, cred)` that compares against `interview.accessToken`, checks `accessTokenExpiresAt`, and returns 401 `NextResponse` on failure.
- [ ] **Step 3: Apply** in every route listed above, replacing the ad-hoc token reads. Keep accepting raw tokens (backward compatible).
- [ ] **Step 4: Room page.** In `app/interview/[id]/page.tsx`, stop defaulting `accessToken` to `""`; treat "no token in URL" as "cookie mode". The hook must send no `accessToken` field in that mode (server resolves from cookie). Feature flag `FF_P0_COOKIE_INTERVIEW_AUTH` (default on).
- [ ] **Step 5: Cookie hardening.** In `app/api/interviews/accept/route.ts` set the cookie `path` to `/` (needed for `/api/interviews/...` and `/interview/...`), `sameSite: "lax"` (the accept page navigates from an email link), 2h max age unchanged. Add a `POST /api/interviews/[id]/session/refresh` that re-issues the cookie while the interview is `IN_PROGRESS` (called by the hook every 30 minutes; the 2h relay JWT already exists).
- [ ] **Step 6: E2E** `e2e/golden/invite-to-report.spec.ts`: recruiter creates interview + invite (API), open the accept link, accept, readiness (mock `getUserMedia`), consent, welcome → room mounts and `voice-init` returns 200 with the mocked provider (`EVAL_MOCK_MODE`), end interview → report status reaches `REPORT_READY` (mock scorer) → recruiter opens `/interviews/[id]/report` → candidate opens `/candidate/interviews/[id]/report`.
- [ ] **Step 7: Commit** `fix(interview): resolve interview credentials from cookie, header, body or query on every interview route`.

Acceptance: golden path E2E green on voice (mocked) and text paths; no 400 from `voice-init` in staging logs.

---

### Task T3: Persist proctoring and integrity events on the voice path

**Re-confirm:** `hooks/useProctoring.ts` keeps events in React state; `Interview.integrityEvents` is written only in `app/api/interviews/[id]/stream/route.ts`; `voice/route.ts` `end_interview` reads it and finds nothing.

**Files:**
- Modify: `hooks/useProctoring.ts`, `app/interview/[id]/page.tsx`, `app/api/interviews/[id]/proctoring/route.ts`, `app/api/interviews/[id]/voice/route.ts`
- Tests: `__tests__/api/proctoring-voice-persistence.test.ts`, extend `e2e/golden/invite-to-report.spec.ts`

- [ ] **Step 1: Failing test:** posting a batch of events to `/api/interviews/[id]/proctoring` with the session cookie persists `ProctoringEvent` rows and appends to `Interview.integrityEvents`; `end_interview` computes an integrity score < 100 when a `tab_switch` event exists.
- [ ] **Step 2: Hook batching.** In `useProctoring`, keep the local state, add an outbox flushed every 10 s and on `pagehide` via `api.post` (T1) or `navigator.sendBeacon` with the cookie credential. Payload: `{ events: [{ type, severity, at, meta }] }`, idempotency key per event (`${interviewId}:${type}:${at}`).
- [ ] **Step 3: API.** Extend the proctoring route to accept batches (zod schema, max 200 per request), dedupe on the idempotency key, write `ProctoringEvent` rows and append to `integrityEvents` in one transaction. Rate limit 30/min per interview stays.
- [ ] **Step 4: `end_interview`.** In `voice/route.ts`, read `ProctoringEvent` rows for the interview (not only the JSON column) before `persistProctoringEvents`; keep the text path unchanged.
- [ ] **Step 5: Accommodations.** While in this file: forward the `accommodations` object collected by `WelcomeScreen` to `POST /api/interviews/[id]/validate` and persist on `Interview.accommodations`; apply `extendedTime` (+25% duration) and `textOnly` (force text mode) in the room. Small, and closes an audit item.
- [ ] **Step 6: Commit** `fix(proctoring): persist voice-path integrity events and apply accommodations`.

Acceptance: E2E asserts a `tab_switch` triggered in the room appears in the report's integrity section.

---

### Task T4: Real candidate results

**Files:**
- Delete: `app/candidate/interview/results/[id]/page.tsx`
- Modify: `app/api/candidate/interviews/[id]/report/route.ts`, `components/interview/InterviewRoom.tsx` (route target) or, preferably, `app/candidate/interview/[id]/page.tsx` → redirect to `/interview/[id]`

- [ ] **Step 1: Failing test:** candidate report route returns the report for an interview whose `candidate.supabaseUserId` (via `Candidate` ownership) matches the session user, regardless of `invitedEmail`.
- [ ] **Step 2: Fix ownership lookup** (`candidateId` join, not `invitedEmail`). Respect `candidateReportPolicy` from the template snapshot (strengths-only vs full).
- [ ] **Step 3: Replace the mock page** with a server redirect to `/candidate/interviews/[id]/report`; keep the old URL working (301) so bookmarks don't break.
- [ ] **Step 4: Retire the duplicate room** by redirecting `/candidate/interview/[id]` to `/interview/[id]` behind `FF_P0_SINGLE_INTERVIEW_ROOM`. Do **not** delete `components/interview/InterviewRoom.tsx` this phase (preservation contract: remove later after observation).
- [ ] **Step 5: Commit** `fix(candidate): real interview results and single interview room`.

---

### Task T5: Security guards, cron auth, private storage, admin audit

**Files:** `app/api/admin/{compliance-report,continuity-scorecard,proctoring-events}/route.ts`, `app/api/cron/{fragment-cleanup,retention,retention-purge}/route.ts`, `vercel.json`, `supabase/migrations/20260916_private_buckets.sql`, `lib/asset-store.ts`, `app/api/candidates/[id]/resume/route.ts` and readers of resume URLs, `app/api/admin/users/[id]/route.ts`

- [ ] **Step 1:** `requireRole(["admin"])` on the three admin routes; tests assert 403 for recruiter.
- [ ] **Step 2:** One `requireCronSecret(req)` helper (401 unless `Authorization: Bearer ${CRON_SECRET}` and the env var is set); apply to all four crons; change `retention-purge` to GET and fix it to real fields (`status: { in: ["COMPLETED","CANCELLED","EXPIRED"] }`, add `piiPurgedAt DateTime?` to `Candidate` via additive migration); schedule it in `vercel.json` at `30 3 * * *`.
- [ ] **Step 3:** Storage: migration sets `resumes` and `photos` buckets `public = false` and replaces the public-read policies with authenticated owner/recruiter policies; `lib/asset-store.ts` drops `ACL: "public-read"`; resume and photo readers use `createSignedUrl(…, 3600)`. Add `GET /api/candidates/[id]/resume` that returns a signed URL for authorised users; update `app/(dashboard)/candidates/[id]/resume/page.tsx` to use it.
- [ ] **Step 4:** Admin user changes write `ActivityLog` via `logActivity("admin.user_updated", …)` with before/after.
- [ ] **Step 5: Commit** `fix(security): guard admin and cron routes, private storage with signed URLs, audit admin user changes`.

---

### Task T6: Enforce soft delete

**Files:** `lib/prisma.ts`, `__tests__/lib/soft-delete.test.ts`, `prisma/schema.prisma` (no change), docs comment fix

- [ ] **Step 1: Failing tests** with the mock Prisma helper: `findMany`/`findFirst`/`findUnique`/`count` on `Candidate`, `Interview`, `InterviewReport` add `deletedAt: null` unless `includeDeleted: true` is passed; `delete`/`deleteMany` become `update`/`updateMany` setting `deletedAt`.
- [ ] **Step 2: Implement** with `prisma.$extends({ query: { $allModels: { … } } })` restricted to the three models (from the manifest), and a `prismaRaw` export for admin retention jobs that must hard-delete after the retention window.
- [ ] **Step 3: Sweep** callers that intentionally hard delete (`app/(dashboard)/candidates/actions.ts`, retention enforcement, DSAR execution) to use `prismaRaw` where legal deletion is required.
- [ ] **Step 4: Commit** `fix(data): enforce soft delete for Candidate, Interview and InterviewReport`.

---

### Task T7: Background job wiring

**Files:** `app/api/inngest/route.ts`, `inngest/functions/index.ts`, `inngest/functions/webhook-retry.ts` (new), `lib/webhook-delivery.ts`, `inngest/functions/{recording-process,recording-finalize-retry}.ts`, `app/api/interviews/[id]/recording/route.ts`

- [ ] **Step 1:** Register `updateAriaMemoryGraph` in `serve()`; the manifest's `registered:false` count must drop to zero.
- [ ] **Step 2:** Create `webhookRetry` Inngest function consuming `webhook/retry` with 1/5/30-minute backoff; remove the `setTimeout` fallback in `lib/webhook-delivery.ts`.
- [ ] **Step 3:** Recording jobs: on `finalize` in the recording route, `inngest.send("interview/recording.ready")` so `recordingProcess` has a producer; implement `check_gaps` by listing R2 chunk keys (`ListObjectsV2` on the interview prefix) and returning the missing indices.
- [ ] **Step 4:** Remove the duplicate daily retention: keep the Inngest `retentionCleanup` cron, delete the Vercel `/api/cron/retention` entry (keep the route for manual runs, behind cron secret).
- [ ] **Step 5: Commit** `fix(jobs): register memory graph, durable webhook retry, recording pipeline producer, gap check`.

---

### Task T8: Canonical messaging contract

**Files:**
- Create: `lib/messaging/contract.ts` (zod schemas + TS types), `app/api/messaging/conversations/route.ts` (GET list, POST create-or-get by participant), `app/api/messaging/conversations/[id]/messages/route.ts` (GET paginated, POST send), `app/api/messaging/conversations/[id]/read/route.ts` (POST), `__tests__/api/messaging.test.ts`
- Modify: `app/api/messages/route.ts` (adapter delegating to the new handlers, marked `@deprecated` with a Sunset header), `app/(dashboard)/messaging/page.tsx`, `app/candidate/messaging/page.tsx`
- Schema: additive `Conversation` model (id, participantAId/Role, participantBId/Role, lastMessageAt, tenant id) + `conversationId` FK on `Message`; backfill script `scripts/backfill-conversations.ts` derived from the existing sorted-id convention.

- [ ] **Step 1: Failing tests** for list, create-or-get, send, paginate, read receipt, and authorisation (a user can only see conversations they participate in).
- [ ] **Step 2: Implement** the contract and routes; delivery state `sent|delivered|read`; SSE at `GET /api/messaging/stream` reusing `lib/notification-pubsub.ts` so both pages update without polling (Supabase Realtime is a Phase 3 option).
- [ ] **Step 3: Migration + backfill** (expand → dual-write → backfill → verify → switch reads). The old route keeps working through the adapter.
- [ ] **Step 4: Repoint both pages** to the new routes via `api` client; remove local field guesses (`participantName`, `c.messages`).
- [ ] **Step 5: E2E** `e2e/golden/messaging.spec.ts`: recruiter sends, candidate sees it and replies, read receipt shown.
- [ ] **Step 6: Commit** `feat(messaging): canonical conversation contract with adapter for the legacy route`.

---

### Task T9: SSO session completion, MFA, real security settings

**Files:** `app/api/auth/sso/callback/route.ts`, `lib/sso/saml-provider.ts` (replace with `@node-saml/node-saml`), `app/auth/verify/page.tsx` (consume `token_hash`), `app/auth/signin/page.tsx` (SSO entry + `redirectTo` + `reason`), `app/auth/error/page.tsx` (new), `app/api/auth/mfa/{enroll,verify,challenge}/route.ts` (new, thin wrappers over Supabase `auth.mfa.*`), `components/auth/MfaGate.tsx` (new), `app/(dashboard)/settings/security/page.tsx`, `app/api/account/{password,delete,sessions}/route.ts` (new), `app/api/candidate/settings/route.ts` (add DELETE delegating to the same deletion request flow)

- [ ] **Step 1:** SSO callback uses `createSupabaseAdminClient()` for admin APIs; finish by redirecting to `/auth/verify?token_hash=…&type=magiclink` **and** make the verify page call `supabase.auth.verifyOtp({ token_hash, type: "magiclink" })`, then route by role. Add `/auth/error`. Tests with mocked OIDC discovery; SAML via `@node-saml/node-saml` `validatePostResponseAsync` (signature, digest, conditions, audience, `InResponseTo` from the stored request id).
- [ ] **Step 2:** MFA using Supabase native TOTP: enrol (QR + recovery codes stored hashed in a new additive `MfaRecoveryCode` table), challenge on sign-in when `aal1`. **Policy:** mandatory for Think5 `admin` and for tenant owners/admins (additive `Recruiter.isTenantAdmin` boolean; the first recruiter who creates a company becomes owner); tenant-configurable for other recruiters and hiring managers (`GovernancePolicy.requireMfa` additive boolean, default off); optional for candidates. Enforcement is server-side in `requireRole` / `requireApprovedAccess` (reject `aal1` where required) and mirrored in `ProtectedRoute`. Leaves room for org-wide "MFA or SSO required" in Phase 3.
- [ ] **Step 3:** Security settings page: password change via `supabase.auth.updateUser`, sessions list via `auth.admin.listUserSessions` proxied through `/api/account/sessions`, revoke, delete account → creates a `DataDeletionRequest` (reuse the candidate flow for recruiters).
- [ ] **Step 4:** Sign-in page honours `redirectTo` and shows the `reason=account_suspended|deactivated` message; adds "Continue with SSO" (email → `/api/auth/sso?action=check`).
- [ ] **Step 5: Commit** `feat(identity): complete SSO sessions, native MFA, real security settings`.

---

### Task T10: Eliminate or label every visible stub (no dead-end UI)

Classify each item as **Implement**, **Read-only with explanation**, or **Remove from nav**. Phase 0 choices:

| Surface | Decision | Change |
|---|---|---|
| Settings → notifications | Implement | `GET/PUT /api/account/notification-preferences` on the existing `NotificationPreference` model; page loads and saves |
| Settings → API keys | Implement (minimal) | Additive `ApiKey` model (hashed key, prefix, scopes, lastUsedAt, revokedAt); `POST/GET/DELETE /api/account/api-keys`; `lib/api-key-auth.ts` for `/api/v1/*` Bearer auth |
| Settings → Profile link | Fix | Point to a new `/settings/profile` that edits the `Recruiter` row |
| Candidates list Save / Add to project / Hide | Remove from UI this phase | Buttons removed; tracked as Phase 1 CRM |
| Source page Invite | Implement | Wire the existing unused `components/recruiter/InvitationModal.tsx` to `POST /api/passive-profiles/[id]/invite` |
| Clients "View Matches", `/clients/[id]/roles/new` | Implement | Matches link → `/jobs?clientId=`; Add Role opens the existing "Add Role" dialog |
| `/admin/hm-memberships` `/api/companies` | Fix | Use `/api/clients` |
| `/interviews/[id]` | Implement | Server redirect to `/interviews/[id]/report` |
| Global `/pipeline` | Read-only with explanation | Remove drag affordances; badge "Read-only overview, drag on a role's pipeline" until Phase 1 |
| Talent pools | Read-only with explanation | Cards not clickable; note "Detail view arrives with Talent CRM" |
| Candidate detail Activity / Emails tabs | Implement Activity, remove Emails from nav | Activity reads `ActivityLog` for the candidate; Emails returns in Phase 3 |
| Career tools "coming soon" cards | Remove from nav | Keep Resume Builder link only |
| Practice page | Link it | Add to candidate sidebar |
| `/candidate/policy` retention numbers | Fix | New public-safe `GET /api/candidate/retention-summary` |
| Mobile sidebar | Fix | Generate from the same nav config as desktop |
| Logo marks "P" / "T5" | Fix | Use `LogoMark` everywhere (Phase 1 does the full shell) |

- [ ] One PR per row or grouped by area; each with a Playwright assertion that the control works or is absent.
- [ ] **Commit** `fix(ui): no dead-end controls — implement, label read-only, or remove`.

---

### Task T11: Relay and Redis safe-to-fail (present topology)

Scope per decision 3: make the current single-region relay safe enough to fail without interview-state loss. Active multi-region routing, affinity and evacuation remain Phase 4.

**Files:** `lib/rate-limit.ts`, `lib/concurrent-session-limiter.ts`, `lib/session-store.ts` (wrapped by the `InterviewSessionStore` contract from T0.5), `app/api/interviews/[id]/voice-init/route.ts`, `hooks/useVoiceInterview.ts`, `relay/server.ts`, `relay/fly.toml`, `lib/metrics.ts`, `.env.example`, `docs/ops/regional-failure.md` (new)

- [ ] **Step 1:** Rate limiter and concurrency limiter: on Redis error, fail **open** with the in-memory fallback and increment `redis_degraded_total`; log once per minute. (Interview integrity gates are unaffected; they are Postgres-backed.)
- [ ] **Step 2:** Session store: authoritative checkpoint state is already mirrored in Postgres (`InterviewerStateSnapshot`, canonical ledger). Make `assertDurableStore()` return a status instead of throwing; when Redis is down, `voice-init` proceeds with `durability: "postgres-only"`, the room shows a non-blocking "reduced resilience" banner, and reconnect uses `tryRestoreSession` from Postgres (already implemented).
- [ ] **Step 3:** Ensure `UPSTASH_REDIS_REST_URL/TOKEN` are set in Vercel production and preview (they are absent from `.env` today); add a startup check that reports, not crashes.
- [ ] **Step 4:** Drain and reconnect: the hook handles `relay.draining` by pre-emptively reconnecting through the existing recovery state machine before the socket closes; the relay's `kill_timeout` is raised above its drain window (15s → 25s) so no session is cut mid-drain.
- [ ] **Step 5:** Provider timeouts and health: explicit connect/response timeouts on the Gemini Live setup and on `voice-init`; relay `/health` includes Gemini reachability and buffer pressure; Vercel `/api/health` includes relay reachability per region (already partly there) and surfaces a `voice: degraded|down` status consumed by the room to show queueing/text fallback instead of a hard error.
- [ ] **Step 6:** Session recovery test: kill the relay machine during an interview in staging (Fly `machine stop`) → client reconnects to the surviving machine → `recover` rebuilds from the ledger → transcript intact. Automate as a chaos test with the mocked provider in `__tests__/chaos/`.
- [ ] **Step 7:** Chaos test: Redis client rejects → interview still starts and completes on the mocked provider with `durability: "postgres"`.
- [ ] **Step 8:** Write `docs/ops/regional-failure.md`: exactly what happens today when `iad` is lost (voice unavailable, text mode available, no state loss), the manual failover runbook, and the Phase 4 target. This closes the §3.1 "multi-region" row for Phase 0 as *documented and safe-to-fail*, not *multi-region*.
- [ ] **Commit** `fix(resilience): relay drain/reconnect, provider timeouts, health, and Redis loss as a durability downgrade`.

---

### Task T12: Correlation ids and OpenTelemetry foundation

**Files:** `instrumentation.ts`, `lib/otel.ts` (new), `proxy.ts`, `lib/logger.ts`, `relay/server.ts`, `hooks/useVoiceInterview.ts`, `package.json` (`@vercel/otel`, `@opentelemetry/api`)

- [ ] **Step 1:** `registerOTel({ serviceName: "think5-web" })` in `instrumentation.ts` exporting traces and metrics over OTLP to **Grafana Cloud** (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` with the Grafana Cloud token); the relay uses the Node OTel SDK with the same exporter and `serviceName: "think5-relay"`. Sentry stays for error capture only and links to traces via the `trace_id` attribute. No proprietary APM SDK anywhere; the `Telemetry` contract from T0.5 is the only import surface.
- [ ] **Step 1b:** Grafana dashboards committed as JSON in `docs/ops/grafana/`: web (route latency/error), relay (connections, reconnects, buffer overflow, drain), queues (Inngest lag, retries, DLQ), AI providers (latency, error rate, tokens, cost), interview (start p95, turn-commit p99, completion rate, degraded-mode rate). Logs via OTLP are a follow-up once the collector is in place.
- [ ] **Step 2:** `proxy.ts` sets `x-request-id` (uuid) if absent and echoes it on responses; `lib/logger.ts` includes `requestId`, `interviewId`, `tenantId` in every structured log line.
- [ ] **Step 3:** The relay reads `traceparent`/`x-request-id` from the WS handshake query, includes it in logs and Sentry scope, and forwards it in control frames so the browser can show a support id.
- [ ] **Step 4:** The room displays a "Support ID" (interviewId + short request id) on the error card.
- [ ] **Commit** `feat(observability): request ids and OpenTelemetry across web, relay and room`.


---

### Task T15: Minimal Greenhouse two-way proof (framework validation)

Narrow by design: one ATS, sandbox only, enough to prove the `ATSAdapter` contract, idempotency, reconciliation and error handling end to end. Other ATSs are Phase 3.

**Files:**
- Create: `lib/ats/adapters/greenhouse.ts` (implements `ATSAdapter` using the existing `lib/ats/greenhouse.ts` client), `app/api/integrations/greenhouse/webhook/route.ts` (uses the existing `verifyGreenhouseWebhook`), `app/api/integrations/[provider]/{connect,sync,status}/route.ts`, `inngest/functions/ats-sync.ts` (per-integration concurrency key, idempotent), `app/(dashboard)/settings/integrations/page.tsx` (connect with API key, sync status, reconciliation table), `__tests__/ats/greenhouse.test.ts` (recorded fixtures)
- Schema (additive): `ATSSyncRun` (integrationId, direction, startedAt, finishedAt, counts, errors Json), `ATSEntityLink` (integrationId, localType, localId, remoteId, remoteUpdatedAt, lastSyncedAt, checksum; @@unique(integrationId, localType, localId) and (integrationId, remoteId))

- [ ] **Step 1:** Connect: recruiter enters a Greenhouse Harvest API key (sandbox) on the integrations page; stored with the existing AES-GCM helper in `ATSIntegration.apiKey`; `status` shows last sync and errors.
- [ ] **Step 2:** Import jobs: `ats-sync` pulls open jobs, creates/updates `Job` rows linked via `ATSEntityLink`, never duplicates (checksum + remoteUpdatedAt).
- [ ] **Step 3:** Push candidate: when a candidate is added to a linked job's pipeline, upsert the Greenhouse candidate + application with an idempotency key; store the remote id.
- [ ] **Step 4:** Push interview report: on `REPORT_READY`, attach a summary note and a link to the share-gated report to the Greenhouse application (Harvest `notes`/`attachments`).
- [ ] **Step 5:** Inbound webhook: Greenhouse `candidate_stage_change` and `job_updated` events verified with the existing signature helper, deduped by delivery id, applied through the adapter, recorded in `ATSSyncRun`.
- [ ] **Step 6:** Reconciliation UI: table of links with local vs remote state, mismatches flagged, "retry" and "unlink" actions; rate-limit handling with backoff on 429.
- [ ] **Step 7:** Metering hook: each sync emits `ats.sync` usage events (T16).
- [ ] **Step 8:** E2E against the sandbox in a nightly job (not per-PR): connect → import → push → webhook → reconcile.
- [ ] **Commit** `feat(ats): Greenhouse two-way integration proving the ATSAdapter contract`.

Acceptance: the loop above passes in the sandbox nightly for five consecutive runs; the reconciliation table shows zero unexplained mismatches.

---

### Task T16: Usage metering foundation (no billing UI)

Establishes the architecture so customer usage is never retrofitted: immutable usage events, tenant aggregation, an entitlement interface and quota primitives. Checkout, invoices, subscriptions and pricing UI remain Phase 5.

**Files:**
- Schema (additive): `UsageEvent` (id = idempotency key, tenantId, kind, quantity Decimal, unit, occurredAt, subjectType, subjectId, source, metadata Json; indexes on (tenantId, kind, occurredAt)); `UsageAggregate` (tenantId, kind, period `day|month`, periodStart, quantity; @@unique(tenantId, kind, period, periodStart)); `TenantQuota` (tenantId, feature, limit, window, action `warn|block`)
- Create: `lib/usage/meter.ts` (implements `UsageMeter`; writes through the Inngest outbox so an event is never lost when the DB write and the emit disagree), `lib/usage/aggregate.ts` (Inngest function rolling events into aggregates hourly, idempotent), `lib/entitlements/service.ts` (implements `EntitlementService`: reads `TenantQuota` + `UsageAggregate`; `warn` logs and continues, `block` returns a structured 402/429), `app/api/admin/usage/route.ts` (read model for admin), `__tests__/usage/*.test.ts`
- Modify (emit points): `app/api/interviews/route.ts` and `accept/route.ts` (`interview.started`), `voice/route.ts` `end_interview` (`interview.completed`, duration), `lib/ai-usage.ts` (`ai.tokens` with model and cost, replacing the ad-hoc `AIUsageLog` write with a dual write this phase), `AvatarProvider` call sites (`avatar.seconds`, zero until Phase 2), recording finalize (`storage.bytes`), T8 send (`message.sent`), T15 sync (`ats.sync`)

- [ ] **Step 1:** Contract conformance tests from T0.5 pass for `PrismaUsageMeter` and `QuotaEntitlementService`.
- [ ] **Step 2:** Emit points wired behind `FF_P0_USAGE_METERING` (default on); idempotency keys derived from the subject (`interview:{id}:completed`), so retries never double-count.
- [ ] **Step 3:** Replace the per-company `monthlyAiBudgetUsd` check in interview creation with `EntitlementService.check(tenantId, "interview.create")` reading the same value through a `TenantQuota` row (backfilled from `Client.monthlyAiBudgetUsd`), keeping behaviour identical.
- [ ] **Step 4:** Admin read model: per-tenant usage by kind for the current month with cost-per-interview derived from `ai.tokens` and `avatar.seconds`.
- [ ] **Step 5:** Backfill script for historical interviews and `AIUsageLog` into `UsageEvent` (bounded batches, resumable).
- [ ] **Commit** `feat(usage): immutable usage events, tenant aggregates, entitlement service and quota primitives`.

Acceptance: every interview in staging produces exactly one `started` and one `completed` event under retries and reconnects; the admin usage view matches `AIUsageLog` totals within 1%.

---

### Task T13: Repository hygiene

- [ ] Delete `test-gemini-ws.mjs`, `test-gemini.js`, `test-bbox.ts`, `test-company-api.js`, `test-fresh-linkedin.js`, `test-rockapis.js`; move `Ai-Interview` and `Project-info` into `docs/legacy/`.
- [ ] Rewrite `README.md` from the manifest: stack, services (Vercel, Supabase, Upstash, Inngest, Fly relay, R2), local setup, scripts, testing, deploy.
- [ ] Remove `console.log` of the setup message and prompt fragments in `voice-init`, `useVoiceInterview`, `relay/server.ts` (use `logger.debug`).
- [ ] **Commit** `chore: remove scratch files, rewrite README, quiet prompt logging`.

---

### Task T14: Phase 0 exit gate

Run and record in `docs/preservation/phase-0-exit.md`:

- [ ] `npm run manifest:check` clean; manifest diff since baseline reviewed and every removed item justified (expect none removed).
- [ ] Golden E2E suite green: `auth.spec` (signup → verify → onboarding → approval), `invite-to-report.spec`, `pipeline.spec` (kanban move persists), `share-link.spec` (email gate), `messaging.spec`, `admin-approval.spec`, `writes.spec`, `visual.spec`.
- [ ] Route matrix green against staging.
- [ ] `npx vitest run` green including new tests; `eval` harness `overallPassed`.
- [ ] k6 `load-tests/concurrent-interviews.js` standard scenario within thresholds on staging (baseline number recorded).
- [ ] Rollback exercised: revert the T8 messaging cutover flag in staging and confirm the legacy route still serves; revert `FF_P0_USAGE_METERING` and confirm interview creation still works.
- [ ] Relay chaos passed in staging (T11 step 6) and `docs/ops/regional-failure.md` reviewed.
- [ ] Greenhouse sandbox nightly (T15) green for five consecutive runs.
- [ ] Contract conformance tests (T0.5) green for every production implementation.
- [ ] Grafana dashboards show web, relay, queue, provider and interview panels populated from staging traffic.
- [ ] 7-day observation window in production with all `FF_P0_*` flags on: no rise in 4xx/5xx, no drop in interview completion, no CSRF 403s.
- [ ] Owner sign-off (Humza) recorded.

---

## Resolved scoping decisions (2026-09-16)

1. **ATS**: minimal Greenhouse two-way proof is in Phase 0 as T15 (sandbox only; other ATSs in Phase 3). Needs a Greenhouse sandbox account before T15 starts.
2. **Billing**: usage metering foundation is in Phase 0 as T16; checkout, invoices, subscriptions and pricing UI are Phase 5.
3. **Multi-region**: Phase 0 makes the present relay safe-to-fail (T11: Redis degradation, drain/reconnect, no state loss, health, recovery, provider timeouts, documented regional-failure behaviour). Active multi-region routing, affinity and evacuation are Phase 4. The v2.1 PRD §3.1 and §18 wording has been aligned to this.
4. **Observability**: Grafana Cloud over OTLP; application stays vendor-neutral through OpenTelemetry; Sentry remains for error capture only.
5. **MFA**: mandatory for Think5 admins and tenant owners/admins; tenant-configurable for recruiters and hiring managers; optional for candidates; org-wide "MFA or SSO" enforcement in Phase 3.

Phase 0 completion is defined by T14 plus the 7-day observation window, not by calendar time.
