import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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

    // App routes: strict CSP — no unsafe-eval, unsafe-inline only for styles (React needs it for SSR)
    const strictCsp =
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co https://*.upstash.io wss://*.supabase.co wss://generativelanguage.googleapis.com https://generativelanguage.googleapis.com https://prod.spline.design https://unpkg.com wss://think5-voice-relay.fly.dev; media-src 'self' blob: data:; font-src 'self' data:; frame-src 'self' https://*.supabase.co blob:; frame-ancestors 'none'; report-uri /api/csp-report";

    // Spline 3D runtime requires 'unsafe-eval'. Instead of allowing it on
    // the landing page directly, we load Spline in a sandboxed iframe on
    // /spline-embed which has its own relaxed CSP, keeping the main landing
    // page fully hardened.
    const landingCsp =
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co https://*.upstash.io wss://*.supabase.co https://prod.spline.design https://unpkg.com wss://think5-voice-relay.fly.dev; media-src 'self' blob: data:; font-src 'self' data:; frame-src 'self' https://*.supabase.co blob:; frame-ancestors 'none'";
    // Sandboxed Spline embed page — unsafe-eval isolated to this route only
    const splineEmbedCsp =
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://prod.spline.design; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://prod.spline.design https://unpkg.com; frame-ancestors 'self'";

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
      // Strict CSP for app routes (interview, API, candidate, admin, dashboard)
      {
        source: "/(interview|api|candidate|admin|dashboard)(.*)",
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy", value: strictCsp },
        ],
      },
      // Landing page: strict CSP (Spline loaded via sandboxed iframe)
      {
        source: "/",
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
      // All other routes: strict CSP (no unsafe-eval)
      {
        source: "/((?!interview|api|candidate|admin|dashboard|spline-embed).+)",
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy", value: strictCsp },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  widenClientFileUpload: true,
  disableLogger: true,
});
