import fs from "node:fs";
import { test, expect, BrowserContext, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { E2E_FIXTURES, STORAGE_STATE_PATHS } from "../fixtures/e2e-fixtures";

/**
 * Plan spec `auth.spec`: signup → email verification → recruiter onboarding →
 * pending approval → admin approval → dashboard access.
 *
 * Every step uses the product's real path. The one local substitution is the
 * email itself: the local stack runs without a mail service, so the spec reads
 * the row that POST /api/auth/register wrote to `public.verification_tokens`
 * (service-role client, the same table the emailed link points at) and opens
 * the product's own verification URL with it. Nothing bypasses the route:
 * `/api/auth/verify` still validates and consumes the token and marks the
 * Supabase user confirmed. Onboarding is completed through the recruiter
 * onboarding API (the wizard's own endpoint, with the CSRF header), and the
 * approval happens on the admin approvals page.
 */
const fixturesRequired = process.env.E2E_AUTH_FIXTURES === "true";
const adminStorage =
  process.env.E2E_ADMIN_STORAGE_STATE ?? (fs.existsSync(STORAGE_STATE_PATHS.admin) ? STORAGE_STATE_PATHS.admin : undefined);

const SIGNUP = E2E_FIXTURES.signup;

async function csrf(context: BrowserContext): Promise<Record<string, string>> {
  const cookie = (await context.cookies()).find((c) => c.name === "csrf-token-client");
  if (!cookie) throw new Error("csrf-token-client cookie missing from the context");
  return { "x-csrf-token": cookie.value, "Content-Type": "application/json" };
}

function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function removeSignupAccount(prisma: PrismaClient, supabase: ReturnType<typeof adminDb>) {
  await prisma.recruiter.deleteMany({ where: { email: SIGNUP.email } }).catch(() => {});
  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const leftover = data?.users.find((u) => u.email?.toLowerCase() === SIGNUP.email);
  if (leftover) await supabase.auth.admin.deleteUser(leftover.id);
}

async function fillControlled(page: Page, selector: string, value: string) {
  const field = page.locator(selector);
  await field.fill(value);
  await expect(field).toHaveValue(value);
}

test("recruiter signs up, verifies, onboards, waits for approval, is approved by an admin and reaches the dashboard", async ({ browser }) => {
  test.skip(!fixturesRequired && !adminStorage, "requires admin storage state");
  test.skip(!process.env.DATABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY, "requires the local stack credentials");
  test.setTimeout(240_000);

  const prisma = new PrismaClient();
  const supabase = adminDb();
  await removeSignupAccount(prisma, supabase);

  const recruiter = await browser.newContext();
  const admin = await browser.newContext({ storageState: adminStorage! });
  try {
    // 1. Signup through the real form (POST /api/auth/register).
    const page = await recruiter.newPage();
    await page.goto("/auth/signup", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /Recruiter/ }).click();
    await fillControlled(page, "#firstName", SIGNUP.firstName);
    await fillControlled(page, "#lastName", SIGNUP.lastName);
    await fillControlled(page, "#email", SIGNUP.email);
    await fillControlled(page, "#password", SIGNUP.password);
    await fillControlled(page, "#confirmPassword", SIGNUP.password);
    const registered = page.waitForResponse((r) => r.url().includes("/api/auth/register") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Create account" }).click();
    expect((await registered).status(), "register").toBe(200);
    await expect(page.getByText("Check your email")).toBeVisible({ timeout: 30_000 });

    // 2. The account exists but is unverified; signing in is not yet a full session.
    const { data: profile } = await supabase.from("profiles").select("id, role, email_verified, onboarding_status").eq("email", SIGNUP.email).single();
    expect(profile, "profile row created by registration").toBeTruthy();
    expect(profile!.role).toBe("recruiter");
    expect(profile!.email_verified).toBe(false);

    // 3. Email verification: read the token the register route stored (the
    //    emailed link carries the same value) and open the product's verify URL.
    const { data: tokenRow } = await supabase.from("verification_tokens").select("token").eq("user_id", profile!.id).single();
    expect(tokenRow?.token, "verification token written by /api/auth/register").toBeTruthy();
    await page.goto(`/api/auth/verify?token=${encodeURIComponent(tokenRow!.token)}`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/auth\/verify\?success=true/, { timeout: 30_000 });
    await expect(page.getByText("Email verified")).toBeVisible();
    const { data: verified } = await supabase.from("profiles").select("email_verified").eq("id", profile!.id).single();
    expect(verified?.email_verified).toBe(true);
    const { data: consumed } = await supabase.from("verification_tokens").select("token").eq("user_id", profile!.id);
    expect(consumed ?? [], "token is single-use").toHaveLength(0);

    // 4. Sign in through the real form; the proxy routes an un-onboarded recruiter to onboarding.
    await page.goto("/auth/signin", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await fillControlled(page, "#email", SIGNUP.email);
    await fillControlled(page, "#password", SIGNUP.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/recruiter\/onboarding(?:\/|\?|$)/, { timeout: 30_000 });
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/recruiter\/onboarding(?:\/|\?|$)/, { timeout: 30_000 });

    // 5. Recruiter onboarding through its API (the wizard's endpoint), joining the seeded company.
    const headers = await csrf(recruiter);
    const steps: Array<{ step: number; data: Record<string, unknown> }> = [
      { step: 1, data: { name: SIGNUP.name, title: "Talent Partner" } },
      { step: 2, data: { mode: "join", companyId: E2E_FIXTURES.ids.company } },
      { step: 3, data: { skip: true, invitations: [] } },
      { step: 4, data: { evaluationCriteria: ["Ownership"], preferredAttributes: ["Clarity"] } },
      { step: 5, data: { acknowledged: true } },
    ];
    for (const body of steps) {
      const res = await recruiter.request.patch("/api/recruiter/onboarding", { headers, data: body });
      expect(res.status(), `onboarding step ${body.step}`).toBe(200);
    }
    const state = await recruiter.request.get("/api/recruiter/onboarding");
    expect((await state.json()) as object).toMatchObject({ completed: true, status: "PENDING_APPROVAL" });
    const recruiterRow = await prisma.recruiter.findUnique({ where: { email: SIGNUP.email }, select: { id: true, companyId: true } });
    expect(recruiterRow?.companyId).toBe(E2E_FIXTURES.ids.company);

    // 6. Pending approval: the dashboard is held behind the status page.
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/recruiter\/onboarding\/status(?:\?|$)/, { timeout: 30_000 });

    // 7. Admin approves on the approvals page.
    const adminPage = await admin.newPage();
    await adminPage.goto("/admin/approvals", { waitUntil: "domcontentloaded" });
    await expect(adminPage.getByText("Loading...", { exact: true })).toHaveCount(0, { timeout: 30_000 });
    await adminPage.getByRole("button", { name: "Recruiters" }).click();
    const row = adminPage.locator("tr").filter({ hasText: SIGNUP.name });
    await expect(row).toBeVisible({ timeout: 30_000 });
    const approved = adminPage.waitForResponse(
      (r) => r.url().includes(`/api/admin/approvals/${recruiterRow!.id}`) && r.request().method() === "PATCH",
    );
    await row.getByTitle("Approve").click();
    expect((await approved).status(), "approve from the UI").toBe(200);
    await expect(adminPage.getByText("Recruiter approved")).toBeVisible({ timeout: 15_000 });

    // 8. The recruiter now has the intended access.
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
    await expect(page.getByText("Loading...", { exact: true })).toHaveCount(0, { timeout: 30_000 });
    const { data: finalProfile } = await supabase.from("profiles").select("onboarding_status").eq("id", profile!.id).single();
    expect(finalProfile?.onboarding_status).toBe("approved");
  } finally {
    await removeSignupAccount(prisma, supabase).catch(() => {});
    await prisma.$disconnect().catch(() => {});
    await admin.close();
    await recruiter.close();
  }
});
