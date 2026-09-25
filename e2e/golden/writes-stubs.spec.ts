import fs from "node:fs";
import { test, expect, type BrowserContext } from "@playwright/test";
import { E2E_FIXTURES, STORAGE_STATE_PATHS } from "../fixtures/e2e-fixtures";

/**
 * T10: every visible stub from the plan's table either works, is labelled
 * read-only, or is gone. Real sessions from the setup project; writes are
 * restored so the visual baselines in the same run stay deterministic.
 */
const fixturesRequired = process.env.E2E_AUTH_FIXTURES === "true";
const recruiterStorage =
  process.env.E2E_RECRUITER_STORAGE_STATE ?? (fs.existsSync(STORAGE_STATE_PATHS.recruiter) ? STORAGE_STATE_PATHS.recruiter : undefined);
const candidateStorage =
  process.env.E2E_CANDIDATE_STORAGE_STATE ?? (fs.existsSync(STORAGE_STATE_PATHS.candidate) ? STORAGE_STATE_PATHS.candidate : undefined);

test.setTimeout(120_000);

async function csrfHeaders(context: BrowserContext): Promise<Record<string, string>> {
  const cookie = (await context.cookies()).find((c) => c.name === "csrf-token-client");
  return cookie ? { "x-csrf-token": decodeURIComponent(cookie.value), "content-type": "application/json" } : { "content-type": "application/json" };
}

test("notification preferences load and save through the account route", async ({ browser }) => {
  test.skip(!fixturesRequired && !recruiterStorage, "requires recruiter storage state");
  const context = await browser.newContext({ storageState: recruiterStorage! });
  try {
    const headers = await csrfHeaders(context);
    const before = await (await context.request.get("/api/account/notification-preferences")).json();
    expect(before.preferences).toMatchObject({ emailNotifications: expect.any(Boolean) });
    const flipped = !before.preferences.matchAlerts;
    const put = await context.request.put("/api/account/notification-preferences", { headers, data: { matchAlerts: flipped } });
    expect(put.status()).toBe(200);
    expect((await put.json()).preferences.matchAlerts).toBe(flipped);
    // page reflects the stored value
    const page = await context.newPage();
    await page.goto("/settings/notifications", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("notification-settings")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("pref-matchAlerts")).toHaveAttribute("aria-checked", String(flipped), { timeout: 30_000 });
    await page.close();
    // restore
    await context.request.put("/api/account/notification-preferences", { headers, data: { matchAlerts: before.preferences.matchAlerts } });
  } finally {
    await context.close();
  }
});

test("recruiter profile page edits the Recruiter row and Settings links to it", async ({ browser }) => {
  test.skip(!fixturesRequired && !recruiterStorage, "requires recruiter storage state");
  const context = await browser.newContext({ storageState: recruiterStorage! });
  try {
    const headers = await csrfHeaders(context);
    const before = await (await context.request.get("/api/recruiter/profile")).json();
    expect(before.profile).toMatchObject({ email: E2E_FIXTURES.recruiter.email });
    const put = await context.request.put("/api/recruiter/profile", { headers, data: { title: "Head of Talent (E2E)" } });
    expect(put.status()).toBe(200);
    expect((await put.json()).profile.title).toBe("Head of Talent (E2E)");
    const bad = await context.request.put("/api/recruiter/profile", { headers, data: { linkedinUrl: "https://evil.example/x" } });
    expect(bad.status()).toBe(400);
    const page = await context.newPage();
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await expect(page.locator('a[href="/settings/profile"]')).toHaveCount(1, { timeout: 30_000 });
    await page.goto("/settings/profile", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("recruiter-profile-card")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#rp-title")).toHaveValue("Head of Talent (E2E)", { timeout: 30_000 });
    await page.close();
    await context.request.put("/api/recruiter/profile", { headers, data: { title: before.profile.title ?? "" } });
  } finally {
    await context.close();
  }
});

test("API keys are admin-only and /api/v1/me is key-authenticated", async ({ browser }) => {
  test.skip(!fixturesRequired && !recruiterStorage, "requires recruiter storage state");
  const context = await browser.newContext({ storageState: recruiterStorage! });
  try {
    const headers = await csrfHeaders(context);
    const asRecruiter = await context.request.post("/api/account/api-keys", { headers, data: { name: "nope" } });
    expect(asRecruiter.status()).toBe(403);
    const anonymous = await browser.newContext();
    const noKey = await anonymous.request.get("/api/v1/me");
    expect(noKey.status()).toBe(401);
    const badKey = await anonymous.request.get("/api/v1/me", { headers: { authorization: "Bearer t5_deadbeef_notarealsecretvalue00" } });
    expect(badKey.status()).toBe(401);
    await anonymous.close();
  } finally {
    await context.close();
  }
});

test("dead-end controls are gone or labelled: candidates, pipeline, talent pools, interviews redirect, logo marks", async ({ browser }) => {
  test.skip(!fixturesRequired && !recruiterStorage, "requires recruiter storage state");
  const context = await browser.newContext({ storageState: recruiterStorage! });
  try {
    const page = await context.newPage();
    await page.goto("/candidates", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Loading...", { exact: true })).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Project", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Hide", exact: true })).toHaveCount(0);
    await expect(page.getByText("T5", { exact: true })).toHaveCount(0);
    await expect(page.getByText("P", { exact: true })).toHaveCount(0);

    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pipeline-readonly-badge")).toBeVisible({ timeout: 30_000 });

    await page.goto("/talent-pools", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Loading...", { exact: true })).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator(".cursor-pointer")).toHaveCount(0);

    await page.goto(`/interviews/${E2E_FIXTURES.ids.interviewCompleted}`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`/interviews/${E2E_FIXTURES.ids.interviewCompleted}/report`), { timeout: 30_000 });

    await page.goto(E2E_FIXTURES.routes.candidateDetail + "/activity", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("candidate-activity")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "Activity" })).toBeVisible();
    const emails = await context.request.get(E2E_FIXTURES.routes.candidateDetail + "/emails");
    expect(emails.status()).toBe(404);
    await page.close();
  } finally {
    await context.close();
  }
});

test("candidate shell: practice is in the nav, career tools has no coming-soon cards, policy shows real retention days", async ({ browser }) => {
  test.skip(!fixturesRequired && !candidateStorage, "requires candidate storage state");
  const context = await browser.newContext({ storageState: candidateStorage! });
  try {
    const summary = await context.request.get("/api/candidate/retention-summary");
    expect(summary.status()).toBe(200);
    const { policy } = await summary.json();
    expect(policy).toMatchObject({ recordingDays: expect.any(Number), transcriptDays: expect.any(Number), candidateDataDays: expect.any(Number) });

    const page = await context.newPage();
    await page.goto("/candidate/career-tools", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Loading...", { exact: true })).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText("Coming Soon")).toHaveCount(0);
    await expect(page.locator('a[href="/candidate/practice"]').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("T5", { exact: true })).toHaveCount(0);

    await page.goto("/candidate/policy", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(`${policy.recordingDays}`, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await page.close();
  } finally {
    await context.close();
  }
});
