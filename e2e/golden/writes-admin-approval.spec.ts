import fs from "node:fs";
import { test, expect, BrowserContext, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { E2E_FIXTURES, STORAGE_STATE_PATHS } from "../fixtures/e2e-fixtures";

/**
 * Plan spec `admin-approval.spec`: the recruiter approval workflow, exercised
 * at the API and the UI independently of the signup flow.
 *
 * Seeded state: `pendingRecruiter` finished onboarding and is parked at
 * PENDING_APPROVAL (Recruiter row) / pending_approval (profiles row), so the
 * proxy sends them to /recruiter/onboarding/status. The admin session comes
 * from auth.setup.ts (real sign-in). After the run the recruiter is reset to
 * pending through the seed's own mechanisms so the spec is re-runnable.
 */
const fixturesRequired = process.env.E2E_AUTH_FIXTURES === "true";
const adminStorage =
  process.env.E2E_ADMIN_STORAGE_STATE ?? (fs.existsSync(STORAGE_STATE_PATHS.admin) ? STORAGE_STATE_PATHS.admin : undefined);
const recruiterStorage =
  process.env.E2E_RECRUITER_STORAGE_STATE ?? (fs.existsSync(STORAGE_STATE_PATHS.recruiter) ? STORAGE_STATE_PATHS.recruiter : undefined);

async function csrf(context: BrowserContext): Promise<Record<string, string>> {
  const cookie = (await context.cookies()).find((c) => c.name === "csrf-token-client");
  if (!cookie) throw new Error("csrf-token-client cookie missing from the context");
  return { "x-csrf-token": cookie.value, "Content-Type": "application/json" };
}

async function signIn(page: Page, email: string, password: string, landing: RegExp) {
  await page.goto("/auth/signin", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.locator("#email").fill(email);
  await expect(page.locator("#email")).toHaveValue(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(landing, { timeout: 30_000 });
}

function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to reset the fixture");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const recruiterId = E2E_FIXTURES.ids.pendingRecruiter;

test("admin approves a pending recruiter (API + UI); the recruiter gains dashboard access; a recruiter session cannot approve", async ({ browser }) => {
  test.skip(!fixturesRequired && !(adminStorage && recruiterStorage), "requires admin and recruiter storage states");
  test.skip(!process.env.DATABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY, "requires the local stack credentials to reset the fixture");
  test.setTimeout(180_000);
  const seedPassword = process.env.E2E_SEED_PASSWORD;
  if (!seedPassword) throw new Error("E2E_SEED_PASSWORD must match the seed");

  const prisma = new PrismaClient();
  const supabase = adminDb();
  const admin = await browser.newContext({ storageState: adminStorage! });
  const recruiter = await browser.newContext({ storageState: recruiterStorage! });
  const pending = await browser.newContext();
  try {
    // 0. Seeded state: pending in the API, and the recruiter is held at the status page.
    const listed = await admin.request.get("/api/admin/approvals?type=recruiters&status=PENDING_APPROVAL");
    expect(listed.status(), "admin lists pending recruiters").toBe(200);
    const pendingList = (await listed.json()) as { recruiters: Array<{ id: string; email: string }> };
    expect(pendingList.recruiters.map((r) => r.id)).toContain(recruiterId);

    const pendingPage = await pending.newPage();
    await signIn(pendingPage, E2E_FIXTURES.pendingRecruiter.email, seedPassword, /\/recruiter\/onboarding\/status(?:\?|$)/);
    await pendingPage.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(pendingPage).toHaveURL(/\/recruiter\/onboarding\/status(?:\?|$)/, { timeout: 30_000 });

    // 1. A recruiter session is refused by the approval API.
    const forbidden = await recruiter.request.patch(`/api/admin/approvals/${recruiterId}?type=recruiter`, {
      headers: await csrf(recruiter),
      data: { action: "approved" },
    });
    expect(forbidden.status(), "recruiter cannot approve").toBe(403);

    // 2. Admin approves through the UI (Recruiters tab → row → Approve).
    const adminPage = await admin.newPage();
    await adminPage.goto("/admin/approvals", { waitUntil: "domcontentloaded" });
    await expect(adminPage.getByText("Loading...", { exact: true })).toHaveCount(0, { timeout: 30_000 });
    await adminPage.getByRole("button", { name: "Recruiters" }).click();
    const row = adminPage.locator("tr").filter({ hasText: E2E_FIXTURES.pendingRecruiter.name });
    await expect(row).toBeVisible({ timeout: 30_000 });
    const approved = adminPage.waitForResponse(
      (r) => r.url().includes(`/api/admin/approvals/${recruiterId}`) && r.request().method() === "PATCH",
    );
    await row.getByTitle("Approve").click();
    expect((await approved).status(), "PATCH approve from the UI").toBe(200);
    await expect(adminPage.getByText("Recruiter approved")).toBeVisible({ timeout: 15_000 });

    // 3. The API reflects it and the recruiter now reaches the dashboard.
    const approvedList = await admin.request.get("/api/admin/approvals?type=recruiters&status=APPROVED");
    const approvedIds = ((await approvedList.json()) as { recruiters: Array<{ id: string }> }).recruiters.map((r) => r.id);
    expect(approvedIds).toContain(recruiterId);
    const stillPending = await admin.request.get("/api/admin/approvals?type=recruiters&status=PENDING_APPROVAL");
    expect(((await stillPending.json()) as { recruiters: Array<{ id: string }> }).recruiters.map((r) => r.id)).not.toContain(recruiterId);

    await pendingPage.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(pendingPage).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
    await expect(pendingPage.getByText("Loading...", { exact: true })).toHaveCount(0, { timeout: 30_000 });

    // 4. Rejecting requires a reason (validation stays intact).
    const noReason = await admin.request.patch(`/api/admin/approvals/${recruiterId}?type=recruiter`, {
      headers: await csrf(admin),
      data: { action: "rejected" },
    });
    expect(noReason.status()).toBe(400);
  } finally {
    // Reset the fixture to its seeded state (both stores the proxy and API read).
    const row = await prisma.recruiter.findUnique({ where: { id: recruiterId }, select: { supabaseUserId: true } }).catch(() => null);
    await prisma.recruiter.update({ where: { id: recruiterId }, data: { onboardingStatus: "PENDING_APPROVAL" } }).catch(() => {});
    if (row?.supabaseUserId) {
      await supabase.from("profiles").update({ onboarding_status: "pending_approval" }).eq("id", row.supabaseUserId);
    }
    await prisma.$disconnect().catch(() => {});
    await pending.close();
    await recruiter.close();
    await admin.close();
  }
});
