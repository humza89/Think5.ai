"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/product", label: "Product" },
  { href: "/recruitment", label: "Recruitment" },
  { href: "/ai-training", label: "AI training" },
  { href: "/research", label: "Research" },
  { href: "/about", label: "Team" },
  { href: "/contact", label: "Contact" },
];

interface SiteHeaderProps {
  /** Kept for call-site compatibility; the pill header looks the same on dark and light pages. */
  tone?: "dark" | "light";
}

export function SiteHeader(_props: SiteHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, isLoading, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    setMobileOpen(false);
    await signOut();
    router.push("/");
  };

  const dashboardHref = profile?.role === "candidate" ? "/candidate/dashboard" : "/dashboard";

  const link = "rounded-full px-3.5 py-2 text-[14px] font-medium text-graphite transition-colors hover:bg-ink/[0.05] hover:text-ink";
  const primaryBtn =
    "inline-flex h-9 items-center gap-1.5 rounded-full bg-ink pl-5 pr-4 text-[14px] font-medium text-white transition-colors hover:bg-ink-2";

  // Floating pill, the same on every page (dark hero or light body).
  return (
    <header className="fixed left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2">
      <div className="flex items-center rounded-full border border-white/60 bg-white/95 px-3 py-2 shadow-lg shadow-black/10 backdrop-blur-md">
        <div className="pl-2 pr-4 md:pr-6">
          <Logo tone="dark" withMark />
        </div>

        {/* Center nav */}
        <nav className="hidden items-center gap-0.5 md:flex" aria-label="Primary">
          {NAV_LINKS.map((l) => {
            const active = pathname?.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href} className={cn(link, active && "text-ink")}>
                {l.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="ml-auto hidden items-center gap-1 md:flex">
          {user ? (
            <>
              <button onClick={handleSignOut} className={link}>
                Sign out
              </button>
              <Link href={dashboardHref} className={primaryBtn}>
                Dashboard <ArrowUpRight className="h-4 w-4" />
              </Link>
            </>
          ) : isLoading ? (
            <div className="h-9 w-28 animate-pulse rounded-full bg-ink/10" />
          ) : (
            <>
              <Link href="/auth/signin" className={link}>
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
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink transition-colors hover:bg-ink/[0.05]"
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
                {NAV_LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setMobileOpen(false)}
                    className="border-b border-stone py-4 font-display text-[28px] leading-none text-ink transition-colors hover:text-brand"
                  >
                    {l.label}
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
