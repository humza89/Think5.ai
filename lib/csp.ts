/**
 * Content-Security-Policy construction (Issue #14).
 *
 * Three policies exist, chosen by route:
 *
 *   app      Authenticated / application routes (dashboard, candidate, admin,
 *            interview, shared reports, everything not listed below). Built
 *            per request by the proxy with a fresh nonce:
 *            `script-src 'nonce-<n>' 'strict-dynamic'`. Next.js reads the
 *            nonce from the Content-Security-Policy *request* header and
 *            stamps it on every framework script it renders (RSC payload
 *            pushes, hydration bootstrap, chunk loaders); scripts those
 *            trusted scripts insert are allowed through 'strict-dynamic'.
 *            'unsafe-inline' and host allow-lists are therefore no longer
 *            needed for script-src and are omitted.
 *   landing  `/` and the public marketing + auth pages. Static, cacheable,
 *            client-hydrated Next pages: keep `script-src 'self'
 *            'unsafe-inline'` (documented, intentionally scoped; no nonce
 *            because these pages must stay statically cacheable).
 *   spline   `/spline-embed`: sandboxed iframe host for the Spline runtime,
 *            which needs 'unsafe-eval'. Isolated to this one route.
 *
 * API routes keep the static (non-nonce) strict policy from next.config.ts:
 * JSON responses execute nothing and the few HTML exports are opened in a
 * tab of their own.
 *
 * See docs/ops/csp.md for the architecture, the caching trade-off and the
 * security review of the resulting headers.
 */

export type CspMode = "app" | "landing" | "public" | "spline" | "api" | "asset";

/** Public marketing and auth page prefixes that keep the static landing policy. */
export const PUBLIC_PAGE_PREFIXES = [
  "/product",
  "/recruitment",
  "/about",
  "/ai-training",
  "/research",
  "/contact",
  "/unauthorized",
  "/auth",
] as const;

function matchesSegmentPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function cspModeFor(pathname: string): CspMode {
  if (pathname === "/") return "landing";
  if (pathname === "/spline-embed") return "spline";
  if (pathname.startsWith("/api/")) return "api";
  if (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|mp4|ico|txt|xml|json|js|css|map|woff2?)$/.test(pathname)
  ) {
    return "asset";
  }
  for (const prefix of PUBLIC_PAGE_PREFIXES) {
    if (matchesSegmentPrefix(pathname, prefix)) return "public";
  }
  return "app";
}

/** 128-bit random nonce, base64 — CSP nonces must be unguessable and unique per response. */
export function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Extra Supabase origin for a local or self-hosted stack (the golden E2E
 * suite in CI). Hosted projects match the *.supabase.co wildcard already.
 */
export function supabaseOriginSources(supabaseUrl: string | undefined): string {
  try {
    const url = new URL(supabaseUrl ?? "");
    if (/\.supabase\.(co|in)$/.test(url.hostname)) return "";
    return ` ${url.origin} ${url.origin.replace(/^http/, "ws")}`;
  } catch {
    return "";
  }
}

const APP_CONNECT_SRC =
  "connect-src 'self' https://*.supabase.co https://*.upstash.io wss://*.supabase.co{{SUPABASE}} wss://generativelanguage.googleapis.com https://generativelanguage.googleapis.com https://prod.spline.design https://unpkg.com wss://think5-voice-relay.fly.dev";

/** Directives shared by the app policy and the API policy — everything except script-src. */
function appDirectives(supabaseExtra: string): string[] {
  return [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    APP_CONNECT_SRC.replace("{{SUPABASE}}", supabaseExtra),
    "media-src 'self' blob: data:",
    "font-src 'self' data:",
    "frame-src 'self' https://*.supabase.co blob:",
    "frame-ancestors 'none'",
    "report-uri /api/csp-report",
  ];
}

/** Per-request policy for app routes: nonce + strict-dynamic, no unsafe-inline. */
export function buildAppCsp(nonce: string, supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): string {
  if (!/^[A-Za-z0-9+/=]{16,}$/.test(nonce)) {
    throw new Error("CSP nonce must be a base64 string");
  }
  return [`script-src 'nonce-${nonce}' 'strict-dynamic'`, ...appDirectives(supabaseOriginSources(supabaseUrl))].join("; ");
}

/**
 * Static strict policy for API routes (next.config.ts). Identical to the
 * pre-#14 app policy; API responses do not render Next.js pages.
 */
export function buildApiCsp(supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): string {
  return ["script-src 'self' 'unsafe-inline'", ...appDirectives(supabaseOriginSources(supabaseUrl))].join("; ");
}

/** Static policy for `/` and the public marketing + auth pages (unchanged by #14). */
export function buildLandingCsp(supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): string {
  const extra = supabaseOriginSources(supabaseUrl);
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' https://*.supabase.co https://*.upstash.io wss://*.supabase.co${extra} https://prod.spline.design https://unpkg.com wss://think5-voice-relay.fly.dev`,
    "media-src 'self' blob: data:",
    "font-src 'self' data:",
    "frame-src 'self' https://*.supabase.co blob:",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Sandboxed Spline embed — unsafe-eval isolated to this route only. */
export const SPLINE_EMBED_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://prod.spline.design; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://prod.spline.design https://unpkg.com; frame-ancestors 'self'";

export const CSP_HEADER = "Content-Security-Policy";
export const NONCE_HEADER = "x-nonce";
