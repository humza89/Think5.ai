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
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co https://*.upstash.io wss://*.supabase.co wss://generativelanguage.googleapis.com https://generativelanguage.googleapis.com; media-src 'self' blob: data:; font-src 'self' data:; frame-src 'self' https://*.supabase.co blob:; frame-ancestors 'none'";

    const landingCsp =
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co https://*.upstash.io wss://*.supabase.co https://prod.spline.design https://unpkg.com; media-src 'self' blob: data:; font-src 'self' data:; frame-src 'self' https://*.supabase.co blob:; frame-ancestors 'none'";

    return [
      {
        source: "/(interview|api|candidate)(.*)",
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy", value: strictCsp },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy", value: landingCsp },
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
