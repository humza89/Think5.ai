"use client";

import { LogoMark } from "@/components/brand/LogoMark";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardSidebar } from "./DashboardSidebar";
import { DashboardTopBar } from "./DashboardTopBar";
import { MobileSidebar } from "./MobileSidebar";
import { apiFetch } from "@/lib/api-client";

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
        const res = await apiFetch("/api/recruiter/onboarding");
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
          <LogoMark size={32} className="mx-auto mb-3" />
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
