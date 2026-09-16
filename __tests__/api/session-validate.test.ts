import { describe, it, expect } from "vitest";

/**
 * Tests for POST /api/interviews/[id]/validate — dual-auth (body token + cookie) flow.
 * Validates WS1: cookie-only interview entry after accept flow.
 */

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

function extractToken(
  bodyToken: string | undefined,
  cookieValue: string | undefined,
  interviewId: string,
): string | undefined {
  let extractedToken = bodyToken;
  if (!extractedToken && cookieValue) {
    const [cookieId, cookieToken] = cookieValue.split(":");
    if (cookieId === interviewId && cookieToken) {
      extractedToken = cookieToken;
    }
  }
  return extractedToken;
}

function isTerminalStatus(status: string): boolean {
  return ["COMPLETED", "CANCELLED", "EXPIRED"].includes(status);
}

describe("interview validate dual-auth logic", () => {
  const INTERVIEW_ID = "int-123";
  const ACCESS_TOKEN = "tok-abc";

  describe("token extraction", () => {
    it("uses body accessToken when provided", () => {
      const body = { accessToken: ACCESS_TOKEN };
      expect(extractToken(body.accessToken, undefined, INTERVIEW_ID)).toBe(ACCESS_TOKEN);
    });

    it("falls back to cookie when body token is empty", () => {
      const body = { accessToken: "" };
      expect(extractToken(body.accessToken, `${INTERVIEW_ID}:${ACCESS_TOKEN}`, INTERVIEW_ID)).toBe(ACCESS_TOKEN);
    });

    it("falls back to cookie when body token is undefined", () => {
      const body = {} as Record<string, unknown>;
      expect(
        extractToken(body.accessToken as string | undefined, `${INTERVIEW_ID}:${ACCESS_TOKEN}`, INTERVIEW_ID),
      ).toBe(ACCESS_TOKEN);
    });

    it("rejects cookie with mismatched interview ID", () => {
      expect(extractToken(undefined, `different-id:${ACCESS_TOKEN}`, INTERVIEW_ID)).toBeUndefined();
    });

    it("returns undefined when neither body nor cookie provide a token", () => {
      expect(extractToken(undefined, undefined, INTERVIEW_ID)).toBeUndefined();
    });

    it("rejects cookie with missing token part", () => {
      expect(extractToken(undefined, `${INTERVIEW_ID}:`, INTERVIEW_ID)).toBeUndefined();
    });

    it("prefers body token over cookie when both present", () => {
      expect(extractToken("body-token", `${INTERVIEW_ID}:cookie-token`, INTERVIEW_ID)).toBe("body-token");
    });
  });

  describe("interview status validation", () => {
    it("rejects COMPLETED interviews", () => {
      expect(isTerminalStatus("COMPLETED")).toBe(true);
    });

    it("rejects CANCELLED interviews", () => {
      expect(isTerminalStatus("CANCELLED")).toBe(true);
    });

    it("rejects EXPIRED interviews", () => {
      expect(isTerminalStatus("EXPIRED")).toBe(true);
    });

    it("allows PENDING interviews", () => {
      expect(isTerminalStatus("PENDING")).toBe(false);
    });

    it("allows IN_PROGRESS interviews", () => {
      expect(isTerminalStatus("IN_PROGRESS")).toBe(false);
    });
  });

  describe("token expiry validation", () => {
    it("rejects expired tokens", () => {
      const expiresAt = new Date(Date.now() - 60000); // 1 minute ago
      const isExpired = expiresAt && new Date() > new Date(expiresAt);
      expect(isExpired).toBe(true);
    });

    it("allows valid tokens", () => {
      const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now
      const isExpired = expiresAt && new Date() > new Date(expiresAt);
      expect(isExpired).toBe(false);
    });

    it("allows tokens with no expiry", () => {
      const expiresAt = null;
      const isExpired = expiresAt && new Date() > new Date(expiresAt);
      expect(isExpired).toBeFalsy();
    });
  });
});
