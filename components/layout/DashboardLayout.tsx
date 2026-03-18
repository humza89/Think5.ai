"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardSidebar } from "./DashboardSidebar";
import { DashboardTopBar } from "./DashboardTopBar";
import { MobileSidebar } from "./MobileSidebar";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const { profile } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Restore sidebar state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  // Recruiter onboarding gate
  useEffect(() => {
    async function checkRecruiterOnboarding() {
      // Only gate recruiters — admins and hiring managers skip
      if (!profile || profile.role !== "recruiter") {
        setOnboardingChecked(true);
        return;
      }

      try {
        const res = await fetch("/api/recruiter/onboarding");
        if (!res.ok) {
          // Fail-closed: block access if onboarding status can't be verified
          router.replace("/auth/signin");
          return;
        }

        const data = await res.json();
        const isOnboardingPage = pathname.startsWith("/recruiter/onboarding");

        if (!data.completed && !isOnboardingPage) {
          router.replace("/recruiter/onboarding");
          return;
        }

        if (data.completed && isOnboardingPage) {
          router.replace("/dashboard");
          return;
        }
      } catch {
        // Fail-closed: redirect to sign in if check fails
        router.replace("/auth/signin");
        return;
      }

      setOnboardingChecked(true);
    }

    checkRecruiterOnboarding();
  }, [pathname, router, profile]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  };

  if (!onboardingChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-bold text-sm">T5</span>
          </div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <DashboardSidebar collapsed={collapsed} onToggle={toggleCollapsed} />

      {/* Mobile sidebar */}
      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar onMenuClick={() => setMobileOpen(true)} />
        <main id="main-content" className="flex-1 overflow-y-auto">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
