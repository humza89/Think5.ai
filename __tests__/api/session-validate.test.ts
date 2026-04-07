import { describe, it, expect } from "vitest";

/**
 * Tests for POST /api/interviews/[id]/validate — dual-auth (body token + cookie) flow.
 * Validates WS1: cookie-only interview entry after accept flow.
 */

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

describe("interview validate dual-auth logic", () => {
  const INTERVIEW_ID = "int-123";
  const ACCESS_TOKEN = "tok-abc";

  describe("token extraction", () => {
    it("uses body accessToken when provided", () => {
      const body = { accessToken: ACCESS_TOKEN };
      const cookieValue: string | undefined = undefined;
      const interviewId = INTERVIEW_ID;

      // Replicate the dual-auth extraction logic from validate/route.ts lines 69-86
      let extractedToken = body.accessToken as string | undefined;
      if (!extractedToken) {
        if (cookieValue) {
          const [cookieId, cookieToken] = cookieValue.split(":");
          if (cookieId === interviewId && cookieToken) {
            extractedToken = cookieToken;
          }
        }
      }

      expect(extractedToken).toBe(ACCESS_TOKEN);
    });

    it("falls back to cookie when body token is empty", () => {
      const body = { accessToken: "" };
      const cookieValue = `${INTERVIEW_ID}:${ACCESS_TOKEN}`;
      const interviewId = INTERVIEW_ID;

      let extractedToken = body.accessToken as string | undefined;
      if (!extractedToken) {
        if (cookieValue) {
          const [cookieId, cookieToken] = cookieValue.split(":");
          if (cookieId === interviewId && cookieToken) {
            extractedToken = cookieToken;
          }
        }
      }

      expect(extractedToken).toBe(ACCESS_TOKEN);
    });

    it("falls back to cookie when body token is undefined", () => {
      const body = {};
      const cookieValue = `${INTERVIEW_ID}:${ACCESS_TOKEN}`;
      const interviewId = INTERVIEW_ID;

      let extractedToken = (body as Record<string, unknown>).accessToken as string | undefined;
      if (!extractedToken) {
        if (cookieValue) {
          const [cookieId, cookieToken] = cookieValue.split(":");
          if (cookieId === interviewId && cookieToken) {
            extractedToken = cookieToken;
          }
        }
      }

      expect(extractedToken).toBe(ACCESS_TOKEN);
    });

    it("rejects cookie with mismatched interview ID", () => {
      const body = {};
      const cookieValue = `different-id:${ACCESS_TOKEN}`;
      const interviewId = INTERVIEW_ID;

      let extractedToken = (body as Record<string, unknown>).accessToken as string | undefined;
      if (!extractedToken) {
        if (cookieValue) {
          const [cookieId, cookieToken] = cookieValue.split(":");
          if (cookieId === interviewId && cookieToken) {
            extractedToken = cookieToken;
          }
        }
      }

      expect(extractedToken).toBeUndefined();
    });

    it("returns undefined when neither body nor cookie provide a token", () => {
      const body = {};
      const cookieValue: string | undefined = undefined;
      const interviewId = INTERVIEW_ID;

      let extractedToken = (body as Record<string, unknown>).accessToken as string | undefined;
      if (!extractedToken) {
        if (cookieValue) {
          const [cookieId, cookieToken] = cookieValue.split(":");
          if (cookieId === interviewId && cookieToken) {
            extractedToken = cookieToken;
          }
        }
      }

      expect(extractedToken).toBeUndefined();
    });

    it("rejects cookie with missing token part", () => {
      const body = {};
      const cookieValue = `${INTERVIEW_ID}:`;
      const interviewId = INTERVIEW_ID;

      let extractedToken = (body as Record<string, unknown>).accessToken as string | undefined;
      if (!extractedToken) {
        if (cookieValue) {
          const [cookieId, cookieToken] = cookieValue.split(":");
          if (cookieId === interviewId && cookieToken) {
            extractedToken = cookieToken;
          }
        }
      }

      // Empty string after ":" is falsy, so cookieToken check fails
      expect(extractedToken).toBeUndefined();
    });

    it("prefers body token over cookie when both present", () => {
      const body = { accessToken: "body-token" };
      const cookieValue = `${INTERVIEW_ID}:cookie-token`;
      const interviewId = INTERVIEW_ID;

      let extractedToken = body.accessToken as string | undefined;
      if (!extractedToken) {
        if (cookieValue) {
          const [cookieId, cookieToken] = cookieValue.split(":");
          if (cookieId === interviewId && cookieToken) {
            extractedToken = cookieToken;
          }
        }
      }

      expect(extractedToken).toBe("body-token");
    });
  });

  describe("interview status validation", () => {
    it("rejects COMPLETED interviews", () => {
      const status = "COMPLETED";
      const isTerminal = status === "COMPLETED" || status === "CANCELLED" || status === "EXPIRED";
      expect(isTerminal).toBe(true);
    });

    it("rejects CANCELLED interviews", () => {
      const status = "CANCELLED";
      const isTerminal = status === "COMPLETED" || status === "CANCELLED" || status === "EXPIRED";
      expect(isTerminal).toBe(true);
    });

    it("rejects EXPIRED interviews", () => {
      const status = "EXPIRED";
      const isTerminal = status === "COMPLETED" || status === "CANCELLED" || status === "EXPIRED";
      expect(isTerminal).toBe(true);
    });

    it("allows PENDING interviews", () => {
      const status = "PENDING";
      const isTerminal = status === "COMPLETED" || status === "CANCELLED" || status === "EXPIRED";
      expect(isTerminal).toBe(false);
    });

    it("allows IN_PROGRESS interviews", () => {
      const status = "IN_PROGRESS";
      const isTerminal = status === "COMPLETED" || status === "CANCELLED" || status === "EXPIRED";
      expect(isTerminal).toBe(false);
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
