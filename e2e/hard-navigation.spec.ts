import { test, expect, Page } from "@playwright/test";

/**
 * Regression guard for the CSP that blocked Next.js inline hydration scripts
 * on app routes (script-src 'self' without 'unsafe-inline' or a nonce).
 *
 * Every test performs a DIRECT hard navigation with page.goto, never a
 * client-side transition, because client-side transitions keep the already
 * hydrated document alive and masked the defect. Each test then proves the
 * new document hydrated: a server-rendered loading shell must give way to
 * behaviour that only client JavaScript can produce, and the console must
 * contain no Content-Security-Policy violation.
 *
 * The authenticated golden suite (T0, PR #12) adds the signed-in
 * counterparts: hard loads of /dashboard, /candidate/dashboard and
 * /interview/[id] with real storage state.
 */

const CSP_VIOLATION = /Content Security Policy/i;

function collectCspViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && CSP_VIOLATION.test(message.text())) {
      violations.push(message.text());
    }
  });
  return violations;
}

test("candidate invitation accept route hydrates on hard navigation", async ({ page }) => {
  const violations = collectCspViolations(page);

  const response = await page.goto("/interview/accept?token=hard-navigation-probe", {
    waitUntil: "domcontentloaded",
  });
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp, "app route must allow Next.js inline scripts (unsafe-inline or nonce)").toMatch(
    /script-src 'self' ('unsafe-inline'|'nonce-)/,
  );

  // The server renders "Validating your invitation…". Only hydrated client
  // code can call /api/auth/invite and replace it with the error state.
  await expect(page.getByRole("heading", { name: "Invitation error" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Validating your invitation…")).toHaveCount(0);
  expect(violations).toEqual([]);
});

test("recruiter route hydrates on hard navigation", async ({ page }) => {
  const violations = collectCspViolations(page);

  // /interviews is served under the strict app CSP. Logged out, the server
  // renders the client guard's "Loading..." shell; only hydrated JavaScript
  // can run ProtectedRoute and move the browser to /auth/signin. If the
  // proxy later redirects this route server-side (Issue #15), the signed-in
  // hard loads in the authenticated golden suite remain the recruiter proof.
  await page.goto("/interviews", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 30_000 });
  expect(violations).toEqual([]);
});
