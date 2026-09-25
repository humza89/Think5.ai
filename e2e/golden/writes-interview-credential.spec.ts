import fs from "node:fs";
import { test, expect, BrowserContext } from "@playwright/test";
import { E2E_FIXTURES, STORAGE_STATE_PATHS } from "../fixtures/e2e-fixtures";

/**
 * T2 golden path for the interview credential resolver.
 *
 * The candidate storage state produced by auth.setup.ts holds only the
 * HttpOnly `interview-session` cookie issued by the real /api/interviews/accept
 * flow: no token in any URL, header or body. Every migrated interview endpoint
 * must accept that cookie, reject a wrong or missing credential with a typed
 * reason, and the room must reach the voice provider stage in cookie mode.
 *
 * Named to sort after visual.spec.ts: starting the room can move the seeded
 * interview out of PENDING, and the visual baselines capture it as PENDING.
 */

const fixturesRequired = process.env.E2E_AUTH_FIXTURES === "true";
const candidateStorage =
  process.env.E2E_CANDIDATE_STORAGE_STATE ?? (fs.existsSync(STORAGE_STATE_PATHS.candidate) ? STORAGE_STATE_PATHS.candidate : undefined);
const interviewId = E2E_FIXTURES.ids.interviewWelcome;
const base = `/api/interviews/${interviewId}`;

async function csrfHeader(context: BrowserContext): Promise<Record<string, string>> {
  const cookie = (await context.cookies()).find((c) => c.name === "csrf-token-client");
  if (!cookie) throw new Error("csrf-token-client cookie missing from storage state");
  return { "x-csrf-token": cookie.value, "Content-Type": "application/json" };
}

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

test("cookie-only credential is honoured by every migrated interview endpoint", async ({ browser }) => {
  test.skip(!fixturesRequired && !candidateStorage, "requires candidate storage state");
  const context = await browser.newContext({ storageState: candidateStorage! });
  const headers = await csrfHeader(context);
  const cookies = await context.cookies();
  // Next percent-encodes cookie values, so the stored value reads `id%3Atoken`.
  expect(
    cookies.some((c) => c.name === "interview-session" && decodeURIComponent(c.value).startsWith(`${interviewId}:`)),
    "storage state carries the interview-session cookie",
  ).toBe(true);

  try {
    const validate = await context.request.post(`${base}/validate`, { headers, data: {} });
    expect(validate.status(), "validate with cookie only").toBe(200);
    expect(await validate.json()).toMatchObject({ id: interviewId, candidateName: E2E_FIXTURES.candidate.fullName });

    const reportStatus = await context.request.post(`${base}/report-status`, { headers, data: {} });
    expect(reportStatus.status(), "report-status with cookie only").toBe(200);

    const refresh = await context.request.post(`${base}/session/refresh`, { headers, data: {} });
    expect(refresh.status(), "session/refresh with cookie only").toBe(200);
    expect(await refresh.json()).toMatchObject({ refreshed: true, source: "cookie" });
    expect(refresh.headers()["set-cookie"] ?? "").toContain("interview-session=");

    // These endpoints reject the *action* for a PENDING interview, never the credential.
    const pause = await context.request.post(`${base}/pause`, { headers, data: { action: "pause" } });
    expect([401, 403], `pause must not fail on credential (got ${pause.status()})`).not.toContain(pause.status());
    const memory = await context.request.get(`${base}/memory-status`);
    expect([401, 403], `memory-status must not fail on credential (got ${memory.status()})`).not.toContain(memory.status());
    const replay = await context.request.get(`${base}/replay`);
    expect([401, 403], `replay must not fail on credential (got ${replay.status()})`).not.toContain(replay.status());
    const proctoring = await context.request.post(`${base}/proctoring`, { headers, data: { eventType: "tab_switch", severity: "low" } });
    expect([401, 403], `proctoring must not fail on credential (got ${proctoring.status()})`).not.toContain(proctoring.status());
  } finally {
    await context.close();
  }
});

