/**
 * GET /api/reports/shared/[token]/data — per-IP and per-token rate limits and
 * the HMAC cookie gate. checkRateLimit and Prisma are mocked; the test covers
 * the route's branching only.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const rateLimitState = new Map<string, { allowed: boolean; resetAt: number }>();
const checkRateLimit = vi.fn(async (key: string) => {
  const preset = rateLimitState.get(key);
  if (preset) return { ...preset, remaining: preset.allowed ? 10 : 0 };
  return { allowed: true, remaining: 10, resetAt: Date.now() + 60_000 };
});
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...(a as [string])) }));

const report = {
  id: "rep-1",
  shareRevoked: false,
  shareExpiresAt: null as Date | null,
  recipientEmail: null as string | null,
  shareScopes: [] as string[],
  overallScore: 8.5,
  recommendation: "HIRE",
  summary: "Solid candidate",
  interview: {
    id: "iv-1",
    type: "technical",
    createdAt: new Date(),
    overallScore: 8.5,
    transcript: [],
    integrityEvents: [],
    candidate: { fullName: "Jane Doe", currentTitle: "Senior SWE" },
    template: { isShadow: false },
  },
};

const findUnique = vi.fn(async () => report);
const shareViewCreate = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    interviewReport: { findUnique: () => findUnique() },
    reportShareView: { create: (...a: unknown[]) => shareViewCreate(...(a as [])) },
  },
}));

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
  }),
}));

function makeRequest(ip: string): Request {
  return new Request("https://example.com/api/reports/shared/test-token/data", {
    method: "GET",
    headers: { "x-forwarded-for": ip, "user-agent": "test-agent" },
  });
}

async function call(ip: string, token = "test-token") {
  const { GET } = await import("@/app/api/reports/shared/[token]/data/route");
  return GET(makeRequest(ip) as never, { params: Promise.resolve({ token }) });
}

beforeEach(() => {
  rateLimitState.clear();
  cookieJar.clear();
  checkRateLimit.mockClear();
  shareViewCreate.mockClear();
  findUnique.mockClear();
  report.recipientEmail = null;
  process.env.NEXTAUTH_SECRET = "test-secret-long-enough-for-hmac-0123456789";
  vi.resetModules();
});

describe("rate limiting", () => {
  it("returns 200 and logs the view when both limits allow", async () => {
    const res = await call("1.2.3.4");
    expect(res.status).toBe(200);
    expect(checkRateLimit.mock.calls.map((c) => c[0])).toEqual(["shared-report:ip:1.2.3.4", "shared-report:token:test-token"]);
    expect(shareViewCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reportId: "rep-1", shareToken: "test-token", viewerIp: "1.2.3.4" }) }),
    );
  });

  it("returns 429 with Retry-After before touching the DB when the IP limit is exhausted", async () => {
    rateLimitState.set("shared-report:ip:9.9.9.9", { allowed: false, resetAt: Date.now() + 45_000 });
    const res = await call("9.9.9.9");
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(findUnique).not.toHaveBeenCalled();
    expect(shareViewCreate).not.toHaveBeenCalled();
    // The per-token limiter is never consulted once the IP limiter has refused.
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
  });

  it("returns 429 when the per-token limit is exhausted", async () => {
    rateLimitState.set("shared-report:token:hot-token", { allowed: false, resetAt: Date.now() + 30_000 });
    const res = await call("5.5.5.5", "hot-token");
    expect(res.status).toBe(429);
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("email gate", () => {
  beforeEach(() => {
    report.recipientEmail = "Reviewer@Example.com";
  });

  it("requires verification when no cookie is present", async () => {
    const res = await call("1.2.3.4");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ requiresEmailVerification: true });
  });

  it("accepts a valid HMAC cookie from the same network", async () => {
    const { signReportShareCookie } = await import("@/lib/report-share-cookie");
    const { createHash } = await import("crypto");
    const emailHash = createHash("sha256").update("reviewer@example.com").digest("hex");
    cookieJar.set("report-access-test-token", signReportShareCookie({ token: "test-token", emailHash, ip: "1.2.3.7" }));
    const res = await call("1.2.3.4");
    expect(res.status).toBe(200);
  });

  it("rejects the legacy plain-SHA256 cookie and a cookie from another network", async () => {
    cookieJar.set("report-access-test-token", "f".repeat(64));
    let res = await call("1.2.3.4");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ requiresEmailVerification: true, reason: "malformed" });

    const { signReportShareCookie } = await import("@/lib/report-share-cookie");
    const { createHash } = await import("crypto");
    const emailHash = createHash("sha256").update("reviewer@example.com").digest("hex");
    cookieJar.set("report-access-test-token", signReportShareCookie({ token: "test-token", emailHash, ip: "10.0.0.1" }));
    res = await call("1.2.3.4");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ requiresEmailVerification: true, reason: "ip_mismatch" });
  });

  it("asks for re-verification when the cookie has expired", async () => {
    const { signReportShareCookie } = await import("@/lib/report-share-cookie");
    const { createHash } = await import("crypto");
    const emailHash = createHash("sha256").update("reviewer@example.com").digest("hex");
    cookieJar.set("report-access-test-token", signReportShareCookie({ token: "test-token", emailHash, ip: "1.2.3.4", now: Date.now() - 3 * 60 * 60 * 1000 }));
    const res = await call("1.2.3.4");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ requiresEmailVerification: true, reason: "expired" });
  });
});
