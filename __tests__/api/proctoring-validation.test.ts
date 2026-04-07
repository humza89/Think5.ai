import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

/**
 * Tests for POST /api/interviews/[id]/proctoring — Zod schema validation and rate limiting.
 * Validates WS4: malformed payloads rejected, rate limiting enforced.
 */

// Replicate the schema from the route to test validation in isolation
const proctoringEventSchema = z.object({
  accessToken: z.string().min(1),
  eventType: z.enum([
    "TAB_SWITCHED",
    "FULLSCREEN_EXITED",
    "PASTE_DETECTED",
    "COPY_DETECTED",
    "WEBCAM_LOST",
    "STRICT_VIOLATION_TERMINATED",
    "FOCUS_LOST",
    "DEVTOOLS_OPENED",
  ]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
});

const VALID_EVENT_TYPES = [
  "TAB_SWITCHED",
  "FULLSCREEN_EXITED",
  "PASTE_DETECTED",
  "COPY_DETECTED",
  "WEBCAM_LOST",
  "STRICT_VIOLATION_TERMINATED",
  "FOCUS_LOST",
  "DEVTOOLS_OPENED",
] as const;

const VALID_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

describe("proctoring event schema validation", () => {
  it("accepts all valid eventType enum values", () => {
    for (const eventType of VALID_EVENT_TYPES) {
      const result = proctoringEventSchema.safeParse({
        accessToken: "test-token",
        eventType,
        severity: "MEDIUM",
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts all valid severity enum values", () => {
    for (const severity of VALID_SEVERITIES) {
      const result = proctoringEventSchema.safeParse({
        accessToken: "test-token",
        eventType: "TAB_SWITCHED",
        severity,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid eventType", () => {
    const result = proctoringEventSchema.safeParse({
      accessToken: "test-token",
      eventType: "UNKNOWN_EVENT",
      severity: "HIGH",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("eventType");
    }
  });

  it("rejects invalid severity", () => {
    const result = proctoringEventSchema.safeParse({
      accessToken: "test-token",
      eventType: "TAB_SWITCHED",
      severity: "EXTREME",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("severity");
    }
  });

  it("rejects missing accessToken", () => {
    const result = proctoringEventSchema.safeParse({
      eventType: "TAB_SWITCHED",
      severity: "HIGH",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty accessToken", () => {
    const result = proctoringEventSchema.safeParse({
      accessToken: "",
      eventType: "TAB_SWITCHED",
      severity: "HIGH",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing eventType", () => {
    const result = proctoringEventSchema.safeParse({
      accessToken: "test-token",
      severity: "HIGH",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing severity", () => {
    const result = proctoringEventSchema.safeParse({
      accessToken: "test-token",
      eventType: "TAB_SWITCHED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects completely empty payload", () => {
    const result = proctoringEventSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error!.issues.length).toBeGreaterThanOrEqual(3);
  });

  it("ignores extra fields (Zod strips by default)", () => {
    const result = proctoringEventSchema.safeParse({
      accessToken: "test-token",
      eventType: "TAB_SWITCHED",
      severity: "HIGH",
      extraField: "should be ignored",
      maliciousPayload: { nested: true },
    });
    expect(result.success).toBe(true);
  });
});

describe("proctoring rate limiting", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("checkRateLimit enforces per-key limits", async () => {
    // Use in-memory rate limiter (no Redis in test)
    const { checkRateLimit } = await import("@/lib/rate-limit");
    const key = `proctoring:test-interview:127.0.0.1:${Date.now()}`;
    const config = { maxRequests: 3, windowMs: 60000 };

    // First 3 requests should be allowed
    for (let i = 0; i < 3; i++) {
      const result = await checkRateLimit(key, config);
      expect(result.allowed).toBe(true);
    }

    // 4th request should be denied
    const result = await checkRateLimit(key, config);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