test("missing and wrong credentials are rejected with a typed reason", async ({ browser }) => {
  test.skip(!fixturesRequired && !candidateStorage, "requires candidate storage state");
  const anonymous = await browser.newContext();
  try {
    const missing = await anonymous.request.get(`${base}/replay`);
    expect(missing.status()).toBe(401);
    expect(await missing.json()).toMatchObject({ reason: "missing" });

    const wrong = await anonymous.request.get(`${base}/replay`, { headers: { authorization: "Bearer not-the-token" } });
    expect(wrong.status()).toBe(401);
    expect(await wrong.json()).toMatchObject({ reason: "mismatch" });

    // A cookie issued for another interview must not authorise this one.
    await anonymous.addCookies([{ name: "interview-session", value: `${E2E_FIXTURES.ids.interviewCompleted}:${E2E_FIXTURES.tokens.completedAccess}`, url: "http://localhost:3000" }]);
    const other = await anonymous.request.get(`${base}/replay`);
    expect(other.status()).toBe(401);
    expect(await other.json()).toMatchObject({ reason: "missing" });
  } finally {
    await anonymous.close();
  }
});

test("room in cookie mode reaches voice-init without a token in the URL", async ({ browser }) => {
  test.skip(!fixturesRequired && !candidateStorage, "requires candidate storage state");
  const context = await browser.newContext({ storageState: candidateStorage!, permissions: ["camera", "microphone"] });
  const page = await context.newPage();
  try {
    await page.goto(E2E_FIXTURES.routes.interviewWelcome, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(`Welcome, ${E2E_FIXTURES.candidate.fullName}`)).toBeVisible({ timeout: 30_000 });
    expect(page.url()).not.toContain("token=");

    await page.getByLabel("Consent to video and audio recording").check();
    await page.getByLabel("Consent to integrity monitoring").check();
    await page.getByLabel("Agree to Privacy Policy").check();

    const consent = page.waitForResponse((r) => r.url().endsWith(`${base}/validate`) && r.request().method() === "POST");
    const voiceInit = page.waitForResponse((r) => r.url().endsWith(`${base}/voice-init`) && r.request().method() === "POST", { timeout: 60_000 });
    await page.getByRole("button", { name: "Start Interview", exact: true }).click();

    const consentResponse = await consent;
    expect(consentResponse.status(), "consent validate in cookie mode").toBe(200);

    const initResponse = await voiceInit;
    const initBody = initResponse.request().postDataJSON() as { accessToken?: string };
    expect(initBody.accessToken ?? "", "room sends no token; the cookie is the credential").toBe("");
    // The credential must resolve. Whether the voice provider is reachable in
    // this environment is outside T2 (tracked for T10/T14 provider mocks).
    expect([400, 401, 403], `voice-init must not fail on credential (got ${initResponse.status()})`).not.toContain(initResponse.status());

    // T3: an integrity event raised in the room reaches the server as a batch
    // (the hook flushes every 10 s) and lands as a ProctoringEvent row.
    const batch = page.waitForResponse((r) => r.url().endsWith(`${base}/proctoring`) && r.request().method() === "POST", { timeout: 30_000 });
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const batchResponse = await batch;
    expect(batchResponse.status(), "proctoring batch in cookie mode").toBe(200);
    expect(((await batchResponse.json()) as { persisted: number }).persisted).toBeGreaterThanOrEqual(1);
    if (process.env.DATABASE_URL) {
      const { PrismaClient } = await import("@prisma/client");
      const raw = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
      try {
        const rows = await raw.proctoringEvent.findMany({ where: { interviewId, eventType: "tab_switch" } });
        expect(rows.length, "tab_switch persisted as a ProctoringEvent row").toBeGreaterThanOrEqual(1);
        await raw.proctoringEvent.deleteMany({ where: { interviewId } });
        await raw.interview.update({ where: { id: interviewId }, data: { integrityEvents: [] } });
      } finally {
        await raw.$disconnect();
      }
    }
  } finally {
    await context.close();
  }
});
