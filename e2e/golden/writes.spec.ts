import fs from "node:fs";
import { test, expect, Page, BrowserContext } from "@playwright/test";
import { E2E_FIXTURES, STORAGE_STATE_PATHS } from "../fixtures/e2e-fixtures";

/**
 * Real browser writes through the canonical API client (T1). These are the
 * flows the Phase 0 plan names: a recruiter creates a job through the UI and
 * a candidate updates their profile. Every request goes through the proxy's
 * CSRF check, so a regression to raw fetch() shows up here as a 403.
 *
 * Both tests restore what they change so the visual baselines captured in
 * the same CI run stay deterministic.
 */

const fixturesRequired = process.env.E2E_AUTH_FIXTURES === "true";

function storageStateFor(envName: string, fallback: string): string | undefined {
  const explicit = process.env[envName];
  if (explicit) return explicit;
  return fs.existsSync(fallback) ? fallback : undefined;
}

const recruiterStorage = storageStateFor("E2E_RECRUITER_STORAGE_STATE", STORAGE_STATE_PATHS.recruiter);
const candidateStorage = storageStateFor("E2E_CANDIDATE_STORAGE_STATE", STORAGE_STATE_PATHS.candidate);

async function csrfHeader(context: BrowserContext): Promise<Record<string, string>> {
  const cookie = (await context.cookies()).find((c) => c.name === "csrf-token-client");
  if (!cookie) throw new Error("csrf-token-client cookie missing from storage state");
  return { "x-csrf-token": cookie.value };
}

async function waitForAuthenticatedShell(page: Page) {
  await expect(page.getByText("Loading...", { exact: true })).toHaveCount(0, { timeout: 30_000 });
}

test.describe.configure({ mode: "serial" });
// First hits of /jobs/new and /candidate/profile compile on the dev server; give real writes room.
test.setTimeout(90_000);

test("recruiter creates a job through the wizard (POST /api/jobs)", async ({ browser }) => {
  test.skip(!fixturesRequired && !recruiterStorage, "requires recruiter storage state");
  const context = await browser.newContext({ storageState: recruiterStorage! });
  const page = await context.newPage();
  const title = `E2E Golden Job ${Date.now()}`;
  let jobId: string | null = null;

  try {
    await page.goto("/jobs/new", { waitUntil: "domcontentloaded" });
    await waitForAuthenticatedShell(page);

    // Step 0: basics
    await page.locator("#title").fill(title);
    await page.locator("#company").selectOption(E2E_FIXTURES.ids.company);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    // Step 1: description
    await page.locator("#description").fill("Own the fleet-coordination services. Created by the golden writes E2E.");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    // Steps 2-4: skills, compensation, questions (optional)
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next", exact: true }).click();

    const created = page.waitForResponse((r) => r.url().includes("/api/jobs") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Publish Job", exact: true }).click();
    const response = await created;
    expect(response.status(), "POST /api/jobs must succeed through the CSRF check").toBe(201);
    const job = (await response.json()) as { id: string; title: string };
    jobId = job.id;
    expect(job.title).toBe(title);

    await expect(page).toHaveURL(new RegExp(`/jobs/${job.id}(?:\\?|$)`), { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 30_000 });

    const listed = await page.request.get(`/api/jobs/${job.id}`);
    expect(listed.status()).toBe(200);
  } finally {
    if (jobId) {
      const del = await page.request.delete(`/api/jobs/${jobId}`, { headers: await csrfHeader(context) });
      expect(del.ok(), `cleanup DELETE /api/jobs/${jobId} failed with ${del.status()}`).toBe(true);
    }
    await context.close();
  }
});

test("candidate updates their profile (PUT /api/candidate/profile)", async ({ browser }) => {
  test.skip(!fixturesRequired && !candidateStorage, "requires candidate storage state");
  const context = await browser.newContext({ storageState: candidateStorage! });
  const page = await context.newPage();
  const original = E2E_FIXTURES.candidate.lastName;
  const changed = `${original}-E2E`;

  async function save(lastName: string) {
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: /Save|Saved/ }) }).first();
    const lastNameInput = form.locator("input").nth(1);
    await lastNameInput.fill(lastName);
    const saved = page.waitForResponse((r) => r.url().includes("/api/candidate/profile") && r.request().method() === "PUT");
    await form.getByRole("button", { name: "Save", exact: true }).click();
    const response = await saved;
    expect(response.status(), "PUT /api/candidate/profile must succeed through the CSRF check").toBe(200);
    await expect(form.getByText("Saved")).toBeVisible({ timeout: 10_000 });
  }

  try {
    await page.goto("/candidate/profile", { waitUntil: "domcontentloaded" });
    await waitForAuthenticatedShell(page);
    await expect(page.locator("form").filter({ has: page.getByRole("button", { name: "Save" }) }).first().locator("input").nth(1)).toHaveValue(original, {
      timeout: 30_000,
    });

    await save(changed);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAuthenticatedShell(page);
    await expect(page.locator("form").filter({ has: page.getByRole("button", { name: "Save" }) }).first().locator("input").nth(1)).toHaveValue(changed, {
      timeout: 30_000,
    });
  } finally {
    // Restore the seeded name so later captures and reruns are unaffected.
    const restore = await page.request.put("/api/candidate/profile", {
      headers: { ...(await csrfHeader(context)), "Content-Type": "application/json" },
      data: { first_name: E2E_FIXTURES.candidate.firstName, last_name: original },
    });
    expect(restore.ok(), `restore PUT failed with ${restore.status()}`).toBe(true);
    await context.close();
  }
});
