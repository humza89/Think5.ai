/**
 * The email-gated shared report is opened by recipients without a session:
 * proxy.ts must let the two share-token routes through to their own checks
 * (token lookup, HMAC email-gate cookie, rate limits). Regression guard for
 * the defect the share-link golden spec found (401 before the route ran).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const proxySource = readFileSync("proxy.ts", "utf8");

describe("shared report routes are reachable without a session", () => {
  const pattern = /^\/api\/reports\/shared\/[^/]+\/(data|verify-email)$/;

  it("proxy.ts declares the shared-report public pattern and consults it in authorize()", () => {
    expect(proxySource).toContain("const sharedReportPublicPattern = /^\\/api\\/reports\\/shared\\/[^/]+\\/(data|verify-email)$/;");
    const authorizeIdx = proxySource.indexOf("async function authorize(");
    const unauthorizedIdx = proxySource.indexOf("return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });", authorizeIdx);
    const gateIdx = proxySource.indexOf("if (sharedReportPublicPattern.test(pathname))", authorizeIdx);
    expect(gateIdx).toBeGreaterThan(authorizeIdx);
    expect(gateIdx).toBeLessThan(unauthorizedIdx);
  });

  it("the pattern covers exactly the two token-authenticated routes", () => {
    expect(pattern.test("/api/reports/shared/abc-123/data")).toBe(true);
    expect(pattern.test("/api/reports/shared/abc-123/verify-email")).toBe(true);
    expect(pattern.test("/api/reports/shared/abc-123")).toBe(false);
    expect(pattern.test("/api/reports/shared/abc-123/data/extra")).toBe(false);
    expect(pattern.test("/api/reports/other/abc-123/data")).toBe(false);
    expect(pattern.test("/api/interviews/abc/report/share")).toBe(false);
  });

  it("verify-email stays under the CSRF check (state-changing POST, cookie issued on page load)", () => {
    const start = proxySource.indexOf("const CSRF_EXEMPT_PATTERNS = [");
    const end = proxySource.indexOf("];", start);
    expect(start).toBeGreaterThan(0);
    // The exemption list may mention "reports" in comments (CSP violation
    // reports); what must not appear is an exemption for the shared-report routes.
    expect(proxySource.slice(start, end)).not.toMatch(/reports\\\/shared/);
  });
});
