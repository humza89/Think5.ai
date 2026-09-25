import { createHmac } from "node:crypto";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { E2E_FIXTURES } from "../fixtures/e2e-fixtures";

/**
 * T9 identity: sign-in honours redirectTo and explains reasons, /auth/error
 * renders codes, the security page is real, and native TOTP MFA enrols,
 * verifies (aal2), issues recovery codes, and a recovery code resets it —
 * all against the local Supabase stack with real sessions.
 *
 * Uses the dedicated `identity` account (password rotation + factor changes
 * must not touch the shared recruiter). Serial: the password rotation would
 * otherwise race the sign-in tests of the same account.
 */
test.describe.configure({ mode: "serial" });
// Several of these pages compile on first request in a dev server.
test.setTimeout(120_000);

const fixturesRequired = process.env.E2E_AUTH_FIXTURES === "true";
const IDENTITY = E2E_FIXTURES.identity.email;

function seedPassword(): string {
  const password = process.env.E2E_SEED_PASSWORD;
  if (!password) throw new Error("E2E_SEED_PASSWORD must match the seed");
  return password;
}

async function signInOn(page: Page, email: string, password: string): Promise<void> {
  await page.waitForLoadState("networkidle");
  const emailField = page.locator("#email");
  const passwordField = page.locator("#password");
  await emailField.fill(email);
  await expect(emailField).toHaveValue(email);
  await passwordField.fill(password);
  await expect(passwordField).toHaveValue(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** A fresh browser context signed in through the real form (no storage state reuse). */
async function signedInContext(browser: Browser, email: string, password: string): Promise<BrowserContext> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/auth/signin", { waitUntil: "domcontentloaded" });
  await signInOn(page, email, password);
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
  await expect(page.getByText("Loading...", { exact: true })).toHaveCount(0, { timeout: 30_000 });
  await page.close();
  return context;
}

async function csrfHeaders(context: BrowserContext): Promise<Record<string, string>> {
  const cookie = (await context.cookies()).find((c) => c.name === "csrf-token-client");
  return cookie ? { "x-csrf-token": decodeURIComponent(cookie.value), "content-type": "application/json" } : { "content-type": "application/json" };
}

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) from a base32 secret, as an authenticator app would compute it. */
function totp(base32Secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of base32Secret.replace(/=+$/, "").toUpperCase()) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const digest = createHmac("sha1", bytes).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

