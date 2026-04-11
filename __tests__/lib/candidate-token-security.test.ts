/**
 * Track 5 Task 20 tests for lib/candidate-token-security.ts.
 *
 * The module is pure — no Prisma, no fetch, no timers. Tests lock in
 * the fingerprint invariants that the validate route relies on:
 *   1. Same (token, UA, IP /24) → same fingerprint.
 *   2. Different IP in the same /24 → SAME fingerprint (legitimate
 *      reconnect survives DHCP churn).
 *   3. Different IP /24 → different fingerprint.
 *   4. Different UA → different fingerprint.
 *   5. Different token → different fingerprint (not portable).
 *   6. Comparison is constant-time via char-accumulator.
 */

import { describe, it, expect } from "vitest";
import {
  computeCandidateFingerprint,
  fingerprintsMatch,
  normalizeIpPrefix,
  extractClientIp,
} from "@/lib/candidate-token-security";

describe("normalizeIpPrefix", () => {
  it("takes the first three octets of an IPv4 address", () => {
    expect(normalizeIpPrefix("192.168.1.42")).toBe("192.168.1");
    expect(normalizeIpPrefix("10.0.0.5")).toBe("10.0.0");
    expect(normalizeIpPrefix("172.16.255.1")).toBe("172.16.255");
  });

  it("takes the first three groups of an IPv6 address (/48)", () => {
    // Full form: take the first three colon-separated groups.
    expect(normalizeIpPrefix("2001:db8:abcd:1234::1")).toBe("2001:db8:abcd");
    // Compressed form: the empty string from `::` counts as a group,
    // so `fe80::1:2:3` splits to ["fe80","","1","2","3"] and the first
    // three joined is "fe80::1". This is imprecise but consistent —
    // the normalizer's job is to produce a stable short prefix, not
    // to round-trip to a valid IPv6.
    expect(normalizeIpPrefix("fe80::1:2:3")).toBe("fe80::1");
  });

  it("returns 'unknown' for empty or missing IP", () => {
    expect(normalizeIpPrefix("")).toBe("unknown");
    expect(normalizeIpPrefix("unknown")).toBe("unknown");
  });

  it("returns the raw value for malformed IPs (fail-open for diagnostics)", () => {
    expect(normalizeIpPrefix("not-an-ip")).toBe("not-an-ip");
  });

  it("trims whitespace from the input", () => {
    expect(normalizeIpPrefix("  192.168.1.42  ")).toBe("192.168.1");
  });
});

describe("computeCandidateFingerprint — determinism", () => {
  const base = {
    accessToken: "tok-abc-123",
    userAgent: "Mozilla/5.0 Chrome",
    ip: "192.168.1.42",
  };

  it("is deterministic for identical inputs", () => {
    const a = computeCandidateFingerprint(base);
    const b = computeCandidateFingerprint(base);
    expect(a).toBe(b);
  });

  it("produces SAME fingerprint when IP moves within the same /24 (reconnect)", () => {
    const a = computeCandidateFingerprint(base);
    const b = computeCandidateFingerprint({ ...base, ip: "192.168.1.99" });
    expect(a).toBe(b); // Different host in same /24 — intentional tolerance
  });

  it("produces DIFFERENT fingerprint across different /24 networks", () => {
    const a = computeCandidateFingerprint(base);
    const b = computeCandidateFingerprint({ ...base, ip: "192.168.2.42" });
    expect(a).not.toBe(b);
  });

  it("produces DIFFERENT fingerprint across different User-Agents", () => {
    const a = computeCandidateFingerprint(base);
    const b = computeCandidateFingerprint({ ...base, userAgent: "curl/8.0" });
    expect(a).not.toBe(b);
  });

  it("produces DIFFERENT fingerprint across different tokens (non-portable)", () => {
    const a = computeCandidateFingerprint(base);
    const b = computeCandidateFingerprint({ ...base, accessToken: "different-token" });
    expect(a).not.toBe(b);
  });

  it("handles a null User-Agent without crashing", () => {
    const result = computeCandidateFingerprint({ ...base, userAgent: null });
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("output is a 64-char hex SHA-256 digest", () => {
    const a = computeCandidateFingerprint(base);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a.length).toBe(64);
  });
});

describe("fingerprintsMatch — constant-time compare", () => {
  it("returns true for identical fingerprints", () => {
    const fp = computeCandidateFingerprint({
      accessToken: "t",
      userAgent: "ua",
      ip: "1.2.3.4",
    });
    expect(fingerprintsMatch(fp, fp)).toBe(true);
  });

  it("returns false for any single-character difference", () => {
    const a = "a".repeat(64);
    const b = "a".repeat(63) + "b";
    expect(fingerprintsMatch(a, b)).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(fingerprintsMatch("abcd", "abc")).toBe(false);
  });

  it("returns false for null inputs", () => {
    expect(fingerprintsMatch(null, "a")).toBe(false);
    expect(fingerprintsMatch("a", null)).toBe(false);
    expect(fingerprintsMatch(null, null)).toBe(false);
  });
});

describe("extractClientIp", () => {
  it("returns the first hop from x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(extractClientIp(headers)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const headers = new Headers({ "x-real-ip": "9.9.9.9" });
    expect(extractClientIp(headers)).toBe("9.9.9.9");
  });

  it("returns 'unknown' when neither header is set", () => {
    const headers = new Headers();
    expect(extractClientIp(headers)).toBe("unknown");
  });

  it("trims whitespace from x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "   1.2.3.4  " });
    expect(extractClientIp(headers)).toBe("1.2.3.4");
  });
});
