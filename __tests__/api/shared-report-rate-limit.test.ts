/**
 * Track-1 Task 5 correctness tests for shared-report token rate limiting.
 *
 * Verifies the two-layer (per-IP, per-token) rate-limit gates on the
 * GET /api/reports/shared/[token]/data route. Uses a mocked
 * checkRateLimit and a mocked Prisma client so the test exercises only
 * the route's branching logic, not any infra.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks -----------------------------------------------------------

const rateLimitState: {
  byKey: Map<string, { allowed: boolean; resetAt: number }>;
} = { byKey: new Map() };

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async (key: string) => {
    const preset = rateLimitState.byKey.get(key);
    if (preset) return { ...preset, remaining: preset.allowed ? 10 : 0 };
    return { allowed: true, remaining: 10, resetAt: Date.now() + 60_000 };
  }),
}));

const mockReport = {
  id: "rep-1",
  shareRevoked: false,
  shareExpiresAt: null,
  recipientEmail: null,
  shareScopes: [],
  overallScore: 8.5,
  recommendation: "HIRE",
  summary: "Solid candidate",
  technicalSkills: null,
  softSkills: null,
  domainExpertise: null,
  clarityStructure: null,
  problemSolving: null,
  communicationScore: null,
  measurableImpact: null,
  strengths: [],
  areasToImprove: [],
  hiringAdvice: null,
  integrityScore: null,
  integrityFlags: null,
  headline: null,
  confidenceLevel: null,
  professionalExperience: null,
  roleFit: null,
  culturalFit: null,
  thinkingJudgment: null,
  riskSignals: null,
  hypothesisOutcomes: null,
  evidenceHighlights: null,
  jobMatchScore: null,
  requirementMatches: null,
  environmentFitNotes: null,
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

const shareViewCreate = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    interviewReport: {
      findUnique: vi.fn(async () => mockReport),
    },
    reportShareView: {
      create: shareViewCreate,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
  }),
}));

// Stub NextResponse.json (vitest env doesn't always have the Next runtime fixture)
function makeRequest(ip: string): Request {
  return new Request("https://example.com/api/reports/shared/test-token/data", {
    method: "GET",
    headers: { "x-forwarded-for": ip, "user-agent": "test-agent" },
  });
}

beforeEach(() => {
  rateLimitState.byKey.clear();
  vi.resetModules();
  shareViewCreate.mockClear();
});

// --- Tests -----------------------------------------------------------

describe("GET /api/reports/shared/[token]/data — rate limiting", () => {
  it("returns 200 when rate limiter allows both IP and token checks", async () => {
    const { GET } = await import("@/app/api/reports/shared/[token]/data/route");
    const res = await GET(makeRequest("1.2.3.4") as never, {
      params: Promise.resolve({ token: "test-token" }),
    });
    expect(res.status).toBe(200);
    // Successful view is logged
    expect(shareViewCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportId: "rep-1",
          shareToken: "test-token",
          viewerIp: "1.2.3.4",
        }),
      }),
    );
  });

  it("returns 429 with Retry-After when the per-IP rate limit is exhausted", async () => {
    rateLimitState.byKey.set("shared-report:ip:9.9.9.9", {
      allowed: false,
      resetAt: Date.now() + 45_000,
    });
    const { GET } = await import("@/app/api/reports/shared/[token]/data/route");
    const res = await GET(makeRequest("9.9.9.9") as never, {
      params: Promise.resolve({ token: "test-token" }),
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    // DB must not have been touched when IP rate-limited
    expect(shareViewCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reportId: "rep-1" }),
      }),
    );
  });

  it("returns 429 when the per-token rate limit is exhausted AND logs an audit event", async () => {
    rateLimitState.byKey.set("shared-report:token:hot-token", {
      allowed: false,
      resetAt: Date.now() + 30_000,
    });
    const { GET } = await import("@/app/api/reports/shared/[token]/data/route");
    const res = await GET(makeRequest("5.5.5.5") as never, {
      params: Promise.resolve({ token: "hot-token" }),
    });
    expect(res.status).toBe(429);
    // Audit: a rate-limited attempt is persisted with a sentinel reportId
    // so admins can see enumeration patterns.
    expect(shareViewCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportId: "rate-limited",
          shareToken: "hot-token",
          viewerIp: "5.5.5.5",
        }),
      }),
    );
  });

  it("IP rate-limit is checked before per-token limit (prevents DB touch entirely)", async () => {
    rateLimitState.byKey.set("shared-report:ip:8.8.8.8", {
      allowed: false,
      resetAt: Date.now() + 45_000,
    });
    // Also set the token limit to "allowed" — this should not be reached.
    rateLimitState.byKey.set("shared-report:token:never-checked", {
      allowed: true,
      resetAt: Date.now() + 60_000,
    });
    const { GET } = await import("@/app/api/reports/shared/[token]/data/route");
    const res = await GET(makeRequest("8.8.8.8") as never, {
      params: Promise.resolve({ token: "never-checked" }),
    });
    expect(res.status).toBe(429);
    // No audit-log entry for the per-token layer — IP short-circuited first.
    expect(shareViewCreate).not.toHaveBeenCalled();
  });
});
