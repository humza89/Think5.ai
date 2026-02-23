"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, User, LayoutDashboard, Briefcase } from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";

const Header = () => {
  const router = useRouter();
  const { user, profile, isLoading, isConfigured, signOut } = useAuth();

  const handleSignOut = async () => {
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

  return (
    <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center bg-white/95 backdrop-blur-md rounded-full px-3 py-2 shadow-lg shadow-black/10">
        {/* Logo - Left */}
        <Link href="/" className="flex items-center pl-3 pr-6">
          <span className="text-xl font-bold text-gray-900">think5</span>
          <span className="text-xl font-bold text-blue-500">.</span>
        </Link>

        {/* Center Nav */}
        <div className="hidden md:flex items-center space-x-1">
          <Link href="/product" className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors rounded-full hover:bg-gray-100">
            Product
          </Link>
          <Link href="/research" className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors rounded-full hover:bg-gray-100">
            Research
          </Link>
          <Link href="/contact" className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors rounded-full hover:bg-gray-100">
            Contact
          </Link>
        </div>

        {/* Right CTAs - Dynamic based on auth state */}
        <div className="flex items-center gap-2 pl-4">
          {!isConfigured ? (
            // Show sign in/up buttons when Supabase is not configured
            <>
              <Link href="/auth/signin" className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
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
              {profile && (
                <span className="hidden md:block px-3 py-1 text-xs text-gray-500 bg-gray-100 rounded-full">
                  {getRoleLabel(profile.role)}
                </span>
              )}
              <Link href={profile?.role === "candidate" ? "/candidate/dashboard" : "/dashboard"}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                >
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                  Dashboard
                </Button>
              </Link>
              {profile?.role && ["recruiter", "admin"].includes(profile.role) && (
                <Link href="/jobs">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  >
                    <Briefcase className="w-4 h-4 mr-2" />
                    Jobs
                  </Button>
                </Link>
              )}
              <NotificationBell />
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors rounded-full hover:bg-gray-100"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden md:inline">Sign out</span>
              </button>
            </>
          ) : (
            <>
              <Link href="/auth/signin" className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
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
      </div>
    </nav>
  );
};

export default Header;
