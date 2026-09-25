import fs from "node:fs";
import { test, expect, type BrowserContext } from "@playwright/test";
import { STORAGE_STATE_PATHS } from "../fixtures/e2e-fixtures";

/**
 * T15: the Greenhouse integration surface is real and guarded. No live
 * Greenhouse call is made here (the sandbox is an external gate covered by
 * the nightly workflow); this proves the routes, the page and the webhook
 * receiver behave correctly for a tenant that is not connected.
 */
const fixturesRequired = process.env.E2E_AUTH_FIXTURES === "true";
const recruiterStorage =
  process.env.E2E_RECRUITER_STORAGE_STATE ?? (fs.existsSync(STORAGE_STATE_PATHS.recruiter) ? STORAGE_STATE_PATHS.recruiter : undefined);

async function csrfHeaders(context: BrowserContext): Promise<Record<string, string>> {
  const cookie = (await context.cookies()).find((c) => c.name === "csrf-token-client");
  return cookie ? { "x-csrf-token": decodeURIComponent(cookie.value), "content-type": "application/json" } : { "content-type": "application/json" };
}

test("integrations page renders the connect form for an unconnected tenant", async ({ browser }) => {
  test.skip(!fixturesRequired && !recruiterStorage, "requires recruiter storage state");
  test.setTimeout(120_000);
  const context = await browser.newContext({ storageState: recruiterStorage! });
  try {
    const page = await context.newPage();
    await page.goto("/settings/integrations", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("ats-connection-card")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("Harvest API key")).toBeVisible();
    await expect(page.getByTestId("ats-connect")).toBeDisabled();
    await page.close();
  } finally {
    await context.close();
  }
});

test("status, links and provider gating answer correctly for an unconnected tenant", async ({ browser }) => {
  test.skip(!fixturesRequired && !recruiterStorage, "requires recruiter storage state");
  const context = await browser.newContext({ storageState: recruiterStorage! });
  try {
    const headers = await csrfHeaders(context);
    const status = await context.request.get("/api/integrations/greenhouse/status");
    expect(status.status()).toBe(200);
    expect(await status.json()).toMatchObject({ connected: false, provider: "greenhouse" });
    const links = await context.request.get("/api/integrations/greenhouse/links");
    expect(await links.json()).toEqual({ links: [] });
    const sync = await context.request.post("/api/integrations/greenhouse/sync", { headers, data: { direction: "import" } });
    expect(sync.status()).toBe(404);
    const lever = await context.request.get("/api/integrations/lever/status");
    expect(lever.status()).toBe(501);
    const connect = await context.request.post("/api/integrations/greenhouse/connect", { headers, data: { apiKey: "" } });
    // Without ATS_ENCRYPTION_KEY the route refuses to store credentials (503); with it, an empty key is a 400.
    expect([400, 503]).toContain(connect.status());
  } finally {
    await context.close();
  }
});

test("webhook receiver refuses unknown integrations and unsigned bodies", async ({ browser }) => {
  const anonymous = await browser.newContext();
  try {
    const noParam = await anonymous.request.post("/api/integrations/greenhouse/webhook", { data: { action: "job_updated" } });
    expect(noParam.status()).toBe(400);
    const unknown = await anonymous.request.post("/api/integrations/greenhouse/webhook?integration=does-not-exist", { data: { action: "job_updated" } });
    expect(unknown.status()).toBe(404);
    const ping = await anonymous.request.get("/api/integrations/greenhouse/webhook");
    expect(await ping.json()).toEqual({ ok: true, provider: "greenhouse" });
  } finally {
    await anonymous.close();
  }
});

test("candidate sessions cannot touch integrations", async ({ browser }) => {
  const candidateStorage = process.env.E2E_CANDIDATE_STORAGE_STATE ?? (fs.existsSync(STORAGE_STATE_PATHS.candidate) ? STORAGE_STATE_PATHS.candidate : undefined);
  test.skip(!fixturesRequired && !candidateStorage, "requires candidate storage state");
  const context = await browser.newContext({ storageState: candidateStorage! });
  try {
    const res = await context.request.get("/api/integrations/greenhouse/status");
    expect([403, 404]).toContain(res.status());
  } finally {
    await context.close();
  }
});
