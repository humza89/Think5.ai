import Link from "next/link";
import { LogoMark } from "@/components/brand/LogoMark";
import { pill } from "@/components/marketing/styles";

/**
 * Issue #14: this public segment keeps the static, cacheable CSP from
 * next.config.ts and is prerendered at build time. The root layout reads
 * headers() for the app-route CSP nonce; force-static makes that read
 * return empty here so the page stays a static prerender (as on main).
 */
export const dynamic = "force-static";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="max-w-md text-center">
        <LogoMark size={44} className="mx-auto" />
        <p className="mt-8 text-[11px] font-medium uppercase tracking-[0.18em] text-graphite">403 · Access denied</p>
        <h1 className="mt-4 font-display text-[40px] leading-[1.05] tracking-[-0.02em] text-ink md:text-[48px]">
          You don&apos;t have access to <span className="italic text-graphite">this page</span>.
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-graphite">
          Please sign in with an account that has the required role.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/auth/signin" className={pill.ink}>
            Sign in
          </Link>
          <Link href="/" className={pill.ghostLight}>
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
