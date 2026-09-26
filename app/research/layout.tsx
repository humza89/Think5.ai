/**
 * Issue #14: this public segment keeps the static, cacheable CSP from
 * next.config.ts and is prerendered at build time. The root layout reads
 * headers() for the app-route CSP nonce; force-static makes that read
 * return empty here so the page stays a static prerender (as on main).
 */
export const dynamic = "force-static";

export default function StaticSegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
