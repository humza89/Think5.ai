"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function ClientsLayout({
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
