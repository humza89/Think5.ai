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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LogOut,
  LayoutDashboard,
  Briefcase,
  Menu,
  User,
  Settings,
} from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";

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

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: "Admin",
      candidate: "Candidate",
      recruiter: "Recruiter",
      hiring_manager: "Hiring Manager",
    };
    return labels[role] || role;
  };

  const dashboardHref =
    profile?.role === "candidate" ? "/candidate/dashboard" : "/dashboard";
  const profileHref =
    profile?.role === "candidate" ? "/candidate/profile" : "/settings";
  const isRecruiterOrAdmin =
    profile?.role && ["recruiter", "admin"].includes(profile.role);
  const isNonCandidate =
    profile?.role &&
    ["recruiter", "admin", "hiring_manager"].includes(profile.role);

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
          {!isConfigured ? (
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
          ) : isLoading ? (
            <div className="w-20 h-9 bg-gray-100 animate-pulse rounded-full" />
          ) : user ? (
            <>
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                    aria-label="User menu"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                        {profile?.first_name?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:inline text-sm font-medium text-gray-900">
                      {profile?.first_name || "User"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium">
                      {profile?.first_name} {profile?.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {profile?.email}
                    </p>
                    {profile?.role && (
                      <span className="mt-1.5 inline-block px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                        {getRoleLabel(profile.role)}
                      </span>
                    )}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link
                      href={dashboardHref}
                      className="flex items-center gap-2"
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href={profileHref}
                      className="flex items-center gap-2"
                    >
                      <User className="h-4 w-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  {isNonCandidate && (
                    <DropdownMenuItem asChild>
                      <Link
                        href="/settings"
                        className="flex items-center gap-2"
                      >
                        <Settings className="h-4 w-4" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {isRecruiterOrAdmin && (
                    <DropdownMenuItem asChild>
                      <Link href="/jobs" className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4" />
                        Jobs
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="flex items-center gap-2 text-destructive focus:text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
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
          {user && <NotificationBell />}
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

              {/* User info section at top when authenticated */}
              {user && profile && (
                <div className="mt-4 px-4 py-3 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                        {profile.first_name?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {profile.first_name} {profile.last_name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {profile.email}
                      </p>
                    </div>
                  </div>
                  {profile.role && (
                    <span className="mt-2 inline-block px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-500">
                      {getRoleLabel(profile.role)}
                    </span>
                  )}
                </div>
              )}

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

                {!isConfigured || (!isLoading && !user) ? (
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
                ) : user ? (
                  <>
                    <Link
                      href={dashboardHref}
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      Dashboard
                    </Link>
                    <Link
                      href={profileHref}
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <User className="w-4 h-4" />
                      Profile
                    </Link>
                    {isNonCandidate && (
                      <Link
                        href="/settings"
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <Settings className="w-4 h-4" />
                        Settings
                      </Link>
                    )}
                    {isRecruiterOrAdmin && (
                      <Link
                        href="/jobs"
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <Briefcase className="w-4 h-4" />
                        Jobs
                      </Link>
                    )}
                    <div className="my-3 border-t" />
                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors w-full text-left"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </>
                ) : null}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
};

export default Header;
