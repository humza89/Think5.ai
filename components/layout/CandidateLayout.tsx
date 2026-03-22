"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CandidateSidebar } from "./CandidateSidebar";
import { CandidateTopBar } from "./CandidateTopBar";
import { CandidateMobileSidebar } from "./CandidateMobileSidebar";

export function CandidateLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem("candidate-sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  // Onboarding redirect logic
  useEffect(() => {
    async function checkOnboarding() {
      try {
        const res = await fetch("/api/candidate/onboarding");
        if (!res.ok) {
          setOnboardingChecked(true);
          return;
        }
        const data = await res.json();
        const isOnboardingPage = pathname === "/candidate/onboarding";
        const statusPage = "/candidate/onboarding/status";
        const allowedPaths = ["/candidate/onboarding", statusPage, "/candidate/settings", "/candidate/policy"];
        const isAllowedPath = allowedPaths.some((p) => pathname.startsWith(p));

        if (!data.completed && !isOnboardingPage) {
          router.replace("/candidate/onboarding");
          return;
        }

        // Gate unapproved candidates to status page
        if (data.completed && data.onboardingStatus && data.onboardingStatus !== "APPROVED" && !isAllowedPath) {
          router.replace(statusPage);
          return;
        }

        // Redirect approved candidates away from status page
        if (data.onboardingStatus === "APPROVED" && pathname === statusPage) {
          router.replace("/candidate/dashboard");
          return;
        }

        if (data.completed && data.onboardingStatus === "APPROVED" && isOnboardingPage) {
          router.replace("/candidate/dashboard");
          return;
        }
      } catch {
        // Fail-closed: redirect to sign in if onboarding check fails
        router.replace("/auth/signin");
        return;
      }
      setOnboardingChecked(true);
    }

    checkOnboarding();
  }, [pathname, router]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("candidate-sidebar-collapsed", String(next));
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
      <CandidateSidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      <CandidateMobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <CandidateTopBar onMenuClick={() => setMobileOpen(true)} />
        <main id="main-content" className="flex-1 overflow-y-auto">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
