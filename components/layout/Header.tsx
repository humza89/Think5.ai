"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LogOut, Menu } from "lucide-react";
const NAV_LINKS = [
  { href: "/product", label: "Product" },
  { href: "/research", label: "Research" },
  { href: "/contact", label: "Contact" },
];

const Header = () => {
  const router = useRouter();
  const { user, profile, isLoading, isConfigured, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    setMobileOpen(false);
    await signOut();
    router.push("/");
  };

  const dashboardHref =
    profile?.role === "candidate" ? "/candidate/dashboard" : "/dashboard";

  return (
    <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-4xl">
      <div className="flex items-center bg-white/95 backdrop-blur-md rounded-full px-3 py-2 shadow-lg shadow-black/10">
        {/* Logo */}
        <Link href="/" className="flex items-center pl-3 pr-4 md:pr-6">
          <span className="text-xl font-bold text-gray-900">Think5</span>
        </Link>

        {/* Center Nav — desktop only */}
        <div className="hidden md:flex items-center space-x-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors rounded-full hover:bg-gray-100"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right side — desktop */}
        <div className="hidden md:flex items-center gap-2 ml-auto">
          {user ? (
            <>
              <Link href={dashboardHref}>
                <Button className="rounded-full bg-gray-900 text-white hover:bg-gray-800 px-5 h-9 text-sm font-medium">
                  Dashboard
                </Button>
              </Link>
              <button
                onClick={handleSignOut}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Sign out
              </button>
            </>
          ) : isLoading ? (
            <div className="w-20 h-9 bg-gray-200 animate-pulse rounded-full" />
          ) : (
            <>
              <Link
                href="/auth/signin"
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Sign in
              </Link>
              <Link href="/auth/signup">
                <Button className="rounded-full bg-gray-900 text-white hover:bg-gray-800 px-5 h-9 text-sm font-medium">
                  Get Started
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile: notification + hamburger */}
        <div className="flex md:hidden items-center gap-1 ml-auto">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle className="text-left text-lg font-bold">
                  Think5
                </SheetTitle>
              </SheetHeader>

              <div className="flex flex-col gap-1 mt-6">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}

                <div className="my-3 border-t" />

                {user ? (
                  <>
                    <Link
                      href={dashboardHref}
                      onClick={() => setMobileOpen(false)}
                      className="px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      Dashboard
                    </Link>
                    <div className="my-3 border-t" />
                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors w-full text-left"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/auth/signin"
                      onClick={() => setMobileOpen(false)}
                      className="px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/auth/signup"
                      onClick={() => setMobileOpen(false)}
                      className="mt-2"
                    >
                      <Button className="w-full rounded-lg bg-gray-900 text-white hover:bg-gray-800 h-10 text-sm font-medium">
                        Get Started
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
};

export default Header;
