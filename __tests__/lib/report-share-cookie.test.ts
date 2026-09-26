/**
 * lib/report-share-cookie — HMAC cookie contract for email-gated shared reports.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  signReportShareCookie,
  verifyReportShareCookie,
  normalizeIpPrefix,
  extractClientIp,
  REPORT_COOKIE_TTL_SECONDS,
} from "@/lib/report-share-cookie";

const ORIGINAL_SECRET = process.env.NEXTAUTH_SECRET;

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-long-enough-for-hmac-0123456789";
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = ORIGINAL_SECRET;
});

const baseArgs = { token: "share-token-abc", emailHash: "e".repeat(64), ip: "192.168.1.42" };

describe("sign / verify", () => {
  it("round-trips on the happy path and reports the embedded expiry", () => {
    const now = 1_700_000_000_000;
    const signed = signReportShareCookie({ ...baseArgs, now });
    expect(signed.split(".")).toHaveLength(3);
    expect(signed).not.toContain("|"); // dot-delimited so cookie stores need not percent-encode it
    const result = verifyReportShareCookie({ ...baseArgs, cookieValue: signed, now: now + 1000 });
    expect(result).toEqual({ ok: true, expiresAt: Math.floor(now / 1000) + REPORT_COOKIE_TTL_SECONDS });
  });

  it("throws on sign when NEXTAUTH_SECRET is missing", () => {
    delete process.env.NEXTAUTH_SECRET;
    expect(() => signReportShareCookie(baseArgs)).toThrow(/NEXTAUTH_SECRET/);
  });

  it("returns no_secret on verify when NEXTAUTH_SECRET is missing", () => {
    const signed = signReportShareCookie(baseArgs);
    delete process.env.NEXTAUTH_SECRET;
    expect(verifyReportShareCookie({ ...baseArgs, cookieValue: signed })).toEqual({ ok: false, reason: "no_secret" });
  });

  it.each(["", "not-a-valid-cookie", "a.b", "x.y.z.w", "notanumber.aGVsbG8.abcd", "1790450216|Ojox|abcd"])("rejects malformed value %j", (value) => {
    expect(verifyReportShareCookie({ ...baseArgs, cookieValue: value })).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects the legacy plain-SHA256 cookie format", () => {
    expect(verifyReportShareCookie({ ...baseArgs, cookieValue: "f".repeat(64) })).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("tamper resistance", () => {
  it("rejects a mutated MAC", () => {
    const [exp, ip, mac] = signReportShareCookie(baseArgs).split(".");
    const flipped = (mac![0] === "0" ? "1" : "0") + mac!.slice(1);
    expect(verifyReportShareCookie({ ...baseArgs, cookieValue: `${exp}.${ip}.${flipped}` })).toEqual({ ok: false, reason: "bad_mac" });
  });

  it("rejects an extended expiry", () => {
    const [exp, ip, mac] = signReportShareCookie(baseArgs).split(".");
    const later = parseInt(exp!, 10) + 86_400 * 365;
    expect(verifyReportShareCookie({ ...baseArgs, cookieValue: `${later}.${ip}.${mac}` })).toEqual({ ok: false, reason: "bad_mac" });
  });

  it("rejects a MAC of the wrong length", () => {
    const [exp, ip] = signReportShareCookie(baseArgs).split(".");
    expect(verifyReportShareCookie({ ...baseArgs, cookieValue: `${exp}.${ip}.abcd` })).toEqual({ ok: false, reason: "bad_mac" });
  });

  it("accepts a percent-encoded copy of a valid cookie", () => {
    const signed = signReportShareCookie(baseArgs);
    expect(verifyReportShareCookie({ ...baseArgs, cookieValue: encodeURIComponent(signed) }).ok).toBe(true);
  });

  it("rejects a cookie signed with a different secret", () => {
    const signed = signReportShareCookie(baseArgs);
    process.env.NEXTAUTH_SECRET = "different-secret-also-long-enough-9876543210";
    expect(verifyReportShareCookie({ ...baseArgs, cookieValue: signed })).toEqual({ ok: false, reason: "bad_mac" });
  });

  it("binds the cookie to the token and email hash", () => {
    const signed = signReportShareCookie(baseArgs);
    expect(verifyReportShareCookie({ ...baseArgs, token: "other-token", cookieValue: signed })).toEqual({ ok: false, reason: "bad_mac" });
    expect(verifyReportShareCookie({ ...baseArgs, emailHash: "0".repeat(64), cookieValue: signed })).toEqual({ ok: false, reason: "bad_mac" });
  });
});

describe("expiry", () => {
  it("accepts a fresh cookie", () => {
    const signed = signReportShareCookie(baseArgs);
    expect(verifyReportShareCookie({ ...baseArgs, cookieValue: signed, now: Date.now() + 60_000 }).ok).toBe(true);
  });

  it("rejects a cookie past its embedded expiry regardless of Max-Age", () => {
    const signed = signReportShareCookie({ ...baseArgs, ttlSeconds: 60 });
    expect(verifyReportShareCookie({ ...baseArgs, cookieValue: signed, now: Date.now() + 120_000 })).toEqual({ ok: false, reason: "expired" });
  });

  it("default TTL is 2 hours", () => {
    expect(REPORT_COOKIE_TTL_SECONDS).toBe(2 * 60 * 60);
  });
});

describe("network binding", () => {
  it("accepts replay from the same IPv4 /24", () => {
    const signed = signReportShareCookie(baseArgs);
    expect(verifyReportShareCookie({ ...baseArgs, ip: "192.168.1.99", cookieValue: signed }).ok).toBe(true);
  });

  it("rejects replay from a different /24", () => {
    const signed = signReportShareCookie(baseArgs);
    expect(verifyReportShareCookie({ ...baseArgs, ip: "10.0.0.1", cookieValue: signed })).toEqual({ ok: false, reason: "ip_mismatch" });
  });

  it("accepts replay from the same IPv6 /48 and rejects a different one", () => {
    const v6 = { ...baseArgs, ip: "2001:db8:abcd:0001::1" };
    const signed = signReportShareCookie(v6);
    expect(verifyReportShareCookie({ ...v6, ip: "2001:db8:abcd:ffff::9", cookieValue: signed }).ok).toBe(true);
    expect(verifyReportShareCookie({ ...v6, ip: "2001:db8:beef:0001::1", cookieValue: signed })).toEqual({ ok: false, reason: "ip_mismatch" });
  });

  it("normalizeIpPrefix handles IPv4, IPv6, unknown and short values", () => {
    expect(normalizeIpPrefix("192.168.1.42")).toBe("192.168.1");
    expect(normalizeIpPrefix("2001:db8:abcd:0001::1")).toBe("2001:db8:abcd");
    expect(normalizeIpPrefix("::1")).toBe("::1");
    expect(normalizeIpPrefix("unknown")).toBe("unknown");
    expect(normalizeIpPrefix("")).toBe("unknown");
  });

  it("extractClientIp prefers the first x-forwarded-for hop, then x-real-ip", () => {
    expect(extractClientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
    expect(extractClientIp(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(extractClientIp(new Headers())).toBe("unknown");
  });
});
