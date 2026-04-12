/**
 * Report Share Cookie — Track 5 Task 21.
 *
 * Signs and verifies the cookie used by the email-gated shared-report
 * flow. Replaces the earlier SHA-256-based scheme with:
 *
 *   1. HMAC-SHA256 (not plain SHA-256). The old scheme concatenated
 *      secret into the hash input: SHA256(token:emailHash:secret).
 *      That is NOT a secure MAC — it has length-extension properties
 *      even though the practical exploit is narrow for fixed-length
 *      inputs. HMAC is the only cryptographically correct choice.
 *
 *   2. Embedded expiry. The cookie value encodes an absolute expiry
 *      timestamp as part of the HMAC-protected payload, so a stolen
 *      cookie cannot be used past its intended lifetime even if the
 *      Max-Age cookie attribute is bypassed.
 *
 *   3. Origin / IP-prefix binding. The fingerprint layer from Track 5
 *      Task 20 gave us a way to bind server-side secrets to a client's
 *      network. We reuse it here so a cookie stolen from one network
 *      cannot be replayed from another.
 *
 *   4. Constant-time comparison via `crypto.timingSafeEqual`.
 *
 * Cookie format (pipe-delimited, NOT dot — IPv4 prefixes contain dots):
 *   "{expiryUnix}|{base64UrlIpPrefix}|{macHex}"
 *
 * Verification recomputes the MAC with the server-side secret and
 * compares constant-time. The ipPrefix is REDUNDANT in the payload
 * (it's used as MAC material) but including it in plaintext makes
 * server-side diagnostics easier — if a mismatch happens we can log
 * which field broke.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { normalizeIpPrefix } from "@/lib/candidate-token-security";

// Shorter default than the old 24h — 2 hours is plenty for a recruiter
// or hiring manager to review a report in a single sitting. Can be
// refreshed by re-verifying email if needed.
export const REPORT_COOKIE_TTL_SECONDS = 2 * 60 * 60;

export interface SignCookieArgs {
  token: string;
  emailHash: string;
  ip: string;
  now?: number;
  ttlSeconds?: number;
}

export interface VerifyCookieArgs {
  token: string;
  emailHash: string;
  ip: string;
  cookieValue: string;
  now?: number;
}

export type VerifyResult =
  | { ok: true; expiresAt: number }
  | { ok: false; reason: "malformed" | "expired" | "bad_mac" | "ip_mismatch" | "no_secret" };

function getSecret(): string | null {
  return process.env.NEXTAUTH_SECRET || null;
}

/**
 * Sign a report-share access cookie. Returns a string safe to set in
 * a Set-Cookie header. Throws if NEXTAUTH_SECRET is not configured —
 * this is a server misconfiguration, not a user-facing error.
 */
export function signReportShareCookie(args: SignCookieArgs): string {
  const secret = getSecret();
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET not configured — cannot sign report share cookie");
  }
  const now = args.now ?? Date.now();
  const ttl = args.ttlSeconds ?? REPORT_COOKIE_TTL_SECONDS;
  const expiryUnix = Math.floor(now / 1000) + ttl;
  const ipPrefix = normalizeIpPrefix(args.ip);

  const mac = computeMac(secret, args.token, args.emailHash, ipPrefix, expiryUnix);
  // Use base64url on the ipPrefix so dots/colons from IPv4/IPv6 don't
  // collide with our pipe delimiter. The encoding is stable and the
  // payload is cosmetic — the authoritative check is the MAC.
  const encodedIp = Buffer.from(ipPrefix, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${expiryUnix}|${encodedIp}|${mac}`;
}

/**
 * Verify a report-share cookie. Returns a tagged result; callers
 * should treat any non-ok result as "deny access and force re-verify".
 */
export function verifyReportShareCookie(args: VerifyCookieArgs): VerifyResult {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: "no_secret" };

  const now = args.now ?? Date.now();
  const parts = args.cookieValue.split("|");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };

  const [expiryStr, encodedIpPrefix, providedMac] = parts;
  const expiryUnix = parseInt(expiryStr!, 10);
  if (isNaN(expiryUnix)) return { ok: false, reason: "malformed" };

  // Expiry check happens BEFORE the MAC verify so an expired cookie
  // is detected without running the hash — marginally faster but more
  // importantly gives a cleaner log message.
  if (expiryUnix * 1000 <= now) {
    return { ok: false, reason: "expired" };
  }

  // Decode the ipPrefix (base64url) and cross-check against the
  // current request. If the current request is from a different /24
  // we reject before running the MAC.
  let cookieIpPrefix: string;
  try {
    const padded = encodedIpPrefix!
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(encodedIpPrefix!.length / 4) * 4, "=");
    cookieIpPrefix = Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const currentIpPrefix = normalizeIpPrefix(args.ip);
  if (cookieIpPrefix !== currentIpPrefix) {
    return { ok: false, reason: "ip_mismatch" };
  }

  const expectedMac = computeMac(
    secret,
    args.token,
    args.emailHash,
    cookieIpPrefix,
    expiryUnix,
  );

  // Constant-time compare
  const providedBuf = Buffer.from(providedMac!, "hex");
  const expectedBuf = Buffer.from(expectedMac, "hex");
  if (providedBuf.length !== expectedBuf.length) {
    return { ok: false, reason: "bad_mac" };
  }
  try {
    if (!timingSafeEqual(providedBuf, expectedBuf)) {
      return { ok: false, reason: "bad_mac" };
    }
  } catch {
    return { ok: false, reason: "bad_mac" };
  }

  return { ok: true, expiresAt: expiryUnix };
}

function computeMac(
  secret: string,
  token: string,
  emailHash: string,
  ipPrefix: string,
  expiryUnix: number,
): string {
  const material = `${token}|${emailHash}|${ipPrefix}|${expiryUnix}`;
  return createHmac("sha256", secret).update(material).digest("hex");
}

/**
 * CSRF Origin check for the POST /api/reports/shared/[token]/verify-email
 * endpoint. The old endpoint accepted any cross-origin JSON POST because
 * Next.js Route Handlers don't auto-enforce same-origin for state-
 * changing requests. We require the Origin header to match the host
 * (or to be one of the explicitly allowed origins).
 *
 * Returns true if the origin is acceptable.
 */
export function isSameOriginRequest(headers: Headers): boolean {
  const origin = headers.get("origin");
  const host = headers.get("host");
  if (!origin || !host) {
    // No Origin header at all is suspicious for a POST; reject.
    return false;
  }
  try {
    const originUrl = new URL(origin);
    // Accept if origin's host matches the request host. This is the
    // same check Next.js recommends for custom CSRF protection.
    if (originUrl.host === host) return true;
  } catch {
    return false;
  }
  // Explicit allowlist via env for legitimate cross-subdomain calls
  // (e.g., share links embedded in an admin tool).
  const allowed = (process.env.REPORT_SHARE_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(origin);
}
