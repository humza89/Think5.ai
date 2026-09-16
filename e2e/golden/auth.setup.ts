import fs from "node:fs";
import path from "node:path";
import { test as setup, expect, Page } from "@playwright/test";
import { E2E_FIXTURES, STORAGE_STATE_PATHS } from "../fixtures/e2e-fixtures";

/**
 * Produces authenticated Playwright storage state through the REAL product
 * auth path: the seeded accounts sign in on /auth/signin against the local
 * Supabase stack, and the candidate then accepts a seeded invitation on
 * /interview/accept so the HttpOnly `interview-session` cookie is issued by
 * the same API route production uses. No route guard, cookie or token is
 * forged here.
 *
 * Runs as the `setup` project that `chromium` depends on. It is a no-op
 * unless E2E_AUTH_FIXTURES=true (CI sets it after seeding the stack).
 */

const fixturesEnabled = process.env.E2E_AUTH_FIXTURES === "true";

// Sign-in plus invitation acceptance hits several routes that a dev server
// compiles on first request; give the setup steps room for that.
setup.setTimeout(120_000);

function seedPassword(): string {
  const password = process.env.E2E_SEED_PASSWORD;
  if (!password) {
    throw new Error("E2E_SEED_PASSWORD must match the value used by `npm run e2e:seed`");
  }
  return password;
}

async function signIn(page: Page, email: string, landing: RegExp): Promise<void> {
  await page.goto("/auth/signin", { waitUntil: "domcontentloaded" });
  // The form is a controlled React component: values typed before hydration
  // are discarded when React mounts. Wait for the page to go quiet, then
  // assert each value stuck before submitting.
  await page.waitForLoadState("networkidle");
  const emailField = page.locator("#email");
  const passwordField = page.locator("#password");
  await emailField.fill(email);
  await expect(emailField).toHaveValue(email);
  await passwordField.fill(seedPassword());
  await expect(passwordField).toHaveValue(seedPassword());
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(landing, { timeout: 30_000 });
  // ProtectedRoute renders "Loading..." until the session + profile resolve.
  await expect(page.getByText("Loading...", { exact: true })).toHaveCount(0, { timeout: 30_000 });
}

async function persist(page: Page, target: string): Promise<void> {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await page.context().storageState({ path: target });
}

setup("recruiter storage state", async ({ page }) => {
  setup.skip(!fixturesEnabled, "Set E2E_AUTH_FIXTURES=true against a seeded local Supabase stack");
  await signIn(page, E2E_FIXTURES.recruiter.email, /\/dashboard(?:\?|$)/);
  await persist(page, STORAGE_STATE_PATHS.recruiter);
});

setup("candidate storage state", async ({ page }) => {
  setup.skip(!fixturesEnabled, "Set E2E_AUTH_FIXTURES=true against a seeded local Supabase stack");
  await signIn(page, E2E_FIXTURES.candidate.email, /\/candidate\/dashboard(?:\?|$)/);

  // Real invitation acceptance: POST /api/interviews/accept sets the
  // HttpOnly interview-session cookie and redirects into the room.
  await page.goto(E2E_FIXTURES.routes.acceptInvitation, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Accept & start interview" }).click();
  await expect(page).toHaveURL(new RegExp(`${E2E_FIXTURES.routes.interviewWelcome}(?:\\?|$)`), {
    timeout: 30_000,
  });
  await expect(page.getByText(`Welcome, ${E2E_FIXTURES.candidate.fullName}`)).toBeVisible({
    timeout: 30_000,
  });

  await persist(page, STORAGE_STATE_PATHS.candidate);
});
