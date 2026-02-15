"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/types/supabase";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  requireEmailVerified?: boolean;
}

export function ProtectedRoute({
  children,
  allowedRoles,
  requireEmailVerified = true,
}: ProtectedRouteProps) {
  const { user, profile, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.push("/auth/signin");
      return;
    }

    if (requireEmailVerified && profile && !profile.email_verified) {
      router.push("/auth/verify");
      return;
    }

    if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
      router.push("/unauthorized");
      return;
    }
  }, [user, profile, isLoading, router, allowedRoles, requireEmailVerified]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-white/60">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (requireEmailVerified && profile && !profile.email_verified) {
    return null;
  }

  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
    return null;
  }

  return <>{children}</>;
}
