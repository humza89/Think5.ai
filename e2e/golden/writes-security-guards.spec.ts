import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { E2E_FIXTURES, STORAGE_STATE_PATHS } from "../fixtures/e2e-fixtures";

/**
 * T5: admin routes are admin-only, cron routes require the cron secret, and
 * resume access goes through the signed-URL endpoint.
 */
const fixturesRequired = process.env.E2E_AUTH_FIXTURES === "true";
const recruiterStorage =
  process.env.E2E_RECRUITER_STORAGE_STATE ?? (fs.existsSync(STORAGE_STATE_PATHS.recruiter) ? STORAGE_STATE_PATHS.recruiter : undefined);

test("recruiter session is refused by admin routes", async ({ browser }) => {
  test.skip(!fixturesRequired && !recruiterStorage, "requires recruiter storage state");
  const context = await browser.newContext({ storageState: recruiterStorage! });
  try {
    for (const route of ["/api/admin/compliance-report", "/api/admin/continuity-scorecard", "/api/admin/proctoring-events"]) {
      const res = await context.request.get(route);
      expect(res.status(), `${route} for a recruiter`).toBe(403);
    }
  } finally {
    await context.close();
  }
});

test("cron routes refuse requests without the configured secret", async ({ browser }) => {
  const anonymous = await browser.newContext();
  try {
    for (const route of ["/api/cron/retention-purge", "/api/cron/retention", "/api/cron/report-retry", "/api/cron/fragment-cleanup"]) {
      const missing = await anonymous.request.get(route);
      expect(missing.status(), `${route} without a bearer`).toBe(401);
      const wrong = await anonymous.request.get(route, { headers: { authorization: "Bearer not-the-secret" } });
      expect(wrong.status(), `${route} with a wrong bearer`).toBe(401);
    }
  } finally {
    await anonymous.close();
  }
});

test("resume access is a recruiter-authorised signed-URL endpoint", async ({ browser }) => {
  test.skip(!fixturesRequired && !recruiterStorage, "requires recruiter storage state");
  const context = await browser.newContext({ storageState: recruiterStorage! });
  try {
    // Seeded candidate has no resume: ownership passes, then 404 "No resume on file".
    const own = await context.request.get(`/api/candidates/${E2E_FIXTURES.ids.candidate}/resume`);
    expect(own.status()).toBe(404);
    expect(await own.json()).toMatchObject({ error: "No resume on file" });
    const foreign = await context.request.get(`/api/candidates/not-a-candidate/resume`);
    expect([403, 404]).toContain(foreign.status());
  } finally {
    await context.close();
  }
});
