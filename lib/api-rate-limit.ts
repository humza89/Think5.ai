/**
 * Route-aware rate limiting for API endpoints.
 *
 * Provides per-route rate limit configurations and a helper
 * to apply rate limiting in API route handlers.
 */

import { NextResponse } from "next/server";
import { checkRateLimit, type RateLimitConfig } from "./rate-limit";

// ── Per-route rate limit configurations ──────────────────────────────

interface RouteConfig {
  pattern: RegExp;
  config: RateLimitConfig;
  keyPrefix: string;
}

const ROUTE_CONFIGS: RouteConfig[] = [
  // Auth endpoints: strict (prevent brute force)
  { pattern: /^\/api\/auth\//, config: { maxRequests: 10, windowMs: 60000 }, keyPrefix: "auth" },
  // Interview voice endpoints: moderate (real-time usage)
  { pattern: /^\/api\/interviews\/[^/]+\/voice/, config: { maxRequests: 60, windowMs: 60000 }, keyPrefix: "voice" },
  // Interview creation/management
  { pattern: /^\/api\/interviews/, config: { maxRequests: 30, windowMs: 60000 }, keyPrefix: "interviews" },
  // Candidate endpoints
  { pattern: /^\/api\/candidate\//, config: { maxRequests: 60, windowMs: 60000 }, keyPrefix: "candidate" },
  // Admin endpoints (higher limits for dashboards)
  { pattern: /^\/api\/admin\//, config: { maxRequests: 120, windowMs: 60000 }, keyPrefix: "admin" },
  // V1 API endpoints
  { pattern: /^\/api\/v1\//, config: { maxRequests: 60, windowMs: 60000 }, keyPrefix: "v1" },
];

// Default rate limit for unmatched routes
const DEFAULT_CONFIG: RateLimitConfig = { maxRequests: 100, windowMs: 60000 };

function getRouteConfig(pathname: string): { config: RateLimitConfig; keyPrefix: string } {
  for (const route of ROUTE_CONFIGS) {
    if (route.pattern.test(pathname)) {
      return { config: route.config, keyPrefix: route.keyPrefix };
    }
  }
  return { config: DEFAULT_CONFIG, keyPrefix: "default" };
}

/**
 * Apply rate limiting to an API request.
 *
 * @param pathname - The request pathname (e.g. "/api/auth/signin")
 * @param identifier - Unique identifier for the client (IP address or user ID)
 * @returns null if allowed, NextResponse with 429 if rate limited
 */
export async function applyRateLimit(
  pathname: string,
  identifier: string
): Promise<NextResponse | null> {
  const { config, keyPrefix } = getRouteConfig(pathname);
  const key = `${keyPrefix}:${identifier}`;

  const result = await checkRateLimit(key, config);

  if (!result.allowed) {
    return NextResponse.json(
      {
        error: "Too many requests. Please try again later.",
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil((result.resetAt - Date.now()) / 1000).toString(),
          "X-RateLimit-Limit": config.maxRequests.toString(),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": new Date(result.resetAt).toISOString(),
        },
      }
    );
  }

  return null;
}