test("/auth/error renders a human-readable message for a code", async ({ page }) => {
  await page.goto("/auth/error?code=saml_invalid_response", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "SAML response rejected" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("auth-error-code")).toContainText("saml_invalid_response");
  await page.goto("/auth/error?code=totally_unknown", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Something went wrong" })).toBeVisible({ timeout: 30_000 });
});

test("Continue with SSO tells a non-SSO domain what to do", async ({ page }) => {
  await page.goto("/auth/signin", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.locator("#email").fill("nobody@no-sso.example");
  await page.getByTestId("continue-with-sso").click();
  await expect(page.getByText(/Single sign-on is not set up for this email domain/)).toBeVisible({ timeout: 30_000 });
});

test("sign-in honours a same-origin redirectTo and explains an account reason", async ({ page }) => {
  test.skip(!fixturesRequired, "requires the seeded local stack");
  await page.goto("/auth/signin?reason=account_suspended", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("signin-notice")).toContainText("Account suspended");

  await page.goto("/auth/signin?redirectTo=%2Fjobs", { waitUntil: "domcontentloaded" });
  await signInOn(page, IDENTITY, seedPassword());
  await expect(page).toHaveURL(/\/jobs(?:\?|$)/, { timeout: 30_000 });
});

test("an external redirectTo is ignored in favour of the role home", async ({ page }) => {
  test.skip(!fixturesRequired, "requires the seeded local stack");
  await page.goto("/auth/signin?redirectTo=https%3A%2F%2Fevil.example%2F", { waitUntil: "domcontentloaded" });
  await signInOn(page, IDENTITY, seedPassword());
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
});

test("native TOTP MFA: enrol, verify to aal2, recovery codes, recovery resets", async ({ browser }) => {
  test.skip(!fixturesRequired, "requires the seeded local stack");
  const context = await signedInContext(browser, IDENTITY, seedPassword());
  try {
    const headers = await csrfHeaders(context);
    const before = await context.request.get("/api/auth/mfa/status");
    expect(before.status()).toBe(200);
    const beforeBody = await before.json();
    expect(beforeBody).toMatchObject({ required: false, satisfied: true });
    for (const f of beforeBody.factors as Array<{ id: string }>) {
      await context.request.delete("/api/auth/mfa/factor", { headers, data: { factorId: f.id } });
    }

    const enroll = await context.request.post("/api/auth/mfa/enroll", { headers, data: { friendlyName: "E2E authenticator" } });
    expect(enroll.status(), await enroll.text()).toBe(200);
    const { factorId, secret, qrCode } = await enroll.json();
    expect(factorId).toBeTruthy();
    expect(qrCode).toMatch(/^data:image\/svg\+xml/);

    const wrong = await context.request.post("/api/auth/mfa/verify", { headers, data: { factorId, code: "000000" } });
    expect(wrong.status()).toBe(400);

    const verify = await context.request.post("/api/auth/mfa/verify", { headers, data: { factorId, code: totp(secret) } });
    expect(verify.status(), await verify.text()).toBe(200);
    const { recoveryCodes } = await verify.json();
    expect(recoveryCodes).toHaveLength(10);

    const after = await (await context.request.get("/api/auth/mfa/status")).json();
    expect(after).toMatchObject({ currentLevel: "aal2", nextLevel: "aal2", recoveryCodesRemaining: 10 });
    expect(after.factors.filter((f: { status: string }) => f.status === "verified")).toHaveLength(1);

    const sessions = await (await context.request.get("/api/account/sessions")).json();
    expect(sessions.current.assuranceLevel).toBe("aal2");

    // A recovery code resets MFA (deletes factors, invalidates the other codes).
    const bad = await context.request.post("/api/auth/mfa/recover", { headers, data: { code: "AAAAA-AAAAA" } });
    expect(bad.status()).toBe(400);
    const recover = await context.request.post("/api/auth/mfa/recover", { headers, data: { code: recoveryCodes[3] } });
    expect(recover.status(), await recover.text()).toBe(200);
    const reset = await (await context.request.get("/api/auth/mfa/status")).json();
    expect(reset.factors.filter((f: { status: string }) => f.status === "verified")).toHaveLength(0);
    expect(reset.recoveryCodesRemaining).toBe(0);
    const reuse = await context.request.post("/api/auth/mfa/recover", { headers, data: { code: recoveryCodes[3] } });
    expect(reuse.status()).toBe(400);
  } finally {
    await context.close();
  }
});

test("security page: password change round-trips and account deletion is a cancellable request", async ({ browser }) => {
  test.skip(!fixturesRequired, "requires the seeded local stack");
  const context = await signedInContext(browser, IDENTITY, seedPassword());
  try {
    const headers = await csrfHeaders(context);
    const temp = `${seedPassword()}-rotated`;
    const bad = await context.request.post("/api/account/password", { headers, data: { currentPassword: "not-the-password", newPassword: temp } });
    expect(bad.status()).toBe(403);
    const change = await context.request.post("/api/account/password", { headers, data: { currentPassword: seedPassword(), newPassword: temp } });
    expect(change.status(), await change.text()).toBe(200);
    const revert = await context.request.post("/api/account/password", { headers, data: { currentPassword: temp, newPassword: seedPassword() } });
    expect(revert.status(), await revert.text()).toBe(200);

    const page = await context.newPage();
    await page.goto("/settings/security", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("mfa-card")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("mfa-state")).toContainText("Not set up");
    await page.getByRole("button", { name: "Delete Account" }).click();
    await page.getByPlaceholder('Type "DELETE" to confirm').fill("DELETE");
    await page.getByRole("button", { name: "Request deletion" }).click();
    await expect(page.getByTestId("pending-deletion")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Cancel request" }).click();
    await expect(page.getByTestId("pending-deletion")).toHaveCount(0, { timeout: 30_000 });
    const pending = await (await context.request.get("/api/account/delete")).json();
    expect(pending.pending).toBeNull();
    await page.close();
  } finally {
    await context.close();
  }
});
