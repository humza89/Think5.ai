import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
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

    const strictCsp =
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co https://*.upstash.io wss://*.supabase.co wss://generativelanguage.googleapis.com https://generativelanguage.googleapis.com https://prod.spline.design https://unpkg.com wss://think5-voice-relay.fly.dev; media-src 'self' blob: data:; font-src 'self' data:; frame-src 'self' https://*.supabase.co blob:; frame-ancestors 'none'";

    // SECURITY: 'unsafe-eval' is required for the Spline 3D runtime.
    // Spline uses eval() internally for its WebGL pipeline and does not
    // support nonce-based loading as of 2026-03.
    // TODO: Remove unsafe-eval when Spline adds CSP nonce support.
    const landingCsp =
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co https://*.upstash.io wss://*.supabase.co https://prod.spline.design https://unpkg.com wss://think5-voice-relay.fly.dev; media-src 'self' blob: data:; font-src 'self' data:; frame-src 'self' https://*.supabase.co blob:; frame-ancestors 'none'";

    return [
      // Strict CSP for app routes (interview, API, candidate, admin, dashboard)
      {
        source: "/(interview|api|candidate|admin|dashboard)(.*)",
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy", value: strictCsp },
        ],
      },
      // Landing page: unsafe-eval scoped only here for Spline 3D runtime
      {
        source: "/",
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy", value: landingCsp },
        ],
      },
      // All other routes: strict CSP (no unsafe-eval)
      {
        source: "/((?!interview|api|candidate|admin|dashboard).+)",
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
