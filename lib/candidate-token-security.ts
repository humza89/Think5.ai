/**
 * Candidate Token Security — Track 5 Task 20.
 *
 * Replay-reduction primitives for the unauthenticated candidate interview
 * access token. The token itself is a DB column on Interview and can be
 * issued to exactly one candidate per interview, but the raw-URL model
 * means any leak (emails in screenshots, shared links, browser history)
 * lets the URL be reused from a different device. This module binds the
 * token to the FIRST device that successfully validates, and rejects
 * subsequent validates from a different device fingerprint.
 *
 * The fingerprint is intentionally coarse — we want a legitimate
 * candidate reconnecting after a network blip or a browser refresh to
 * still pass, while a leaked URL used from a different country fails.
 * We hash:
 *   - the access token itself (so fingerprints are not portable
 *     across interviews)
 *   - the User-Agent header (browser identity)
 *   - the IP /24 prefix (network proximity; survives DHCP churn and
 *     small NAT moves but changes across ISPs)
 *
 * Mobile networks frequently change full IPs on cell handover; the
 * /24 prefix is the compromise that keeps legitimate reconnects alive.
 * A stricter binding (full IP, or IP + TLS JA3) would break real users.
 *
 * This is DEFENSE IN DEPTH, not primary auth. The access token itself
 * is still the primary credential; fingerprinting is a second layer.
 */

import { createHash } from "crypto";

/**
 * Normalize an IP to its /24 prefix (first three octets) for v4, or
 * /48 for v6. Used inside the fingerprint to tolerate DHCP churn and
 * mobile carrier NAT without breaking legitimate reconnects.
 *
 *   192.168.1.42        → "192.168.1"
 *   10.0.0.5            → "10.0.0"
 *   2001:db8:abcd:1234::1 → "2001:db8:abcd"
 *   unknown             → "unknown"
 */
export function normalizeIpPrefix(ip: string): string {
  if (!ip || ip === "unknown") return "unknown";
  const trimmed = ip.trim();

  // IPv4: first three octets
  const v4 = trimmed.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (v4) return v4[1]!;

  // IPv6: first three groups (/48) — handles both expanded and compressed
  // forms conservatively by taking everything before the 4th colon.
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    if (parts.length >= 4) {
      return parts.slice(0, 3).join(":");
    }
    // Very short / malformed — return as-is rather than guessing
    return trimmed;
  }

  return trimmed;
}

/**
 * Compute the device fingerprint for a candidate validate attempt.
 * Deterministic given the same inputs so first-validate and reconnects
 * from the same device produce the same digest.
 */
export function computeCandidateFingerprint(args: {
  accessToken: string;
  userAgent: string | null;
  ip: string;
}): string {
  const ua = (args.userAgent ?? "unknown").trim();
  const ipPrefix = normalizeIpPrefix(args.ip);
  // Token goes first so fingerprints are not portable across interviews
  // even if a leaked URL happens to share a UA with the original.
  const material = `${args.accessToken}:${ua}:${ipPrefix}`;
  return createHash("sha256").update(material).digest("hex");
}

/**
 * Compare two fingerprints safely. Returns true if they match.
 * Uses a constant-time comparison to avoid timing side channels.
 */
export function fingerprintsMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  // Simple char-by-char XOR accumulator — constant-time given equal
  // lengths. Node's crypto.timingSafeEqual requires Buffers; this
  // works on plain hex strings without an allocation.
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Extract the client IP from Next.js request headers. Prefers the
 * first hop in x-forwarded-for, falls back to x-real-ip, and finally
 * to 'unknown'. The fingerprint normalizes via /24 anyway, so mild
 * inaccuracies are absorbed.
 */
export function extractClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
