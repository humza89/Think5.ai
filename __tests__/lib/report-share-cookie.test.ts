/**
 * Track 5 Task 21 tests for lib/report-share-cookie.ts.
 *
 * Locks in the HMAC-based cookie contract:
 *   1. signReportShareCookie + verifyReportShareCookie round-trip.
 *   2. Any tamper on the MAC or payload → bad_mac.
 *   3. Expiry embedded in the payload is enforced independent of
 *      cookie Max-Age.
 *   4. IP /24 binding rejects a cookie replayed from another network.
 *   5. isSameOriginRequest accepts same-origin, rejects cross-origin,
 *      accepts explicit allowlist.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  signReportShareCookie,
  verifyReportShareCookie,
  isSameOriginRequest,
  REPORT_COOKIE_TTL_SECONDS,
} from "@/lib/report-share-cookie";

const ORIGINAL_SECRET = process.env.NEXTAUTH_SECRET;

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-long-enough-for-hmac-0123456789";
  delete process.env.REPORT_SHARE_ALLOWED_ORIGINS;
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.NEXTAUTH_SECRET;
  } else {
    process.env.NEXTAUTH_SECRET = ORIGINAL_SECRET;
  }
});

// ── sign / verify round-trip ─────────────────────────────────────────

describe("signReportShareCookie / verifyReportShareCookie", () => {
  const baseArgs = {
    token: "share-token-abc",
    emailHash: "e".repeat(64),
    ip: "192.168.1.42",
  };

  it("round-trips on the happy path", () => {
    const signed = signReportShareCookie(baseArgs);
    const result = verifyReportShareCookie({ ...baseArgs, cookieValue: signed });
    expect(result.ok).toBe(true);
  });

  it("throws on sign when NEXTAUTH_SECRET is missing", () => {
    delete process.env.NEXTAUTH_SECRET;
    expect(() => signReportShareCookie(baseArgs)).toThrow(/NEXTAUTH_SECRET/);
  });

  it("returns no_secret on verify when NEXTAUTH_SECRET is missing", () => {
    const signed = signReportShareCookie(baseArgs);
    delete process.env.NEXTAUTH_SECRET;
    const result = verifyReportShareCookie({ ...baseArgs, cookieValue: signed });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_secret");
  });

  it("rejects a malformed cookie", () => {
    const result = verifyReportShareCookie({
      ...baseArgs,
      cookieValue: "not-a-valid-cookie",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed");
  });

  it("rejects an empty cookie value", () => {
    const result = verifyReportShareCookie({ ...baseArgs, cookieValue: "" });
    expect(result.ok).toBe(false);
  });
});

// ── tamper resistance ───────────────────────────────────────────────

describe("HMAC tamper resistance", () => {
  const baseArgs = {
    token: "t",
    emailHash: "h".repeat(64),
    ip: "10.0.0.1",
  };

  it("rejects a cookie with a mutated MAC", () => {
    const signed = signReportShareCookie(baseArgs);
    const parts = signed.split("|");
    // Flip one character of the MAC
    const macChar = parts[2]![0] === "0" ? "1" : "0";
    const tampered = `${parts[0]}|${parts[1]}|${macChar}${parts[2]!.slice(1)}`;
    const result = verifyReportShareCookie({ ...baseArgs, cookieValue: tampered });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_mac");
  });

  it("rejects a cookie with a mutated expiry", () => {
    const signed = signReportShareCookie(baseArgs);
    const parts = signed.split("|");
    // Extend expiry — a naive scheme would let this through
    const futureExpiry = parseInt(parts[0]!, 10) + 86400 * 365;
    const tampered = `${futureExpiry}|${parts[1]}|${parts[2]}`;
    const result = verifyReportShareCookie({ ...baseArgs, cookieValue: tampered });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_mac");
  });

  it("rejects a cookie signed with a different secret", () => {
    const signed = signReportShareCookie(baseArgs);
    process.env.NEXTAUTH_SECRET = "different-secret-also-long-enough-9876543210";
    const result = verifyReportShareCookie({ ...baseArgs, cookieValue: signed });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_mac");
  });
});

// ── expiry ──────────────────────────────────────────────────────────

describe("expiry enforcement", () => {
  const baseArgs = {
    token: "t",
    emailHash: "h".repeat(64),
    ip: "10.0.0.1",
  };

  it("accepts a fresh cookie", () => {
    const signed = signReportShareCookie(baseArgs);
    const result = verifyReportShareCookie({
      ...baseArgs,
      cookieValue: signed,
      now: Date.now() + 60_000, // 1 min later
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a cookie whose embedded expiry has passed", () => {
    const signed = signReportShareCookie({ ...baseArgs, ttlSeconds: 60 });
    const result = verifyReportShareCookie({
      ...baseArgs,
      cookieValue: signed,
      now: Date.now() + 120_000, // 2 min later — past the 60s TTL
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("default TTL is 2 hours", () => {
    expect(REPORT_COOKIE_TTL_SECONDS).toBe(2 * 60 * 60);
  });
});

// ── IP /24 binding ───────────────────────────────────────────────────

describe("IP /24 binding", () => {
  const baseArgs = {
    token: "t",
    emailHash: "h".repeat(64),
    ip: "192.168.1.42",
  };

  it("accepts replay from the SAME /24", () => {
    const signed = signReportShareCookie(baseArgs);
    const result = verifyReportShareCookie({
      ...baseArgs,
      ip: "192.168.1.99", // different host, same /24
      cookieValue: signed,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects replay from a DIFFERENT /24", () => {
    const signed = signReportShareCookie(baseArgs);
    const result = verifyReportShareCookie({
      ...baseArgs,
      ip: "10.0.0.1", // totally different network
      cookieValue: signed,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("ip_mismatch");
  });
});

// ── CSRF origin check ───────────────────────────────────────────────

describe("isSameOriginRequest", () => {
  it("accepts when Origin host matches request Host", () => {
    const headers = new Headers({
      origin: "https://app.example.com",
      host: "app.example.com",
    });
    expect(isSameOriginRequest(headers)).toBe(true);
  });

  it("rejects when Origin host differs from Host", () => {
    const headers = new Headers({
      origin: "https://evil.example.com",
      host: "app.example.com",
    });
    expect(isSameOriginRequest(headers)).toBe(false);
  });

  it("rejects when Origin is missing", () => {
    const headers = new Headers({ host: "app.example.com" });
    expect(isSameOriginRequest(headers)).toBe(false);
  });

  it("accepts an origin listed in REPORT_SHARE_ALLOWED_ORIGINS", () => {
    process.env.REPORT_SHARE_ALLOWED_ORIGINS = "https://trusted.partner.com,https://other.com";
    const headers = new Headers({
      origin: "https://trusted.partner.com",
      host: "app.example.com",
    });
    expect(isSameOriginRequest(headers)).toBe(true);
  });

  it("rejects an origin NOT in the allowlist", () => {
    process.env.REPORT_SHARE_ALLOWED_ORIGINS = "https://trusted.partner.com";
    const headers = new Headers({
      origin: "https://random.com",
      host: "app.example.com",
    });
    expect(isSameOriginRequest(headers)).toBe(false);
  });

  it("rejects a malformed Origin header", () => {
    const headers = new Headers({
      origin: "not-a-url",
      host: "app.example.com",
    });
    expect(isSameOriginRequest(headers)).toBe(false);
  });
});
