import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { SPLINE_EMBED_CSP, buildApiCsp, buildLandingCsp } from "./lib/csp";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "media.licdn.com" },
      { protocol: "https", hostname: "*.gravatar.com" },
    ],
  },
  async headers() {
    const securityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-DNS-Prefetch-Control", value: "on" },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(self), microphone=(self), geolocation=()",
      },
    ];

    // Issue #14: app/page routes get a per-request nonce CSP from proxy.ts
    // (script-src 'nonce-…' 'strict-dynamic'); the static policies below
    // cover API routes (unchanged strict policy), the landing/marketing/auth
    // pages (static, cacheable, hence no nonce) and the sandboxed Spline
    // embed. See lib/csp.ts and docs/ops/csp.md.
    const apiCsp = buildApiCsp(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const landingCsp = buildLandingCsp(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const splineEmbedCsp = SPLINE_EMBED_CSP;

    return [
      // CDN cache headers for static assets
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // Private cache for recordings
      {
        source: "/api/v1/interviews/upload-recording/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      // API routes: static strict CSP (JSON responses; no Next.js page render)
      {
        source: "/api/(.*)",
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy", value: apiCsp },
        ],
      },
      // App routes: security headers only — the Content-Security-Policy is
      // set per request by proxy.ts with a fresh nonce (Issue #14).
      {
        source: "/(interview|candidate|admin|dashboard)(.*)",
        headers: securityHeaders,
      },
      // Landing page: strict CSP (Spline loaded via sandboxed iframe)
      {
        source: "/",
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy", value: landingCsp },
        ],
      },
      // Public marketing + auth pages: same policy as the landing page.
      // Next.js hydrates through inline scripts, so 'unsafe-inline' for
      // script-src is required for these client-rendered pages to work.
      {
        source: "/(product|recruitment|about|ai-training|research|contact|unauthorized|auth)(.*)",
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy", value: landingCsp },
        ],
      },
      // Sandboxed Spline 3D embed — unsafe-eval isolated to this route
      {
        source: "/spline-embed",
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy", value: splineEmbedCsp },
        ],
      },
      // All other page routes: security headers only; nonce CSP from proxy.ts
      {
        source: "/((?!interview|api|candidate|admin|dashboard|spline-embed|product|recruitment|about|ai-training|research|contact|unauthorized|auth).+)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  widenClientFileUpload: true,
  disableLogger: true,
});
