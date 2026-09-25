import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { E2E_FIXTURES, STORAGE_STATE_PATHS } from "../fixtures/e2e-fixtures";

/**
 * T4: real candidate results and a single interview room.
 * Uses the seeded candidate session; no report is seeded, so the API must
 * answer "Report not yet available" (ownership passed) rather than
 * "Interview not found" (ownership failed).
 */
const fixturesRequired = process.env.E2E_AUTH_FIXTURES === "true";
const candidateStorage =
  process.env.E2E_CANDIDATE_STORAGE_STATE ?? (fs.existsSync(STORAGE_STATE_PATHS.candidate) ? STORAGE_STATE_PATHS.candidate : undefined);
const completed = E2E_FIXTURES.ids.interviewCompleted;
const welcome = E2E_FIXTURES.ids.interviewWelcome;

test("legacy results URL redirects to the real report and ownership resolves through the candidate record", async ({ browser }) => {
  test.skip(!fixturesRequired && !candidateStorage, "requires candidate storage state");
  const context = await browser.newContext({ storageState: candidateStorage! });
  const page = await context.newPage();
  try {
    await page.goto(`/candidate/interview/results/${completed}`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`/candidate/interviews/${completed}/report(?:\\?|$)`), { timeout: 30_000 });

    const api = await context.request.get(`/api/candidate/interviews/${completed}/report`);
    expect(api.status()).toBe(404);
    expect(await api.json()).toMatchObject({ error: "Report not yet available" });

    const foreign = await context.request.get(`/api/candidate/interviews/not-mine/report`);
    expect(foreign.status()).toBe(404);
    expect(await foreign.json()).toMatchObject({ error: "Interview not found" });
  } finally {
    await context.close();
  }
});

test("the legacy candidate room redirects to the single interview room", async ({ browser }) => {
  test.skip(!fixturesRequired && !candidateStorage, "requires candidate storage state");
  const context = await browser.newContext({ storageState: candidateStorage! });
  const page = await context.newPage();
  try {
    await page.goto(`/candidate/interview/${welcome}?token=${E2E_FIXTURES.tokens.interviewAccess}`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`/interview/${welcome}\\?token=`), { timeout: 30_000 });
    await expect(page.getByText(`Welcome, ${E2E_FIXTURES.candidate.fullName}`)).toBeVisible({ timeout: 30_000 });
  } finally {
    await context.close();
  }
});
