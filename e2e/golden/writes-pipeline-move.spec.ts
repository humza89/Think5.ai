import fs from "node:fs";
import { test, expect, BrowserContext, Locator, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E_FIXTURES, STORAGE_STATE_PATHS } from "../fixtures/e2e-fixtures";

/**
 * Plan spec `pipeline.spec`: a kanban move persists.
 *
 * The seeded application sits in Interviewing on the seeded job's pipeline.
 * The recruiter drags its card to Screening with real pointer events (the
 * board uses dnd-kit's PointerSensor with an 8 px activation distance), the
 * PATCH the board issues must succeed, the stage must survive a reload, and
 * the card is dragged back so the seeded state is restored. If the UI drag
 * ever cannot be completed the restore falls back to the same API the board
 * calls, and the assertion on the forward move still fails the run.
 */
const fixturesRequired = process.env.E2E_AUTH_FIXTURES === "true";
const recruiterStorage =
  process.env.E2E_RECRUITER_STORAGE_STATE ?? (fs.existsSync(STORAGE_STATE_PATHS.recruiter) ? STORAGE_STATE_PATHS.recruiter : undefined);

const jobId = E2E_FIXTURES.ids.job;
const applicationId = E2E_FIXTURES.ids.application;
const candidateName = E2E_FIXTURES.candidate.fullName;
const statusUrl = `/api/jobs/${jobId}/applications/${applicationId}`;

async function csrf(context: BrowserContext): Promise<Record<string, string>> {
  const cookie = (await context.cookies()).find((c) => c.name === "csrf-token-client");
  if (!cookie) throw new Error("csrf-token-client cookie missing from the context");
  return { "x-csrf-token": cookie.value, "Content-Type": "application/json" };
}

async function openBoard(page: Page) {
  await page.goto(E2E_FIXTURES.routes.jobDetail, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Loading...", { exact: true })).toHaveCount(0, { timeout: 30_000 });
  await page.getByRole("button", { name: /^Pipeline \(/ }).click();
  await expect(page.getByLabel(`Drag ${candidateName}`)).toBeVisible({ timeout: 30_000 });
}

/** The dnd-kit column whose header reads `label`. */
function column(page: Page, label: string): Locator {
  return page.locator("div.w-\\[280px\\]").filter({ has: page.locator("span.text-sm.font-medium", { hasText: new RegExp(`^${label}$`) }) });
}

async function dragCardTo(page: Page, targetLabel: string, expectedStatus: string) {
  const handle = page.getByLabel(`Drag ${candidateName}`);
  const target = column(page, targetLabel);
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + Math.min(to.height / 2, 160) };

  const patched = page.waitForResponse((r) => r.url().endsWith(statusUrl) && r.request().method() === "PATCH", { timeout: 15_000 });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // Exceed the 8 px activation distance, then travel to the column in steps
  // so dnd-kit sees pointer moves and computes the drop target.
  await page.mouse.move(start.x + 12, start.y + 12, { steps: 4 });
  await page.mouse.move(end.x, end.y, { steps: 20 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  const response = await patched;
  expect(response.status(), `PATCH ${statusUrl} → ${expectedStatus}`).toBe(200);
  expect(response.request().postDataJSON()).toMatchObject({ status: expectedStatus });
}

async function expectInColumn(page: Page, label: string) {
  await expect(column(page, label).getByText(candidateName, { exact: true })).toBeVisible({ timeout: 30_000 });
}

test("recruiter drags a candidate to a new stage; the write succeeds and the stage persists across reload", async ({ browser }) => {
  test.skip(!fixturesRequired && !recruiterStorage, "requires recruiter storage state");
  test.skip(!process.env.DATABASE_URL, "requires DATABASE_URL to verify the persisted stage");
  test.setTimeout(180_000);
  const context = await browser.newContext({ storageState: recruiterStorage!, viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  let moved = false;
  const prisma = process.env.DATABASE_URL ? new PrismaClient() : null;
  const storedStatus = async () => {
    if (!prisma) return "(no DATABASE_URL)";
    const row = await prisma.application.findUnique({ where: { id: applicationId }, select: { status: true } });
    return row?.status;
  };
  try {
    await openBoard(page);
    await expectInColumn(page, "Interviewing");

    await dragCardTo(page, "Screening", "SCREENING");
    moved = true;
    await expectInColumn(page, "Screening");

    // Persistence: a fresh document must show the new stage, and the row
    // itself must hold it (read straight from the database, not the UI).
    await openBoard(page);
    await expectInColumn(page, "Screening");
    expect(await storedStatus(), "Application.status after the move").toBe("SCREENING");

    // Restore through the UI as well, and prove that persisted too.
    await dragCardTo(page, "Interviewing", "INTERVIEWING");
    moved = false;
    await openBoard(page);
    await expectInColumn(page, "Interviewing");
    expect(await storedStatus(), "Application.status after the restore").toBe("INTERVIEWING");
  } finally {
    await prisma?.$disconnect().catch(() => {});
    if (moved) {
      // Fallback restore via the same API the board calls.
      await context.request.patch(statusUrl, { headers: await csrf(context), data: { status: "INTERVIEWING" } }).catch(() => {});
    }
    await context.close();
  }
});
