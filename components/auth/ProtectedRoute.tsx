"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/types/supabase";
import { MfaGate } from "@/components/auth/MfaGate";

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

    if (!user || !profile) {
      router.push("/auth/signin");
      return;
    }

    if (requireEmailVerified && !profile.email_verified) {
      router.push("/auth/verify");
      return;
    }

    if (allowedRoles && !allowedRoles.includes(profile.role)) {
      router.push("/unauthorized");
      return;
    }
  }, [user, profile, isLoading, router, allowedRoles, requireEmailVerified]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return null;
  }

  if (requireEmailVerified && !profile.email_verified) {
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return null;
  }

  // T9: mirror of the server-side MFA policy; a no-op while FF_P0_MFA_ENFORCEMENT is off.
  return <MfaGate>{children}</MfaGate>;
}
