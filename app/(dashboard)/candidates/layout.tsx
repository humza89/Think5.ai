"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function CandidatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute allowedRoles={["recruiter", "admin"]}>
      {children}
    </ProtectedRoute>
  );
}
