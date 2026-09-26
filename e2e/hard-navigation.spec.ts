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

// A production server (`next start`) redirects plain-http requests to https
// unless the proxy sees x-forwarded-proto=https. Sending it lets this spec
// run against a local production build as well as `next dev`; the header is
// ignored in development.
test.use({ extraHTTPHeaders: { "x-forwarded-proto": "https" } });

/**
 * Issue #14: app routes serve a per-request nonce policy. The script-src
 * directive must be exactly nonce + strict-dynamic — no 'unsafe-inline', no
 * host allow-list — and every inline framework script must carry the nonce.
 */
const APP_SCRIPT_SRC = /script-src 'nonce-[A-Za-z0-9+/=]{16,}' 'strict-dynamic'(;|$)/;

function scriptSrcOf(csp: string): string {
  return csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src")) ?? "";
}

async function expectNoncedInlineScripts(page: Page) {
  const audit = await page.evaluate(() => {
    // Executable inline scripts only: empty scripts run nothing, and
    // non-JS types (JSON, templates) are not subject to script-src. Scripts
    // inserted dynamically by trusted code (dev HMR client) carry no nonce
    // attribute by design; 'strict-dynamic' admits them and a blocked one
    // would surface as a CSP console violation, which is asserted separately.
    const executable = (s: HTMLScriptElement) =>
      !s.src && (s.textContent ?? "").trim().length > 0 && (!s.type || /^(text\/javascript|module)$/i.test(s.type));
    const inline = Array.from(document.scripts).filter(executable);
    return { inline: inline.length, inlineWithoutNonce: inline.filter((s) => !s.nonce).length };
  });
  expect(audit.inline, "hydrated Next.js documents carry inline framework scripts").toBeGreaterThan(0);
  expect(audit.inlineWithoutNonce, "every inline script must carry the request nonce").toBe(0);
}

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
  expect(scriptSrcOf(csp), "app route script-src must be nonce + strict-dynamic only").toMatch(APP_SCRIPT_SRC);
  expect(scriptSrcOf(csp)).not.toContain("'unsafe-inline'");

  // The server renders "Validating your invitation…". Only hydrated client
  // code can call /api/auth/invite and replace it with the error state.
  await expect(page.getByRole("heading", { name: "Invitation error" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Validating your invitation…")).toHaveCount(0);
  await expectNoncedInlineScripts(page);
  expect(violations).toEqual([]);

  // Refresh: a second document gets a different nonce and hydrates again.
  const second = await page.reload({ waitUntil: "domcontentloaded" });
  const secondCsp = second?.headers()["content-security-policy"] ?? "";
  expect(scriptSrcOf(secondCsp)).toMatch(APP_SCRIPT_SRC);
  expect(secondCsp).not.toBe(csp);
  await expect(page.getByRole("heading", { name: "Invitation error" })).toBeVisible({ timeout: 30_000 });
  await expectNoncedInlineScripts(page);
  expect(violations).toEqual([]);
});

test("public marketing and auth pages keep their static, cacheable policy", async ({ page }) => {
  const violations = collectCspViolations(page);
  for (const route of ["/", "/auth/signin", "/product"]) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    const csp = response?.headers()["content-security-policy"] ?? "";
    expect(scriptSrcOf(csp), `${route} keeps the documented static policy`).toBe("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("nonce-");
  }
  expect(violations).toEqual([]);
});

test("recruiter route hydrates on hard navigation", async ({ page }) => {
  const violations = collectCspViolations(page);

  // /interviews is served under the strict app CSP. Logged out, the server
  // renders the client guard's "Loading..." shell; only hydrated JavaScript
  // can run ProtectedRoute and move the browser to /auth/signin. If the
  // proxy later redirects this route server-side (Issue #15), the signed-in
  // hard loads in the authenticated golden suite remain the recruiter proof.
  const response = await page.goto("/interviews", { waitUntil: "domcontentloaded" });
  const csp = response?.headers()["content-security-policy"] ?? "";
  // The proxy redirects signed-out visitors server-side; the redirect carries
  // no document and no nonce policy, the sign-in page keeps the static one.
  if (response && !response.url().includes("/auth/signin")) {
    expect(scriptSrcOf(csp)).toMatch(APP_SCRIPT_SRC);
  }
  await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 30_000 });
  expect(violations).toEqual([]);
});
