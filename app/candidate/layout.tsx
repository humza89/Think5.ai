"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function CandidateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute allowedRoles={["candidate"]}>
      {children}
    </ProtectedRoute>
  );
}
