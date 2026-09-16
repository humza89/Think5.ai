"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/product", label: "Product" },
  { href: "/research", label: "Research" },
  { href: "/contact", label: "Contact" },
];

interface SiteHeaderProps {
  /** "dark" = transparent over a dark hero, white text. "light" = paper bar with hairline. */
  tone?: "dark" | "light";
}

export function SiteHeader({ tone = "light" }: SiteHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, isLoading, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleSignOut = async () => {
    setMobileOpen(false);
    await signOut();
    router.push("/");
  };

  const dashboardHref = profile?.role === "candidate" ? "/candidate/dashboard" : "/dashboard";
  const dark = tone === "dark";

  const linkBase = "rounded-full px-3.5 py-2 text-[14px] font-medium transition-colors";
  const linkTone = dark
    ? "text-white/70 hover:text-white hover:bg-white/10"
    : "text-graphite hover:text-ink hover:bg-ink/[0.05]";
  const activeTone = dark ? "text-white" : "text-ink";

  const primaryBtn = cn(
    "inline-flex h-10 items-center gap-1.5 rounded-full px-4.5 pl-5 pr-4 text-[14px] font-medium transition-colors",
    dark ? "bg-white text-ink hover:bg-paper" : "bg-ink text-white hover:bg-ink-2"
  );

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300",
        dark
          ? scrolled
            ? "bg-ink/70 backdrop-blur-md border-b border-white/10"
            : "bg-transparent border-b border-transparent"
          : scrolled
            ? "bg-paper/85 backdrop-blur-md border-b border-stone"
            : "bg-paper/0 border-b border-transparent"
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center px-6 md:px-10">
        <Logo tone={dark ? "light" : "dark"} withMark />

        {/* Center nav */}
        <nav className="ml-10 hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => {
            const active = pathname?.startsWith(link.href);
            return (
              <Link key={link.href} href={link.href} className={cn(linkBase, linkTone, active && activeTone)}>
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="ml-auto hidden items-center gap-2 md:flex">
          {user ? (
            <>
              <button onClick={handleSignOut} className={cn(linkBase, linkTone)}>
                Sign out
              </button>
              <Link href={dashboardHref} className={primaryBtn}>
                Dashboard <ArrowUpRight className="h-4 w-4" />
              </Link>
            </>
          ) : isLoading ? (
            <div className={cn("h-10 w-28 animate-pulse rounded-full", dark ? "bg-white/10" : "bg-ink/10")} />
          ) : (
            <>
              <Link href="/auth/signin" className={cn(linkBase, linkTone)}>
                Sign in
              </Link>
              <Link href="/auth/signup" className={primaryBtn}>
                Get started <ArrowUpRight className="h-4 w-4" />
              </Link>
            </>
          )}
        </div>

        {/* Mobile */}
        <div className="ml-auto flex items-center md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                  dark ? "text-white hover:bg-white/10" : "text-ink hover:bg-ink/[0.05]"
                )}
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80 border-l border-stone bg-paper p-6">
              <SheetHeader>
                <SheetTitle className="text-left">
                  <Logo tone="dark" withMark href={null} />
                </SheetTitle>
              </SheetHeader>

              <div className="mt-8 flex flex-col">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="border-b border-stone py-4 font-display text-[28px] leading-none text-ink transition-colors hover:text-brand"
                  >
                    {link.label}
                  </Link>
                ))}

                <div className="mt-8 flex flex-col gap-3">
                  {user ? (
                    <>
                      <Link href={dashboardHref} onClick={() => setMobileOpen(false)} className="inline-flex h-12 items-center justify-center rounded-full bg-ink text-[15px] font-medium text-white">
                        Dashboard
                      </Link>
                      <button onClick={handleSignOut} className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-stone text-[15px] font-medium text-ink">
                        <LogOut className="h-4 w-4" /> Sign out
                      </button>
                    </>
                  ) : (
                    <>
                      <Link href="/auth/signup" onClick={() => setMobileOpen(false)} className="inline-flex h-12 items-center justify-center rounded-full bg-ink text-[15px] font-medium text-white">
                        Get started
                      </Link>
                      <Link href="/auth/signin" onClick={() => setMobileOpen(false)} className="inline-flex h-12 items-center justify-center rounded-full border border-stone text-[15px] font-medium text-ink">
                        Sign in
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

export default SiteHeader;
