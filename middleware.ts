import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { applyRateLimit } from "@/lib/api-rate-limit";

/**
 * CSRF Protection Middleware
 *
 * Generates a CSRF token per session and validates it on state-changing requests.
 * Token stored in HttpOnly cookie, validated via X-CSRF-Token header or request body.
 *
 * Exemptions:
 * - GET, HEAD, OPTIONS requests (safe methods)
 * - Webhook endpoints (use HMAC signature verification)
 * - Health check endpoints
 * - Interview accept endpoint (uses its own token flow)
 * - Cron endpoints (server-to-server)
 * - Next.js internal routes
 */

const CSRF_COOKIE_NAME = "csrf-token";
const CSRF_HEADER_NAME = "x-csrf-token";

// Routes exempt from CSRF validation
const CSRF_EXEMPT_PATTERNS = [
  /^\/api\/integrations\//,      // Webhook receivers (use HMAC)
  /^\/api\/v1\/health/,          // Health checks
  /^\/api\/cron\//,              // Server-to-server cron
  /^\/api\/csp-report/,          // CSP violation reports
  /^\/_next\//,                  // Next.js internals
  /^\/api\/auth\/callback/,      // OAuth callbacks
];

// Routes that use their own token validation (not session-based CSRF)
const TOKEN_AUTH_PATTERNS = [
  /^\/api\/interviews\/[^/]+\/voice/,       // Voice endpoints use Bearer token
  /^\/api\/interviews\/[^/]+\/recording/,   // Recording uses Bearer token
  /^\/api\/interviews\/[^/]+\/proctoring/,  // Proctoring uses Bearer token
  /^\/api\/interviews\/[^/]+\/screen-capture/, // Screen capture uses Bearer token
  /^\/api\/interviews\/accept/,             // Uses invitation token
];

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isExempt(pathname: string): boolean {
  return CSRF_EXEMPT_PATTERNS.some((p) => p.test(pathname));
}

function usesTokenAuth(pathname: string): boolean {
  return TOKEN_AUTH_PATTERNS.some((p) => p.test(pathname));
}

function generateCsrfToken(): string {
  return createHash("sha256")
    .update(randomUUID())
    .update(Date.now().toString())
    .digest("hex");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // HTTPS enforcement in production (tokens must never travel over HTTP)
  if (
    process.env.NODE_ENV === "production" &&
    request.headers.get("x-forwarded-proto") !== "https"
  ) {
    const httpsUrl = new URL(request.url);
    httpsUrl.protocol = "https:";
    return NextResponse.redirect(httpsUrl.toString(), 301);
  }

  const response = NextResponse.next();

  // Ensure CSRF token cookie exists (set on every response if missing)
  let csrfToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;

  if (!csrfToken) {
    csrfToken = generateCsrfToken();
    response.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });
  }

  // Make CSRF token available to client via a non-HttpOnly cookie
  // (client reads this to send in headers)
  if (!request.cookies.get("csrf-token-client")?.value) {
    response.cookies.set("csrf-token-client", csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }

  // Skip validation for safe methods
  if (SAFE_METHODS.has(method)) {
    return response;
  }

  // Skip validation for exempt routes
  if (isExempt(pathname)) {
    return response;
  }

  // Skip validation for routes that use their own token auth
  if (usesTokenAuth(pathname)) {
    return response;
  }

  // Only validate CSRF on API routes with state-changing methods
  if (pathname.startsWith("/api/")) {
    const headerToken = request.headers.get(CSRF_HEADER_NAME);
    const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;

    if (!cookieToken || !headerToken || headerToken !== cookieToken) {
      return NextResponse.json(
        { error: "CSRF token validation failed" },
        { status: 403 }
      );
    }
  }

  // Apply route-aware rate limiting on API routes
  if (pathname.startsWith("/api/")) {
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const rateLimitResponse = await applyRateLimit(pathname, clientIp);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Match all API routes
    "/api/:path*",
    // Match app routes for cookie setting
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
