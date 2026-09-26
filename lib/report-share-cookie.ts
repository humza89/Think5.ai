/**
 * Report share cookie — HMAC-signed access cookie for the email-gated
 * shared-report flow (`/reports/shared/[token]`).
 *
 * Salvaged from legacy PR #8 (Track 5). Replaces the previous scheme,
 * `SHA256(token:emailHash:secret)`, which was a keyed hash rather than a MAC
 * and carried no expiry of its own (only the cookie's Max-Age).
 *
 *   1. HMAC-SHA256 over token | emailHash | ipPrefix | expiry.
 *   2. Embedded absolute expiry, so a stolen cookie cannot outlive its TTL even
 *      if the Max-Age attribute is bypassed. TTL is 2 hours (down from 24).
 *   3. Network binding: the client's IPv4 /24 (or IPv6 /48) is part of the MAC
 *      material, so a cookie lifted from one network cannot be replayed from
 *      another.
 *   4. Constant-time comparison.
 *
 * Cookie format (pipe-delimited — IPv4 prefixes contain dots):
 *   "{expiryUnix}|{base64url(ipPrefix)}|{macHex}"
 *
 * The plaintext ipPrefix is redundant with the MAC material; it is carried so
 * a rejected cookie can be diagnosed (expired vs moved network vs tampered).
 */

import { createHmac, timingSafeEqual } from "crypto";

/** 2 hours: long enough for a review sitting; re-verify for anything longer. */
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

/**
 * Reduce a client IP to its network prefix: IPv4 /24 (first three octets),
 * IPv6 /48 (first three groups). Unknown or malformed values pass through so
 * they still participate in the MAC without ever matching a real prefix.
 */
export function normalizeIpPrefix(ip: string): string {
  if (!ip || ip === "unknown") return "unknown";
  const trimmed = ip.trim();

  const v4 = trimmed.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (v4) return v4[1]!;

  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    if (parts.length >= 4) return parts.slice(0, 3).join(":");
    return trimmed;
  }

  return trimmed;
}

/** First hop of x-forwarded-for, then x-real-ip, else "unknown". */
export function extractClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();
  return "unknown";
}

function getSecret(): string | null {
  return process.env.NEXTAUTH_SECRET || null;
}

/**
 * Sign a report-share access cookie. Throws when NEXTAUTH_SECRET is not
 * configured — a server misconfiguration, not a user-facing error.
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
  const encodedIp = Buffer.from(ipPrefix, "utf8").toString("base64url");
  return `${expiryUnix}|${encodedIp}|${mac}`;
}

/**
 * Verify a report-share cookie. Any non-ok result means "deny and force
 * re-verification"; the reason is for diagnostics and the client message.
 */
export function verifyReportShareCookie(args: VerifyCookieArgs): VerifyResult {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: "no_secret" };

  const now = args.now ?? Date.now();
  const parts = args.cookieValue.split("|");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };

  const [expiryStr, encodedIpPrefix, providedMac] = parts;
  if (!/^\d+$/.test(expiryStr!)) return { ok: false, reason: "malformed" };
  const expiryUnix = parseInt(expiryStr!, 10);

  if (expiryUnix * 1000 <= now) {
    return { ok: false, reason: "expired" };
  }

  let cookieIpPrefix: string;
  try {
    cookieIpPrefix = Buffer.from(encodedIpPrefix!, "base64url").toString("utf8");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (cookieIpPrefix !== normalizeIpPrefix(args.ip)) {
    return { ok: false, reason: "ip_mismatch" };
  }

  const expectedMac = computeMac(secret, args.token, args.emailHash, cookieIpPrefix, expiryUnix);
  const providedBuf = Buffer.from(providedMac!, "hex");
  const expectedBuf = Buffer.from(expectedMac, "hex");
  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
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
