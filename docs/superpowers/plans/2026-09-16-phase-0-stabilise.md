# Phase 0 — Make the existing platform trustworthy · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every Phase 0 item in `docs/superpowers/specs/2026-09-16-think5-platform-v2.1-enterprise-scale-prd.md` §18 (and the P0 rows of §3.1) so the current product works end to end, is measurable, and has the safety net (manifest, E2E, visual baseline) that later phases rely on. No new product surface; no feature removed without a tested replacement.

**Architecture:** Strangler pattern on the existing Next 16 app. New shared modules (`lib/api-client.ts`, `lib/interview-credential.ts`, Prisma soft-delete extension, messaging contract, correlation ids) are introduced beside existing code, call sites are migrated behind tests, and legacy paths keep working until the manifest diff and E2E prove parity. Every task is its own PR to `main` behind a flag where behaviour changes.

**Tech stack:** Next.js 16 app router, Prisma 6, Supabase Auth (incl. native MFA), Upstash Redis, Inngest, Playwright, vitest, zod 4, `@vercel/otel`, `@node-saml/node-saml`.

**Source of truth for defects:** the four audit reports summarised in the v2 PRD §2–§3 and the v2.1 PRD §3.1. Every task starts by re-confirming the defect against current `main` (the PRD requires this because the repo moves quickly).

---

## Ground rules for every task

- Branch per task from `main`; PR title `phase0: <task>`; squash-merge. Never push directly to `main` for code.
- Additive migrations only. No rename/drop/type change.
- Behaviour changes ship behind a flag in `lib/feature-flags.ts` (`FF_P0_*`), default **on** in preview, **off** in production until the task's verification passes in staging.
- Each task ends with: `npx tsc --noEmit` clean, `npm run lint` clean, `npx vitest run` green, the task's Playwright spec green, manifest regenerated and diff reviewed.
- Commit message format: `fix(scope): …` / `feat(scope): …` / `chore(scope): …` per `~/.claude/rules/git-workflow.md`.

## Sequencing

```
T0 manifest + CI gates ──▶ T1 CSRF client ──▶ T2 interview credential ──▶ T3 proctoring persistence ──▶ T4 candidate results
                                     │                                                                 │
                                     ├──▶ T5 security guards + storage ──▶ T6 soft delete ──▶ T7 Inngest wiring
                                     ├──▶ T8 messaging contract
                                     ├──▶ T9 SSO completion + MFA + security settings
                                     ├──▶ T10 stub elimination / labelling
                                     ├──▶ T11 Redis degraded behaviour
                                     └──▶ T12 correlation ids + OTel foundation
T13 repo hygiene runs last. T14 is the exit gate.
```

T1 and T2 unblock everything that writes from the browser; do them first after T0. T5–T7 and T8–T12 can run in parallel by different people.

Estimated effort: 3 engineers × 3 weeks. Optional T15 (ATS two-way proof) is a scoping decision, see the end.

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
- [ ] **Step 2:** MFA using Supabase native TOTP: enrol (QR + recovery codes stored hashed in a new additive `MfaRecoveryCode` table), challenge on sign-in when `aal1`, enforce for `admin` and optionally per company (`GovernancePolicy.requireMfa` additive boolean). `ProtectedRoute` checks `aal2` where required.
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

### Task T11: Redis degraded behaviour

**Files:** `lib/rate-limit.ts`, `lib/concurrent-session-limiter.ts`, `lib/session-store.ts`, `app/api/interviews/[id]/voice-init/route.ts`, `lib/metrics.ts`, `.env.example`

- [ ] **Step 1:** Rate limiter and concurrency limiter: on Redis error, fail **open** with the in-memory fallback and increment `redis_degraded_total`; log once per minute. (Interview integrity gates are unaffected; they are Postgres-backed.)
- [ ] **Step 2:** Session store: authoritative checkpoint state is already mirrored in Postgres (`InterviewerStateSnapshot`, canonical ledger). Make `assertDurableStore()` return a status instead of throwing; when Redis is down, `voice-init` proceeds with `durability: "postgres-only"`, the room shows a non-blocking "reduced resilience" banner, and reconnect uses `tryRestoreSession` from Postgres (already implemented).
- [ ] **Step 3:** Ensure `UPSTASH_REDIS_REST_URL/TOKEN` are set in Vercel production and preview (they are absent from `.env` today); add a startup check that reports, not crashes.
- [ ] **Step 4:** Chaos test in `__tests__/chaos/`: Redis client rejects → interview can still start and complete on the mocked provider.
- [ ] **Commit** `fix(resilience): Redis loss degrades limits and resilience, never blocks interviews`.

---

### Task T12: Correlation ids and OpenTelemetry foundation

**Files:** `instrumentation.ts`, `lib/otel.ts` (new), `proxy.ts`, `lib/logger.ts`, `relay/server.ts`, `hooks/useVoiceInterview.ts`, `package.json` (`@vercel/otel`, `@opentelemetry/api`)

- [ ] **Step 1:** `registerOTel({ serviceName: "think5-web" })` in `instrumentation.ts`; export traces to the vendor chosen in the PRD's observability decision (OTLP endpoint via env; Sentry's OTLP receiver is acceptable to start).
- [ ] **Step 2:** `proxy.ts` sets `x-request-id` (uuid) if absent and echoes it on responses; `lib/logger.ts` includes `requestId`, `interviewId`, `tenantId` in every structured log line.
- [ ] **Step 3:** The relay reads `traceparent`/`x-request-id` from the WS handshake query, includes it in logs and Sentry scope, and forwards it in control frames so the browser can show a support id.
- [ ] **Step 4:** The room displays a "Support ID" (interviewId + short request id) on the error card.
- [ ] **Commit** `feat(observability): request ids and OpenTelemetry across web, relay and room`.

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
- [ ] Rollback exercised: revert the T8 messaging cutover flag in staging and confirm the legacy route still serves.
- [ ] 7-day observation window in production with all `FF_P0_*` flags on: no rise in 4xx/5xx, no drop in interview completion, no CSRF 403s.
- [ ] Owner sign-off (Humza) recorded.

---

## Scoping decisions to confirm before starting

1. **ATS two-way proof (v2.1 §3.1 lists it as a Phase 0 blocker; §18 does not).** Recommendation: run it as an optional parallel track **T15** (Greenhouse sandbox: OAuth setup page, job pull, candidate + report push, inbound webhook with the existing verifier, reconciliation table) only if a fourth engineer is available; otherwise it is the first Phase 3 item. It needs a Greenhouse sandbox account either way.
2. **Billing/entitlements** (§3.1 row) is out of Phase 0; it starts in Phase 5 per §18 unless you want usage metering (interview count, avatar minutes) instrumented now, which T12's metrics can carry cheaply.
3. **Multi-region relay** is Phase 4 infrastructure; Phase 0 only makes Redis loss non-fatal (T11) and adds drain handling in the client (D12, folded into T2's hook changes).
4. **Observability vendor** for OTLP export (Sentry, Grafana Cloud, Datadog): needed before T12 can finish.
5. **MFA enforcement policy**: admins always; recruiters per-company setting; candidates optional.
